import { elements } from './dom.js';
import { getDB, BOOK_STORE_NAME } from './db.js';
import { YUKI_EVENTS } from './events.js';


let rendition = null;
let currentBook = null;
let currentFontSize = 16;
let readingSpeedTracker = { locations: [], wpm: 200, };
let toc = [];

// DOM 元素引用
const tocPanel = document.getElementById('toc-panel');
const tocList = document.getElementById('toc-list');
const tocOpenBtn = document.getElementById('toc-open-btn');
const tocCloseBtn = document.getElementById('toc-close-btn');
const tocSearchInput = document.getElementById('toc-search-input');
const tocSearchResultsContainer = document.getElementById('toc-search-results-container');
const tocSearchResultsList = document.getElementById('toc-search-results-list');
const tocBackToNavBtn = document.getElementById('toc-back-to-nav-btn');
const tocSearchingIndicator = document.getElementById('toc-searching-indicator');


// 搜索的函数
async function searchBookContent(query) {
    if (!currentBook || !query) return;

    // 1. 更新UI，进入搜索状态
    tocSearchingIndicator.classList.remove('hidden');
    tocList.classList.add('hidden'); // 隐藏原目录列表
    tocSearchResultsContainer.classList.remove('hidden');
    tocSearchResultsList.innerHTML = '';

    try {
        // 2. 使用 ePub.js 的搜索功能，并行搜索所有章节
        const searchPromises = currentBook.spine.spineItems.map(item =>
            item.load(currentBook.load.bind(currentBook))
                .then(() => item.find(query))
                .finally(() => item.unload()) // 搜索完后卸载章节以释放内存
        );

        const results = await Promise.all(searchPromises);
        const allMatches = results.flat(); // 将多维数组拍平成一维

        // 3. 处理并展示搜索结果
        tocSearchingIndicator.classList.add('hidden');

        if (allMatches.length === 0) {
            tocSearchResultsList.innerHTML = '<li class="no-results">在书中未找到任何结果。</li>';
            return;
        }
        
        const fragment = document.createDocumentFragment();
        allMatches.forEach(match => {
            const li = document.createElement('li');
            li.className = 'search-result-item';
            li.dataset.cfi = match.cfi; // 存储精确的CFI位置
            
            // 高亮关键词
            const highlightedExcerpt = match.excerpt.replace(
                new RegExp(query, 'gi'),
                (found) => `<span class="search-highlight">${found}</span>`
            );
            li.innerHTML = `...${highlightedExcerpt}...`;

            li.addEventListener('click', () => {
                rendition.display(match.cfi);
                tocPanel.classList.remove('open'); // 跳转后自动关闭面板
            });
            fragment.appendChild(li);
        });
        tocSearchResultsList.appendChild(fragment);

    } catch (error) {
        console.error("全书搜索失败:", error);
        tocSearchingIndicator.classList.add('hidden');
        tocSearchResultsList.innerHTML = '<li class="no-results">搜索时发生错误。</li>';
    }
}

function buildTocHtml(tocItems) {
    let html = '<ul>';
    tocItems.forEach(item => {
        html += `<li id="toc-${item.id}">`;
        html += `<a href="${item.href}">${item.label.trim()}</a>`;
        if (item.subitems && item.subitems.length > 0) {
            html += buildTocHtml(item.subitems);
        }
        html += '</li>';
    });
    html += '</ul>';
    return html;
}

function renderToc() {
    if (!currentBook || !currentBook.navigation) return;
    toc = currentBook.navigation.toc;
    tocList.innerHTML = buildTocHtml(toc);
    tocList.querySelectorAll('a').forEach(anchor => {
        anchor.addEventListener('click', (event) => {
            event.preventDefault();
            const href = anchor.getAttribute('href');
            rendition.display(href);
            tocPanel.classList.remove('open');
        });
    });
}

function highlightCurrentToc(location) {
    if (!location || !location.start) return;
    const currentHref = location.start.href;
    tocList.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));
    const activeAnchor = tocList.querySelector(`a[href="${currentHref}"]`);
    if (activeAnchor) {
        let currentElement = activeAnchor.parentElement;
        while(currentElement && currentElement.tagName === 'LI') {
            currentElement.classList.add('active');
            currentElement = currentElement.parentElement.parentElement;
        }
    }
}

function filterToc() {
    const query = tocSearchInput.value.toLowerCase();
    tocList.querySelectorAll('a').forEach(anchor => {
        const li = anchor.closest('li');
        const text = anchor.textContent.toLowerCase();
        li.style.display = text.includes(query) ? '' : 'none';
    });
}

function resetReadingSpeedTracker() { readingSpeedTracker.locations = []; }
function updateReadingSpeed(location) { const now = Date.now(); readingSpeedTracker.locations.push({ cfi: location.start.cfi, time: now }); if (readingSpeedTracker.locations.length > 10) { readingSpeedTracker.locations.shift(); } }
async function updateInfoPanel(location) { if (!location || !location.start || !rendition || !currentBook?.locations.total) { elements.infoChapter.querySelector('.info-value').textContent = '--'; elements.infoPagination.querySelector('.info-value').textContent = '-- / --'; elements.infoChapterProgress.querySelector('.info-value').textContent = '--%'; elements.infoProgress.querySelector('.info-value').textContent = '--%'; elements.infoTimeLeft.querySelector('.info-value').textContent = '-- min'; return; } const locations = currentBook.locations; const totalPages = locations.total; const currentPage = locations.locationFromCfi(location.start.cfi); elements.infoPagination.querySelector('.info-value').textContent = `${currentPage} / ${totalPages}`; const chapter = rendition.book.navigation.get(location.start.href); elements.infoChapter.querySelector('.info-value').textContent = chapter ? chapter.label.trim() : `Section ${location.start.index}`; const bookProgress = locations.percentageFromCfi(location.start.cfi); elements.infoProgress.querySelector('.info-value').textContent = `${Math.round(bookProgress * 100)}%`; if (chapter && chapter.href) { const chapterStartCfi = rendition.book.navigation.get(chapter.href).cfi; const nextChapter = rendition.book.spine.get(chapter.index + 1); const chapterEndCfi = nextChapter ? nextChapter.cfi : locations.cfiFromLocation(totalPages); if (chapterStartCfi && chapterEndCfi) { const chapterStartPercentage = locations.percentageFromCfi(chapterStartCfi); const chapterEndPercentage = locations.percentageFromCfi(chapterEndCfi); const chapterTotalPercentage = chapterEndPercentage - chapterStartPercentage; if (chapterTotalPercentage > 0) { const chapterProgress = (bookProgress - chapterStartPercentage) / chapterTotalPercentage; elements.infoChapterProgress.querySelector('.info-value').textContent = `${Math.round(chapterProgress * 100)}%`; } } } const wordsLeft = (1 - bookProgress) * (totalPages * 250); const minutesLeft = Math.round(wordsLeft / readingSpeedTracker.wpm); elements.infoTimeLeft.querySelector('.info-value').textContent = `${minutesLeft} min`; }
function saveReadingProgress(bookId, cfi, locationsData = null) { const db = getDB(); const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite'); const store = transaction.objectStore(BOOK_STORE_NAME); const request = store.get(bookId); request.onsuccess = () => { const bookData = request.result; if (bookData) { bookData.progressCfi = cfi; if (locationsData) bookData.locations = locationsData; store.put(bookData); } }; transaction.onerror = (e) => console.error("保存进度/locations失败:", e.target.error); }
function injectReaderStyles(view) { if (!view || !view.document) return; const doc = view.document; doc.getElementById('yuki-reader-styles')?.remove(); const style = doc.createElement('style'); style.id = 'yuki-reader-styles'; style.innerHTML = ` img, svg, image { max-width: 100% !important; height: auto !important; object-fit: contain; display: block; margin: 1.5em auto !important; } `; doc.head.appendChild(style); }
function forceApplyStyles(view) { const doc = view.document; if (!doc || !doc.body) return; const isDarkMode = document.body.classList.contains('dark-mode'); const isJohnSmith = document.body.classList.contains('john-smith-mode'); let color, fontFamily, textShadow; if (isJohnSmith) { color = '#e6e6fa'; fontFamily = "'Courier Prime', 'Courier New', monospace"; textShadow = '0 0 5px rgba(200, 162, 200, 0.3)'; } else if (isDarkMode) { color = '#00ffcc'; fontFamily = "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace"; textShadow = '0 0 5px rgba(0, 255, 204, 0.3)'; } else { const allElements = doc.body.querySelectorAll('*'); allElements.forEach(el => { el.style.removeProperty('color'); el.style.removeProperty('font-family'); el.style.removeProperty('background-color'); el.style.removeProperty('background'); el.style.removeProperty('text-shadow'); }); return; } const allElements = doc.body.querySelectorAll('*'); allElements.forEach(el => { el.style.setProperty('color', color, 'important'); el.style.setProperty('font-family', fontFamily, 'important'); el.style.setProperty('background-color', 'transparent', 'important'); el.style.setProperty('background', 'transparent', 'important'); el.style.setProperty('text-shadow', textShadow, 'important'); }); }
function updateRenditionThemes(themeName) { if (!rendition) return; let rules = { '*': { 'background': 'transparent !important', 'background-color': 'transparent !important', } }; rendition.themes.override('yuki-style', rules); rendition.themes.select('yuki-style'); }
let analysisPanel = { panel: document.getElementById('word-frequency-panel'), content: document.getElementById('word-frequency-content'), closeBtn: document.querySelector('#word-frequency-panel .panel-close-btn'), isTyping: false, typingInterval: null, };
if (analysisPanel.closeBtn) { analysisPanel.closeBtn.addEventListener('click', () => { analysisPanel.panel.classList.add('hidden'); if (analysisPanel.typingInterval) { clearInterval(analysisPanel.typingInterval); analysisPanel.isTyping = false; } }); }
function analyzeWordFrequency(text) { const words = text.match(/[\u4e00-\u9fa5]+|\b[a-zA-Z]{2,}\b/g) || []; const frequencies = {}; const commonWords = new Set(['的', '了', '在', '是', '我', '你', '他', '她', '它', '和', '与', '或', '但', '也', '不', '着', '个', '我们', '你们', '他们', '这个', '那个', '一个', '什么', '怎么', '因为', '所以', '但是', '如果', '就', '都', '还', '说', '自己', '可以','the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me']); for (const word of words) { const lowerCaseWord = word.toLowerCase(); if (!commonWords.has(lowerCaseWord)) { frequencies[lowerCaseWord] = (frequencies[lowerCaseWord] || 0) + 1; } } return Object.entries(frequencies).sort((a, b) => b[1] - a[1]); }
export async function showWordFrequencyPanel() { if (!rendition || analysisPanel.isTyping) return; document.dispatchEvent(new CustomEvent('log-event', { detail: { message: `Executing text analysis...`, type: 'system' } })); const currentSection = await rendition.currentLocation(); const section = rendition.book.spine.get(currentSection.start.href); if (!section) return; const contents = await section.load(); const text = contents.textContent || ''; const wordFrequencies = analyzeWordFrequency(text).slice(0, 30); const isDarkMode = document.body.classList.contains('dark-mode'); analysisPanel.panel.className = isDarkMode ? 'yuki-panel' : 'day-panel'; analysisPanel.panel.id = 'word-frequency-panel'; analysisPanel.content.innerHTML = ''; analysisPanel.panel.classList.remove('hidden'); analysisPanel.isTyping = true; let lineIndex = 0; analysisPanel.typingInterval = setInterval(() => { if (lineIndex < wordFrequencies.length) { const [word, count] = wordFrequencies[lineIndex]; const p = document.createElement('p'); p.innerHTML = `<span class="word">${word}</span><span class="filler"></span><span class="count">${count}</span>`; analysisPanel.content.appendChild(p); analysisPanel.content.scrollTop = analysisPanel.content.scrollHeight; lineIndex++; } else { clearInterval(analysisPanel.typingInterval); analysisPanel.isTyping = false; document.dispatchEvent(new CustomEvent('log-event', { detail: { message: `Analysis complete.`, type: 'system' } })); } }, 100); }

export function initReader() {
    elements.backToShelfBtn.addEventListener('click', backToShelf);
    tocOpenBtn.addEventListener('click', () => tocPanel.classList.add('open'));
    tocCloseBtn.addEventListener('click', () => {
        // 关闭时重置回目录视图
        tocSearchResultsContainer.classList.add('hidden');
        tocList.classList.remove('hidden');
        tocPanel.classList.remove('open');
    });

    // 返回按钮的逻辑
    tocBackToNavBtn.addEventListener('click', () => {
        tocSearchResultsContainer.classList.add('hidden');
        tocList.classList.remove('hidden');
    });

    // 实时筛选章节标题 (原功能保留)
    tocSearchInput.addEventListener('input', filterToc);

    // 按下 Enter 键触发全书内容搜索 (新功能)
    tocSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // 防止表单提交等默认行为
            const query = tocSearchInput.value.trim();
            if (query) {
                searchBookContent(query);
            }
        }
    });
}

function switchToReaderView() {
    elements.bookshelfView.classList.add('hidden');
    elements.readerView.classList.remove('hidden');
    elements.clearAllBooksBtn.classList.add('hidden');
}

export function backToShelf() {
    document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, {
        detail: { view: 'bookshelf' }
    }));
}

export async function openEpub(bookId) {
    elements.loadingIndicator.textContent = '正在打开书籍...';
    elements.loadingIndicator.classList.remove('hidden');
    destroyRendition();
    const db = getDB();
    const request = db.transaction(BOOK_STORE_NAME, 'readonly').objectStore(BOOK_STORE_NAME).get(bookId);
    request.onerror = (e) => { elements.loadingIndicator.classList.add('hidden'); alert('读取书籍数据失败！'); };
    request.onsuccess = async (e) => {
        const bookData = e.target.result;
        if (!bookData) { elements.loadingIndicator.classList.add('hidden'); alert("在数据库中找不到这本书。"); return; }
        resetReadingSpeedTracker();
        const savedCfi = bookData.progressCfi;
        switchToReaderView();
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'ACTIVATE_EPUB', file: bookData.file });
        }
        currentBook = ePub(bookData.file);
        currentBook.canonical = (url) => url.replace(/^res:\/\//, '/');
        try {
            await currentBook.ready;
            renderToc();
            if (bookData.locations) { await currentBook.locations.load(bookData.locations); } 
            else { elements.loadingIndicator.textContent = '首次加载，正在计算页码...'; const generatedLocations = await currentBook.locations.generate(1650); saveReadingProgress(bookId, savedCfi, generatedLocations); }
            rendition = currentBook.renderTo(elements.viewerDiv, { manager: "continuous", flow: "paginated", width: '100%', height: '100%', allowScriptedContent: true });
            rendition.themes.register("yuki-style", {}); 
            rendition.on('relocated', (location) => {
                saveReadingProgress(bookId, location.start.cfi);
                updateInfoPanel(location);
                updateReadingSpeed(location);
                highlightCurrentToc(location);
            });
            rendition.on('rendered', (section, view) => {
                injectReaderStyles(view);
                setTimeout(() => forceApplyStyles(view), 10);
            });
            await rendition.display(savedCfi || undefined);
            const currentTheme = document.body.classList.contains('john-smith-mode') ? 'john-smith' : (document.body.classList.contains('dark-mode') ? 'dark' : 'light');
            setReaderTheme(currentTheme);
            elements.loadingIndicator.classList.add('hidden');
            elements.prevButton.onclick = () => turnPagePrev();
            elements.nextButton.onclick = () => turnPageNext();
        } catch (err) { console.error("渲染失败:", err); alert("渲染书籍失败，文件可能已损坏。"); elements.loadingIndicator.classList.add('hidden'); backToShelf(); }
    };
}

export function setReaderTheme(themeName) {
    if (!rendition) return;
    updateRenditionThemes(themeName);
    if (rendition.manager && rendition.manager.views) {
        rendition.manager.views.forEach(view => {
            setTimeout(() => forceApplyStyles(view), 10);
        });
    }
}

export function destroyRendition() {
    if (currentBook) {
        currentBook.destroy();
        currentBook = null;
    }
    if (rendition) {
        rendition.destroy();
        rendition = null;
    }
    elements.viewerDiv.innerHTML = '';
    tocList.innerHTML = '';
}

export function increaseFontSize() { if (rendition && currentFontSize < 32) { currentFontSize++; rendition.themes.fontSize(`${currentFontSize}px`); } }
export function decreaseFontSize() { if (rendition && currentFontSize > 8) { currentFontSize--; rendition.themes.fontSize(`${currentFontSize}px`); } }
export function turnPageNext() { if(rendition) rendition.next(); }
export function turnPagePrev() { if(rendition) rendition.prev(); }