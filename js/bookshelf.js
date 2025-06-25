import { elements } from './dom.js';
import { getDB, BOOK_STORE_NAME, LIST_STORE_NAME } from './db.js';
import { createPlaceholderCover } from './utils.js';
import { YUKI_EVENTS } from './events.js';

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

export function handleCreateList() {
    const listName = prompt("请输入新列表的名称：");
    if (listName && listName.trim()) {
        const db = getDB();
        db.transaction(LIST_STORE_NAME, 'readwrite').objectStore(LIST_STORE_NAME).add({ name: listName.trim() }).onsuccess = () => {
            loadLists();
        };
    }
}

async function handleDeleteList(listId, listName) {
    if (!confirm(`确定要删除列表 "${listName}" 吗？\n（列表中的书籍将会被移至“全部书籍”）`)) return;

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

    const filteredBooks = books.filter(book => !searchTerm || book.title.toLowerCase().includes(searchTerm));

    elements.bookshelfDiv.innerHTML = '';
    document.querySelectorAll('.book-item img[src^="blob:"]').forEach(img => URL.revokeObjectURL(img.src));
    const fragment = document.createDocumentFragment();

    for (const bookData of filteredBooks) {
        const coverUrl = URL.createObjectURL(bookData.cover);
        const bookItem = document.createElement('div');
        bookItem.className = 'book-item';
        bookItem.innerHTML = `
            <img src="${coverUrl}" alt="${bookData.title}">
            <p class="book-title" title="${bookData.title}">${bookData.title}</p>
            <div class="button-group">
                <button class="move-book book-action-btn" title="移动到列表">☰</button>
                <button class="delete-book book-action-btn" title="删除书籍">×</button>
            </div>
        `;
        bookItem.querySelector('img').addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, {
                detail: {
                    view: 'reader',
                    bookId: bookData.id
                }
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
    elements.bookshelfDiv.appendChild(fragment);
}

export async function handleFileUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    elements.loadingIndicator.textContent = `开始处理 ${files.length} 个文件...`;
    elements.loadingIndicator.classList.remove('hidden');

    const bookDataPromises = files.map(async (file) => {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const title = file.name.replace(/\.[^/.]+$/, "");

        try {
            if (fileExtension === 'epub') {
                const book = ePub(file);
                await book.ready;
                const metadata = book.packaging.metadata;
                const coverUrl = await book.coverUrl();
                const coverBlob = coverUrl ? await (await fetch(coverUrl)).blob() : await createPlaceholderCover(title);
                return { title: metadata.title || title, file, cover: coverBlob, listId: currentListId, type: 'epub' };
            } else if (fileExtension === 'pdf') {
                const coverBlob = await createPlaceholderCover(title);
                return { title, file, cover: coverBlob, listId: currentListId, type: 'pdf' };
            } else {
                return null;
            }
        } catch (error) {
            console.error(`处理文件 "${file.name}" 失败:`, error);
            return null;
        }
    });

    const allBookData = (await Promise.all(bookDataPromises)).filter(Boolean);
    if (allBookData.length === 0) {
        elements.loadingIndicator.classList.add('hidden');
        return alert("没有有效文件被处理。");
    }

    const db = getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    allBookData.forEach(bookData => transaction.objectStore(BOOK_STORE_NAME).add(bookData));
    transaction.oncomplete = () => {
        loadBookshelf(currentListId);
        elements.loadingIndicator.classList.add('hidden');
        elements.bookUploadInput.value = '';
    };
}

function deleteBook(bookId) {
    if (!confirm('确定要从书架删除这本书吗？')) return;
    const db = getDB();
    db.transaction(BOOK_STORE_NAME, 'readwrite').objectStore(BOOK_STORE_NAME).delete(bookId).onsuccess = () => loadBookshelf();
}

export function handleClearAllBooks() {
    if (!confirm('警告：此操作将永久删除书库中的所有书籍！确定要继续吗？')) return;
    const db = getDB();
    db.transaction(BOOK_STORE_NAME, 'readwrite').objectStore(BOOK_STORE_NAME).clear().onsuccess = () => {
        alert('书库已清空。');
        loadBookshelf();
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