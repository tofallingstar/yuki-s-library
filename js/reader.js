import { elements } from './dom.js';
import { getDB, BOOK_STORE_NAME } from './db.js';
import { YUKI_EVENTS } from './events.js';
import { toast, escapeRegExp, debounce } from './ui.js';

const FONT_SIZE_KEY = 'yuki:fontSize';
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
const SEARCH_RESULT_LIMIT = 200;

// DOM 元素引用
const tocPanel = document.getElementById('toc-panel');
const tocList = document.getElementById('toc-list');
const tocOpenBtn = document.getElementById('toc-open-btn');
const tocCloseBtn = document.getElementById('toc-close-btn');
const tocSearchInput = document.getElementById('toc-search-input');
const tocSearchResultsContainer = document.getElementById('toc-search-results-container');
const tocSearchResultsList = document.getElementById('toc-search-results-list');
const tocSearchSummary = document.getElementById('toc-search-summary');
const tocBackToNavBtn = document.getElementById('toc-back-to-nav-btn');
const tocSearchingIndicator = document.getElementById('toc-searching-indicator');

let rendition = null;
let currentBook = null;
let currentBookId = null;
let currentFontSize = clampFontSize(Number(localStorage.getItem(FONT_SIZE_KEY)) || 16);
let readingSpeedTracker = { locations: [], wpm: 200 };
let toc = [];
/** spineIndex -> { start, end }（在 locations 里的全局序号范围），用于章节内进度 */
let chapterRanges = new Map();
let spineLabels = new Map();
let totalLocations = 0;
let progressTracking = false;

function clampFontSize(size) {
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

/* ------------------------------------------------------------------ *
 * 进度保存（节流，避免 relocated 高频触发 IndexedDB 写入）
 * ------------------------------------------------------------------ */
const saveProgressToDB = debounce((bookId, cfi, percent) => {
    if (!bookId) return;
    try {
        const db = getDB();
        const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(BOOK_STORE_NAME);
        const request = store.get(bookId);
        request.onsuccess = () => {
            const bookData = request.result;
            if (!bookData) return;
            bookData.progressCfi = cfi;
            bookData.progressPercent = percent;
            bookData.lastReadAt = Date.now();
            store.put(bookData);
        };
    } catch (error) {
        console.error('保存阅读进度失败:', error);
    }
}, 600);

function saveLocations(bookId, locationsData) {
    const db = getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BOOK_STORE_NAME);
    const request = store.get(bookId);
    request.onsuccess = () => {
        const bookData = request.result;
        if (bookData) {
            bookData.locations = locationsData;
            store.put(bookData);
        }
    };
}

/* ------------------------------------------------------------------ *
 * 章节定位
 * ------------------------------------------------------------------ */
function spineIndexFromCfi(cfi) {
    const match = /epubcfi\(\/*6\/(\d+)/.exec(String(cfi || ''));
    if (!match) return -1;
    return Math.max(0, Math.floor(Number(match[1]) / 2) - 1);
}

function buildChapterRanges() {
    chapterRanges = new Map();
    const list = (currentBook?.locations && currentBook.locations._locations) || [];
    totalLocations = list.length;
    list.forEach((cfi, index) => {
        const spineIndex = spineIndexFromCfi(cfi);
        if (spineIndex < 0) return;
        const range = chapterRanges.get(spineIndex);
        if (!range) chapterRanges.set(spineIndex, { start: index, end: index });
        else range.end = index;
    });
}

/** 目录项 href → 正文 section 的标题映射，让「简介 / 彩页」这类短章节也能显示名字 */
function buildSpineLabels() {
    spineLabels = new Map();
    const walk = (items) => {
        (items || []).forEach(item => {
            const target = String(item.href || '').split('#')[0];
            let section = currentBook?.spine?.get(item.href);
            if (!section && target) {
                const index = currentBook?.spine?.spineItems?.findIndex(s => String(s.href || '').split('#')[0] === target);
                if (index >= 0) section = currentBook.spine.spineItems[index];
            }
            if (section && !spineLabels.has(section.index)) spineLabels.set(section.index, (item.label || '').trim());
            if (item.subitems && item.subitems.length) walk(item.subitems);
        });
    };
    walk(currentBook?.navigation?.toc);
}

/* ------------------------------------------------------------------ *
 * 目录
 * ------------------------------------------------------------------ */
function buildTocHtml(tocItems) {
    let html = '<ul>';
    tocItems.forEach(item => {
        const label = (item.label || '未命名章节').trim();
        html += `<li data-href="${item.href}">`;
        html += `<a href="${item.href}">${label}</a>`;
        if (item.subitems && item.subitems.length > 0) html += buildTocHtml(item.subitems);
        html += '</li>';
    });
    html += '</ul>';
    return html;
}

function renderToc() {
    if (!currentBook || !currentBook.navigation) return;
    toc = currentBook.navigation.toc || [];
    tocList.innerHTML = buildTocHtml(toc);
    if (toc.length === 0) {
        tocList.innerHTML = '<p class="toc-empty">这本书没有可用的目录信息</p>';
    }
    tocList.querySelectorAll('a').forEach(anchor => {
        anchor.addEventListener('click', (event) => {
            event.preventDefault();
            const href = anchor.getAttribute('href');
            rendition?.display(href);
            tocPanel.classList.remove('open');
        });
    });
}

function highlightCurrentToc(location) {
    if (!location || !location.start) return;
    const currentHref = location.start.href;
    tocList.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));

    const anchors = [...tocList.querySelectorAll('a')];
    // 先精确匹配，再退化为同文件匹配（目录 href 常带锚点）
    let target = anchors.find(a => a.getAttribute('href') === currentHref);
    if (!target) {
        const file = String(currentHref).split('#')[0];
        target = anchors.find(a => String(a.getAttribute('href')).split('#')[0] === file);
    }
    if (!target) return;

    let element = target.parentElement;
    while (element && element.tagName === 'LI') {
        element.classList.add('active');
        element = element.parentElement?.closest('li') || null;
    }
    if (tocPanel.classList.contains('open')) {
        target.scrollIntoView({ block: 'nearest' });
    }
}

function filterToc() {
    const query = tocSearchInput.value.trim().toLowerCase();
    tocList.querySelectorAll('a').forEach(anchor => {
        const li = anchor.closest('li');
        const text = anchor.textContent.toLowerCase();
        li.style.display = !query || text.includes(query) ? '' : 'none';
    });
}

/* ------------------------------------------------------------------ *
 * 全书搜索
 * ------------------------------------------------------------------ */
async function searchBookContent(query) {
    if (!currentBook || !query) return;

    tocSearchingIndicator.classList.remove('hidden');
    tocList.classList.add('hidden');
    tocSearchResultsContainer.classList.remove('hidden');
    tocSearchResultsList.innerHTML = '';
    if (tocSearchSummary) tocSearchSummary.textContent = '';

    try {
        const searchPromises = currentBook.spine.spineItems.map(item =>
            item.load(currentBook.load.bind(currentBook))
                .then(() => item.find(query))
                .finally(() => item.unload())
        );
        const results = await Promise.all(searchPromises);
        let allMatches = results.filter(Boolean).flat();
        tocSearchingIndicator.classList.add('hidden');

        const total = allMatches.length;
        if (total > SEARCH_RESULT_LIMIT) allMatches = allMatches.slice(0, SEARCH_RESULT_LIMIT);
        if (tocSearchSummary) {
            tocSearchSummary.textContent = total === 0
                ? ''
                : `共 ${total} 处${total > SEARCH_RESULT_LIMIT ? `（显示前 ${SEARCH_RESULT_LIMIT} 条）` : ''}`;
        }

        if (allMatches.length === 0) {
            tocSearchResultsList.innerHTML = '<li class="no-results">在书中未找到任何结果。</li>';
            return;
        }

        const pattern = new RegExp(escapeRegExp(query), 'gi');
        const fragment = document.createDocumentFragment();
        allMatches.forEach(match => {
            const li = document.createElement('li');
            li.className = 'search-result-item';
            li.dataset.cfi = match.cfi;
            const excerpt = String(match.excerpt || '');
            li.innerHTML = `…${excerpt.replace(pattern, found => `<span class="search-highlight">${found}</span>`)}…`;
            li.addEventListener('click', () => {
                rendition.display(match.cfi);
                tocPanel.classList.remove('open');
                tocSearchResultsContainer.classList.add('hidden');
                tocList.classList.remove('hidden');
            });
            fragment.appendChild(li);
        });
        tocSearchResultsList.appendChild(fragment);
    } catch (error) {
        console.error('全书搜索失败:', error);
        tocSearchingIndicator.classList.add('hidden');
        tocSearchResultsList.innerHTML = '<li class="no-results">搜索时发生错误（关键词请勿包含特殊符号）。</li>';
    }
}

/* ------------------------------------------------------------------ *
 * 阅读信息面板
 * ------------------------------------------------------------------ */
function updateReadProgressBar(percent) {
    const bar = document.querySelector('#read-progress span');
    if (!bar) return;
    const value = Math.min(100, Math.max(0, (percent || 0) * 100));
    bar.style.width = `${value.toFixed(2)}%`;
}

function setInfoValue(el, text) {
    const value = el?.querySelector('.info-value');
    if (value) value.textContent = text;
}

function updateInfoPanel(location) {
    if (!location || !location.start || !rendition || !currentBook?.locations?.total) {
        setInfoValue(elements.infoChapter, '--');
        setInfoValue(elements.infoPagination, '-- / --');
        setInfoValue(elements.infoChapterProgress, '--%');
        setInfoValue(elements.infoProgress, '--%');
        setInfoValue(elements.infoTimeLeft, '-- min');
        return;
    }

    const locations = currentBook.locations;
    const totalPages = locations.total;
    const currentPage = locations.locationFromCfi(location.start.cfi);
    const bookProgress = locations.percentageFromCfi(location.start.cfi) || 0;
    const spineIndex = Number.isInteger(location.start.index) ? location.start.index : spineIndexFromCfi(location.start.cfi);

    setInfoValue(elements.infoPagination, `${currentPage} / ${totalPages}`);
    setInfoValue(elements.infoProgress, `${Math.round(bookProgress * 100)}%`);
    updateReadProgressBar(bookProgress);

    const chapter = rendition.book.navigation.get(location.start.href);
    const chapterLabel = chapter?.label?.trim() || spineLabels.get(spineIndex) || `第 ${spineIndex + 1} 节`;
    setInfoValue(elements.infoChapter, chapterLabel);

    // 章节内进度：用 locations 里该 spine 的全局序号范围推算，跳转/续读都准确
    const range = chapterRanges.get(spineIndex);
    if (range && range.end > range.start) {
        const ratio = (currentPage - range.start) / (range.end - range.start + 1);
        setInfoValue(elements.infoChapterProgress, `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`);
    } else {
        // 整章只占一个 location（封面、版权页那种），没有更细的刻度可算
        setInfoValue(elements.infoChapterProgress, range ? '0%' : '--%');
    }

    const wordsLeft = (1 - bookProgress) * (totalPages * 250);
    const minutesLeft = Math.max(1, Math.round(wordsLeft / readingSpeedTracker.wpm));
    setInfoValue(elements.infoTimeLeft, `${minutesLeft} min`);
}

function updateReadingSpeed(location) {
    readingSpeedTracker.locations.push({ cfi: location.start.cfi, time: Date.now() });
    if (readingSpeedTracker.locations.length > 10) readingSpeedTracker.locations.shift();
}

/* ------------------------------------------------------------------ *
 * 阅读区样式
 * ------------------------------------------------------------------ */
function injectReaderStyles(view) {
    if (!view || !view.document) return;
    const doc = view.document;
    doc.getElementById('yuki-reader-styles')?.remove();
    const style = doc.createElement('style');
    style.id = 'yuki-reader-styles';
    style.innerHTML = `
        img, svg, image { max-width: 100% !important; max-height: 86vh !important; height: auto !important; object-fit: contain; display: block; margin: 1.2em auto !important; }
        /* 正文排成书页：只给 body 设定衬线，书籍自带字体的标题保持原样 */
        body { padding: 30px 34px !important; box-sizing: border-box; font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif !important; }
        /* 书籍自带的标题框常常写死宽度，窄屏会被裁掉；给块级元素一个上限 */
        div, p { max-width: 100% !important; }
        /* 只调整“真正的正文段落”（见 tuneParagraphs），标题、装饰短行不动 */
        .yuki-body-p { line-height: 1.9 !important; margin-bottom: 0.7em !important; text-indent: 2em !important; }
    `;
    doc.head.appendChild(style);
}

/** 给正文段落打标记：短行（章节号、图注）不参与排版覆盖，避免撑坏书籍自带的标题装饰 */
function tuneParagraphs(doc) {
    if (!doc) return;
    doc.querySelectorAll('p').forEach(p => {
        const text = (p.textContent || '').trim();
        if (text.length >= 20) p.classList.add('yuki-body-p');
    });
}

function forceApplyStyles(view) {
    const doc = view?.document;
    if (!doc || !doc.body) return;
    const isDarkMode = document.body.classList.contains('dark-mode');
    const isJohnSmith = document.body.classList.contains('john-smith-mode');

    if (!isDarkMode && !isJohnSmith) {
        doc.body.querySelectorAll('*').forEach(el => {
            ['color', 'font-family', 'background-color', 'background', 'text-shadow'].forEach(prop => el.style.removeProperty(prop));
        });
        return;
    }

    const palette = isJohnSmith
        ? { color: '#e6e6fa', font: "'Courier Prime', 'Courier New', monospace", glow: 'rgba(200, 162, 200, 0.3)' }
        : {
            color: '#e3f4ec',
            // 正文保持衬线：荧光绿只用于界面，长文阅读不能被等宽字体拉散字距
            font: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif",
            glow: 'rgba(94, 242, 192, 0.08)',
        };

    doc.body.querySelectorAll('*').forEach(el => {
        el.style.setProperty('color', palette.color, 'important');
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('background', 'transparent', 'important');
        el.style.setProperty('text-shadow', `0 0 5px ${palette.glow}`, 'important');
    });
    ['body'].forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.style.setProperty('font-family', palette.font, 'important'));
    });
}

function updateRenditionThemes() {
    if (!rendition) return;
    rendition.themes.override('yuki-style', {
        '*': { background: 'transparent !important', 'background-color': 'transparent !important' },
    });
    rendition.themes.select('yuki-style');
}

export function applyReaderFontSize(size = currentFontSize) {
    currentFontSize = clampFontSize(size);
    localStorage.setItem(FONT_SIZE_KEY, String(currentFontSize));
    if (rendition) rendition.themes.fontSize(`${currentFontSize}px`);
    document.querySelectorAll('#font-size-value').forEach(el => { el.textContent = `${currentFontSize}px`; });
    return currentFontSize;
}

/* ------------------------------------------------------------------ *
 * 词频分析
 * ------------------------------------------------------------------ */
let analysisPanel = {
    panel: document.getElementById('word-frequency-panel'),
    content: document.getElementById('word-frequency-content'),
    closeBtn: document.querySelector('#word-frequency-panel .panel-close-btn'),
    isTyping: false,
    typingInterval: null,
};

if (analysisPanel.closeBtn) {
    analysisPanel.closeBtn.addEventListener('click', () => {
        analysisPanel.panel.classList.add('hidden');
        if (analysisPanel.typingInterval) {
            clearInterval(analysisPanel.typingInterval);
            analysisPanel.isTyping = false;
        }
    });
}

function analyzeWordFrequency(text) {
    const words = text.match(/[\u4e00-\u9fa5]{2,}|\b[a-zA-Z]{2,}\b/g) || [];
    const frequencies = {};
    const commonWords = new Set([
        '的', '了', '在', '是', '我', '你', '他', '她', '它', '和', '与', '或', '但', '也', '不', '着', '个',
        '我们', '你们', '他们', '这个', '那个', '一个', '什么', '怎么', '因为', '所以', '但是', '如果', '就', '都',
        '还', '说', '自己', '可以', '没有', '就是', '这样', '那样', '时候',
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he',
    ]);
    for (const word of words) {
        const lowerCaseWord = word.toLowerCase();
        if (!commonWords.has(lowerCaseWord)) frequencies[lowerCaseWord] = (frequencies[lowerCaseWord] || 0) + 1;
    }
    return Object.entries(frequencies).sort((a, b) => b[1] - a[1]);
}

export async function showWordFrequencyPanel() {
    if (!rendition || analysisPanel.isTyping) return;
    document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Executing text analysis...', type: 'system' } }));
    const currentSection = await rendition.currentLocation();
    const section = rendition.book.spine.get(currentSection.start.href);
    if (!section) return;
    const contents = await section.load();
    const text = contents.textContent || '';
    const wordFrequencies = analyzeWordFrequency(text).slice(0, 30);
    if (wordFrequencies.length === 0) {
        toast('当前章节没有可分析的文本', 'warn');
        return;
    }

    const isDarkMode = document.body.classList.contains('dark-mode');
    analysisPanel.panel.className = 'yuki-panel'; // 两套主题都走 yuki-panel，颜色由 CSS 变量决定
    analysisPanel.panel.id = 'word-frequency-panel';
    analysisPanel.content.innerHTML = '';
    analysisPanel.panel.classList.remove('hidden');
    analysisPanel.isTyping = true;

    let lineIndex = 0;
    analysisPanel.typingInterval = setInterval(() => {
        if (lineIndex < wordFrequencies.length) {
            const [word, count] = wordFrequencies[lineIndex];
            const p = document.createElement('p');
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            wordSpan.textContent = word;
            const filler = document.createElement('span');
            filler.className = 'filler';
            const countSpan = document.createElement('span');
            countSpan.className = 'count';
            countSpan.textContent = count;
            p.append(wordSpan, filler, countSpan);
            analysisPanel.content.appendChild(p);
            analysisPanel.content.scrollTop = analysisPanel.content.scrollHeight;
            lineIndex++;
        } else {
            clearInterval(analysisPanel.typingInterval);
            analysisPanel.isTyping = false;
            document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Analysis complete.', type: 'system' } }));
        }
    }, 100);
}

/* ------------------------------------------------------------------ *
 * 阅读器生命周期
 * ------------------------------------------------------------------ */
function measureViewer() {
    const el = elements.viewerDiv;
    // epub.js 会往 #viewer 上写死 inline 宽高；测量前先让 CSS 的 100% / 80% 生效
    const prevWidth = el.style.width;
    const prevHeight = el.style.height;
    el.style.width = '';
    el.style.height = '';
    const rect = el.getBoundingClientRect();
    const fallbackWidth = Math.round(window.innerWidth * 0.8);
    const fallbackHeight = Math.round(window.innerHeight * 0.7);
    const width = Math.max(240, Math.round(rect.width) || fallbackWidth);
    const height = Math.max(240, Math.round(rect.height) || fallbackHeight);
    el.style.width = prevWidth;
    el.style.height = prevHeight;
    return { width, height };
}

export function initReader() {    elements.backToShelfBtn.addEventListener('click', backToShelf);

    tocOpenBtn.addEventListener('click', () => {
        tocPanel.classList.add('open');
        const location = rendition?.currentLocation();
        if (location && typeof location.then === 'function') location.then(highlightCurrentToc);
        else highlightCurrentToc(location);
    });
    tocCloseBtn.addEventListener('click', () => {
        tocSearchResultsContainer.classList.add('hidden');
        tocList.classList.remove('hidden');
        tocPanel.classList.remove('open');
    });

    tocBackToNavBtn.addEventListener('click', () => {
        tocSearchResultsContainer.classList.add('hidden');
        tocList.classList.remove('hidden');
        if (tocSearchSummary) tocSearchSummary.textContent = '';
    });

    tocSearchInput.addEventListener('input', filterToc);
    tocSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            tocPanel.classList.remove('open');
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const query = tocSearchInput.value.trim();
            if (query) searchBookContent(query);
        }
    });

    elements.prevButton.addEventListener('click', turnPagePrev);
    elements.nextButton.addEventListener('click', turnPageNext);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!rendition) return;
            const { width, height } = measureViewer();
            rendition.resize(width, height);
        }, 220);
    });

    window.addEventListener('beforeunload', () => saveProgressToDB.flush());
}

function switchToReaderView() {
    elements.bookshelfView.classList.add('hidden');
    elements.readerView.classList.remove('hidden');
    elements.clearAllBooksBtn.classList.add('hidden');
}

export function backToShelf() {
    saveProgressToDB.flush();
    document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, { detail: { view: 'bookshelf' } }));
}

export async function openEpub(bookId) {
    elements.loadingIndicator.textContent = '正在打开书籍...';
    elements.loadingIndicator.classList.remove('hidden');
    destroyRendition();

    const db = getDB();
    const request = db.transaction(BOOK_STORE_NAME, 'readonly').objectStore(BOOK_STORE_NAME).get(bookId);

    request.onerror = () => {
        elements.loadingIndicator.classList.add('hidden');
        toast('读取书籍数据失败，请重试', 'error');
    };

    request.onsuccess = async (event) => {
        const bookData = event.target.result;
        if (!bookData) {
            elements.loadingIndicator.classList.add('hidden');
            toast('在数据库中找不到这本书', 'error');
            return;
        }
        if (bookData.type && bookData.type !== 'epub') {
            elements.loadingIndicator.classList.add('hidden');
            toast('暂不支持这种格式，目前只能阅读 ePub', 'warn', 4200);
            backToShelf();
            return;
        }

        currentBookId = bookId;
        readingSpeedTracker.locations = [];
        const savedCfi = bookData.progressCfi;
        switchToReaderView();

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'ACTIVATE_EPUB', file: bookData.file });
        }

        try {
            currentBook = ePub(bookData.file);
            await currentBook.ready;
            renderToc();

            if (bookData.locations) {
                currentBook.locations.load(bookData.locations);
            } else {
                elements.loadingIndicator.textContent = '首次打开，正在计算页码...';
                const generated = await currentBook.locations.generate(1650);
                saveLocations(bookId, generated);
            }
            buildChapterRanges();
            buildSpineLabels();

            // 显式量出容器尺寸再交给 epub.js：宽高给 '100%' 时，隐藏视图刚显示 / 窗口缩放后
            // epub.js 会量到 0 宽，按列排版的长文本就会算出上万像素宽的 iframe
            const measured = measureViewer();
            rendition = currentBook.renderTo(elements.viewerDiv, {
                manager: 'default',
                flow: 'paginated',
                width: measured.width,
                height: measured.height,
                allowScriptedContent: true,
            });
            rendition.themes.register('yuki-style', {});
            // 首屏定位完成前不写进度，避免布局异常时把“封面”当成用户读到的位置存下去
            progressTracking = false;
            rendition.on('relocated', (location) => {
                updateInfoPanel(location);
                updateReadingSpeed(location);
                highlightCurrentToc(location);
                if (progressTracking) {
                    saveProgressToDB(bookId, location.start.cfi, currentBook.locations.percentageFromCfi(location.start.cfi));
                }
            });
            rendition.on('rendered', (section, view) => {
                injectReaderStyles(view);
                tuneParagraphs(view.document);
                setTimeout(() => forceApplyStyles(view), 10);
            });

            applyReaderFontSize(currentFontSize);
            try {
                await rendition.display(savedCfi || undefined);
            } catch (locationError) {
                console.warn('恢复上次阅读位置失败，回到书首', locationError);
                await rendition.display();
            }
            progressTracking = true;

            const currentTheme = document.body.classList.contains('john-smith-mode')
                ? 'john-smith'
                : (document.body.classList.contains('dark-mode') ? 'dark' : 'light');
            setReaderTheme(currentTheme);

            elements.loadingIndicator.classList.add('hidden');
            updateInfoPanel(rendition.currentLocation());
        } catch (error) {
            console.error('渲染失败:', error);
            elements.loadingIndicator.classList.add('hidden');
            toast('这本 ePub 打不开，文件可能已损坏', 'error', 4200);
            backToShelf();
        }
    };
}

function applyThemeToRenderedViews() {
    // 不依赖 epub.js 内部 manager 结构，直接遍历页面上已渲染的 iframe
    document.querySelectorAll('#viewer iframe').forEach((iframe) => {
        try {
            forceApplyStyles({ document: iframe.contentDocument });
        } catch (error) {
            /* 跨域或尚未就绪时忽略 */
        }
    });
}

export function setReaderTheme(themeName) {
    if (!rendition) return;
    updateRenditionThemes();
    setTimeout(applyThemeToRenderedViews, 30);
    setTimeout(applyThemeToRenderedViews, 220);
}

export function destroyRendition() {
    saveProgressToDB.flush();
    if (currentBook) {
        try { currentBook.destroy(); } catch (error) { console.warn(error); }
        currentBook = null;
    }
    if (rendition) {
        try { rendition.destroy(); } catch (error) { console.warn(error); }
        rendition = null;
    }
    currentBookId = null;
    chapterRanges = new Map();
    totalLocations = 0;
    elements.viewerDiv.innerHTML = '';
    tocList.innerHTML = '';
    if (tocSearchSummary) tocSearchSummary.textContent = '';
    tocPanel.classList.remove('open');
}

export function increaseFontSize() {
    if (currentFontSize >= MAX_FONT_SIZE) return;
    applyReaderFontSize(currentFontSize + 1);
}

export function decreaseFontSize() {
    if (currentFontSize <= MIN_FONT_SIZE) return;
    applyReaderFontSize(currentFontSize - 1);
}

export function turnPageNext() { rendition?.next(); }
export function turnPagePrev() { rendition?.prev(); }

// 给调试 / 验收留的只读探针（不改变行为）
if (typeof window !== 'undefined') {
    window.__yukiReader = {
        get location() {
            const loc = rendition?.currentLocation?.();
            return loc ? { cfi: loc.start?.cfi, index: loc.start?.index, href: loc.start?.href } : null;
        },
        get rendering() { return Boolean(rendition); },
        get font() { return currentFontSize; },
        get book() { return currentBookId; },
        get debug() {
            return {
                locationCount: currentBook?.locations?._locations?.length ?? 0,
                chapterRanges: chapterRanges.size,
                total: currentBook?.locations?.total ?? 0,
                progressTracking,
            };
        },
    };
}

export function isReaderActive() { return !elements.readerView.classList.contains('hidden'); }
export function toggleTocPanel() {
    if (!isReaderActive()) return;
    tocPanel.classList.toggle('open');
    if (tocPanel.classList.contains('open')) {
        const location = rendition?.currentLocation();
        if (location && typeof location.then === 'function') location.then(highlightCurrentToc);
        else highlightCurrentToc(location);
    }
}
export function closeTocPanel() { tocPanel.classList.remove('open'); }
