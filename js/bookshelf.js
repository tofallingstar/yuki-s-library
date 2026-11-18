import { elements } from './dom.js';
import { getDB, BOOK_STORE_NAME, LIST_STORE_NAME } from './db.js';
import { createPlaceholderCover } from './utils.js';
import { YUKI_EVENTS } from './events.js';
import { toast, promptDialog, confirmDialog } from './ui.js';
import { commandPalette } from './command-palette.js';

let currentListId = null;

export function initBookshelf() {
}

export function switchToBookshelfView() {
    elements.readerView.classList.add('hidden');
    elements.bookshelfView.classList.remove('hidden');
    elements.clearAllBooksBtn.classList.remove('hidden');
    elements.navigationSidebar.classList.remove('disabled');
}

export async function loadLists() {
    const db = getDB();
    const lists = await new Promise(resolve => {
        db.transaction(LIST_STORE_NAME, 'readonly').objectStore(LIST_STORE_NAME).getAll().onsuccess = e => resolve(e.target.result || []);
    });

    const existingItems = elements.listsSubmenu.querySelectorAll('li:not(.create-list-item)');
    existingItems.forEach(item => item.remove());

    const fragment = document.createDocumentFragment();
    lists.forEach(list => {
        const li = document.createElement('li');
        li.dataset.listId = list.id;
        li.addEventListener('click', () => loadBookshelf(list.id));
        const listNameSpan = document.createElement('span');
        listNameSpan.textContent = list.name;
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-list-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '删除列表';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeleteList(list.id, list.name);
        });
        li.appendChild(listNameSpan);
        li.appendChild(deleteBtn);
        fragment.appendChild(li);
    });
    elements.listsSubmenu.prepend(fragment);
    updateActiveListUI();
}

export async function handleCreateList() {
    const listName = await promptDialog({
        title: '新建列表',
        placeholder: '例如：轻小说 / 专业课 / 在读',
        confirmText: '创建',
    });
    if (!listName) return;
    const db = getDB();
    db.transaction(LIST_STORE_NAME, 'readwrite').objectStore(LIST_STORE_NAME).add({ name: listName }).onsuccess = () => {
        loadLists();
        toast(`列表「${listName}」已创建`, 'success');
    };
}

async function handleDeleteList(listId, listName) {
    const ok = await confirmDialog({
        title: '删除列表',
        message: `确定要删除列表「${listName}」吗？列表中的书籍会被移到「全部书籍」，不会丢书。`,
        confirmText: '删除列表',
        danger: true,
    });
    if (!ok) return;

    const db = getDB();
    const bookTransaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const bookStore = bookTransaction.objectStore(BOOK_STORE_NAME);
    const listIdIndex = bookStore.index('listId');
    const request = listIdIndex.getAll(listId);

    request.onsuccess = () => {
        request.result.forEach(book => {
            book.listId = null;
            bookStore.put(book);
        });
    };
    bookTransaction.oncomplete = () => {
        const listTransaction = db.transaction(LIST_STORE_NAME, 'readwrite');
        listTransaction.objectStore(LIST_STORE_NAME).delete(listId);
        listTransaction.oncomplete = () => {
            if (currentListId === listId) loadBookshelf(null);
            loadLists();
        };
    };
}

async function showListSelectionMenu(buttonElement, bookId) {
    document.querySelector('.list-selection-menu')?.remove();
    const db = getDB();
    const lists = await new Promise(resolve => {
        db.transaction(LIST_STORE_NAME, 'readonly').objectStore(LIST_STORE_NAME).getAll().onsuccess = e => resolve(e.target.result || []);
    });
    if (lists.length === 0) {
        alert("还没有创建任何列表！");
        return;
    }
    const menu = document.createElement('ul');
    menu.className = 'list-selection-menu';
    if (document.body.classList.contains('dark-mode')) {
        menu.classList.add('yuki-panel');
    }
    lists.forEach(list => {
        const li = document.createElement('li');
        li.textContent = list.name;
        li.dataset.listId = list.id;
        li.onclick = () => {
            moveBookToList(bookId, list.id);
            menu.remove();
        };
        menu.appendChild(li);
    });
    const liRemove = document.createElement('li');
    liRemove.textContent = "移出列表 (到'全部')";
    liRemove.style.borderTop = "1px solid #eee";
    liRemove.style.marginTop = "5px";
    liRemove.onclick = () => {
        moveBookToList(bookId, null);
        menu.remove();
    };
    menu.appendChild(liRemove);

    const mainContent = document.querySelector('.main-content');
    mainContent.appendChild(menu);

    const btnRect = buttonElement.getBoundingClientRect();
    const mainRect = mainContent.getBoundingClientRect();

    const scrollTop = mainContent.scrollTop;
    menu.style.left = `${btnRect.left - mainRect.left}px`;
    menu.style.top = `${btnRect.bottom - mainRect.top + scrollTop}px`;

    setTimeout(() => {
        const clickHandler = (event) => {
            if (!menu.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', clickHandler);
            }
        };
        document.addEventListener('click', clickHandler);
    }, 0);
}

async function moveBookToList(bookId, targetListId) {
    const db = getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BOOK_STORE_NAME);
    const request = store.get(bookId);
    request.onsuccess = () => {
        const bookData = request.result;
        if (bookData) {
            bookData.listId = targetListId;
            store.put(bookData);
        }
    };
    transaction.oncomplete = () => {
        loadBookshelf(currentListId);
    };
}

function updateActiveListUI() {
    elements.listsSubmenu.querySelectorAll('li').forEach(li => {
        const liListId = li.dataset.listId ? parseInt(li.dataset.listId, 10) : undefined;
        li.classList.toggle('active-list', liListId !== undefined && liListId === currentListId);
    });
    elements.navBookshelf.classList.toggle('active', currentListId === null);
}

export async function loadBookshelf(listId = currentListId) {
    currentListId = listId;
    const searchTerm = elements.searchBar.value.toLowerCase();
    updateActiveListUI();

    const db = getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BOOK_STORE_NAME);

    let request;
    if (listId !== null) {
        const index = store.index('listId');
        request = index.getAll(listId);
    } else {
        request = store.getAll();
    }

    const books = await new Promise((resolve, reject) => {
        request.onsuccess = e => resolve(e.target.result || []);
        request.onerror = e => reject(e.target.error);
    });

    const filteredBooks = books
        .filter(book => !searchTerm || book.title.toLowerCase().includes(searchTerm))
        // 最近在读的排前面，没读过的按加入顺序
        .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0) || (b.id || 0) - (a.id || 0));

    elements.bookshelfDiv.innerHTML = '';
    document.querySelectorAll('.book-item img[src^="blob:"]').forEach(img => URL.revokeObjectURL(img.src));
    const fragment = document.createDocumentFragment();

    for (const bookData of filteredBooks) {
        const coverUrl = URL.createObjectURL(bookData.cover);
        const percent = Math.round((bookData.progressPercent || 0) * 100);
        const started = Boolean(bookData.progressCfi);
        const metaText = started
            ? (percent > 0 ? `已读 ${percent}% · 继续阅读` : '继续阅读')
            : '未读';
        const bookItem = document.createElement('div');
        bookItem.className = 'book-item';
        bookItem.innerHTML = `
            <img src="${coverUrl}" alt="${bookData.title}" loading="lazy">
            <p class="book-title" title="${bookData.title}">${bookData.title}</p>
            <div class="book-progress" title="${started ? `已读 ${percent}%` : '还没开始读'}">
                <div class="book-progress-bar" style="width:${Math.min(100, Math.max(0, percent))}%"></div>
            </div>
            <p class="book-meta">${metaText}</p>
            <div class="button-group">
                <button class="move-book book-action-btn" title="移动到列表">☰</button>
                <button class="delete-book book-action-btn" title="删除书籍">×</button>
            </div>
        `;
        bookItem.querySelector('img').addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, {
                detail: { view: 'reader', bookId: bookData.id },
            }));
        });
        bookItem.querySelector('.delete-book').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBook(bookData.id);
        });
        bookItem.querySelector('.move-book').addEventListener('click', (e) => {
            e.stopPropagation();
            showListSelectionMenu(e.currentTarget, bookData.id);
        });
        fragment.appendChild(bookItem);
    }
    const addBookCard = document.createElement('div');
    addBookCard.className = 'add-book-card';
    addBookCard.innerHTML = `<span class="plus-sign">+</span>`;
    addBookCard.addEventListener('click', () => elements.bookUploadInput.click());
    fragment.appendChild(addBookCard);

    if (filteredBooks.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'bookshelf-empty';
        empty.textContent = searchTerm
            ? `没有找到书名包含「${elements.searchBar.value.trim()}」的书`
            : '书架还是空的：把 .epub 文件拖进页面，或点上面的 + 导入第一本书';
        fragment.appendChild(empty);
    }

    elements.bookshelfDiv.appendChild(fragment);
}

export async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const epubFiles = files.filter(file => file.name.toLowerCase().endsWith('.epub'));
    const rejected = files.filter(file => !file.name.toLowerCase().endsWith('.epub'));
    if (rejected.length > 0) {
        toast(`跳过 ${rejected.length} 个非 ePub 文件：${rejected.map(f => f.name).join('、').slice(0, 60)}`, 'warn', 4200);
    }
    if (epubFiles.length === 0) {
        elements.bookUploadInput.value = '';
        return;
    }

    elements.loadingIndicator.textContent = `开始处理 ${epubFiles.length} 个文件...`;
    elements.loadingIndicator.classList.remove('hidden');

    const bookDataPromises = epubFiles.map(async (file) => {
        const title = file.name.replace(/\.[^/.]+$/, '');
        try {
            const book = ePub(file);
            await book.ready;
            const metadata = book.packaging.metadata;
            const coverUrl = await book.coverUrl();
            const coverBlob = coverUrl ? await (await fetch(coverUrl)).blob() : await createPlaceholderCover(title);
            return {
                title: metadata.title || title,
                file,
                cover: coverBlob,
                listId: currentListId,
                type: 'epub',
                progressCfi: null,
                progressPercent: 0,
                addedAt: Date.now(),
                lastReadAt: 0,
            };
        } catch (error) {
            console.error(`处理文件 "${file.name}" 失败:`, error);
            toast(`《${title}》解析失败，可能不是有效的 ePub`, 'error', 4200);
            return null;
        }
    });

    const allBookData = (await Promise.all(bookDataPromises)).filter(Boolean);
    if (allBookData.length === 0) {
        elements.loadingIndicator.classList.add('hidden');
        elements.bookUploadInput.value = '';
        return;
    }

    const db = getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    allBookData.forEach(bookData => transaction.objectStore(BOOK_STORE_NAME).add(bookData));
    transaction.oncomplete = async () => {
        loadBookshelf(currentListId);
        refreshBookCommands();
        elements.loadingIndicator.classList.add('hidden');
        elements.bookUploadInput.value = '';
        toast(`已加入书架：${allBookData.map(b => `《${b.title}》`).join('、').slice(0, 80)}`, 'success');
    };
    transaction.onerror = (error) => {
        console.error('导入书籍失败:', error);
        elements.loadingIndicator.classList.add('hidden');
        elements.bookUploadInput.value = '';
        toast('导入失败：浏览器存储空间可能已满', 'error', 4200);
    };
}

/** 把书架上的书注册进命令面板（Ctrl+K 可直接打开） */
export async function refreshBookCommands() {
    const books = await getAllBooksForSearch();
    books.forEach(book => {
        commandPalette.register({
            id: `book.open.${book.id}`,
            name: `打开书籍: ${book.title}`,
            action: () => document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, {
                detail: { view: 'reader', bookId: book.id },
            })),
        });
    });
}

async function deleteBook(bookId) {
    const ok = await confirmDialog({
        title: '删除书籍',
        message: '确定要从书架删除这本书吗？阅读进度会一起删除。',
        confirmText: '删除',
        danger: true,
    });
    if (!ok) return;
    const db = getDB();
    db.transaction(BOOK_STORE_NAME, 'readwrite').objectStore(BOOK_STORE_NAME).delete(bookId).onsuccess = () => {
        loadBookshelf();
        toast('已从书架删除', 'info');
    };
}

export async function handleClearAllBooks() {
    const ok = await confirmDialog({
        title: '清空书库',
        message: '警告：此操作将永久删除书库中的所有书籍和阅读进度，且无法恢复。',
        confirmText: '确认清空',
        danger: true,
    });
    if (!ok) return;
    const db = getDB();
    db.transaction(BOOK_STORE_NAME, 'readwrite').objectStore(BOOK_STORE_NAME).clear().onsuccess = () => {
        loadBookshelf();
        toast('书库已清空', 'info');
    };
}

export async function getAllBooksForSearch() {
    const db = getDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(BOOK_STORE_NAME, 'readonly');
        const store = transaction.objectStore(BOOK_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const books = request.result || [];
            const booklist = books.map(book => ({
                id: book.id,
                title: book.title
            }));
            resolve(booklist);
        };
        request.onerror = () => {
            resolve([]);
        };
    });
}