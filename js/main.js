import { elements, validateDOMElements } from './dom.js';
import { initDB, getDB, SETTINGS_STORE_NAME } from './db.js';
import { app } from './app.js';
import { YUKI_EVENTS } from './events.js';
import { commandPalette } from './command-palette.js';
import { toast } from './ui.js';

// 模块导入
import { loadLists, handleCreateList, handleClearAllBooks, loadBookshelf, getAllBooksForSearch } from './bookshelf.js';
import {
    initReader, increaseFontSize, decreaseFontSize, showWordFrequencyPanel, setReaderTheme,
    turnPageNext, turnPagePrev, applyReaderFontSize, isReaderActive, toggleTocPanel, closeTocPanel,
} from './reader.js';
import { initMusicPlayer, togglePlayPause, nextSong, prevSong, handleMusicUpload, showPlaylistModal, applyMusicPlayerTheme } from './music.js';

const THEME_KEY = 'yuki:theme';

// --- 日志控制台 ---
const logConsole = {
    element: null, contentElement: null, maxEntries: 50, logQueue: [], isTyping: false, typingSpeed: 30,
    init() {
        this.element = document.getElementById('log-console');
        if (this.element) this.contentElement = this.element.querySelector('#log-content');
        this.log('Yuki.SOS.System online.', 'system');
    },
    log(message, type = 'info') {
        if (!this.contentElement || !document.body.classList.contains('dark-mode')) return;
        this.logQueue.push({ message, type });
        if (!this.isTyping) this.processQueue();
    },
    processQueue() {
        if (this.logQueue.length === 0) { this.isTyping = false; return; }
        this.isTyping = true;
        const logItem = this.logQueue.shift();
        this.typewriter(logItem.message, logItem.type);
    },
    typewriter(message, type) {
        while (this.contentElement.children.length >= this.maxEntries) this.contentElement.firstChild.remove();
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const entry = document.createElement('p');
        const messageSpan = document.createElement('span');
        messageSpan.className = `log-type-${type}`;
        entry.innerHTML = `<span class="log-time">[${timestamp}]</span>`;
        entry.appendChild(messageSpan);
        this.contentElement.appendChild(entry);
        this.contentElement.scrollTop = this.contentElement.scrollHeight;
        let charIndex = 0;
        const intervalId = setInterval(() => {
            if (charIndex < message.length) {
                messageSpan.textContent += message[charIndex];
                charIndex++;
                this.contentElement.scrollTop = this.contentElement.scrollHeight;
            } else {
                clearInterval(intervalId);
                this.processQueue();
            }
        }, this.typingSpeed);
    },
};

// --- 主题 ---
function storedTheme() {
    const saved = localStorage.getItem(THEME_KEY) || localStorage.getItem('theme');
    return saved === 'dark' ? 'dark' : 'light';
}

function applyTheme(themeName, { persist = true } = {}) {
    const isDark = themeName === 'dark';
    document.body.classList.toggle('dark-mode', isDark);
    if (persist) localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    setReaderTheme(isDark ? 'dark' : (document.body.classList.contains('john-smith-mode') ? 'john-smith' : 'light'));
    applyMusicPlayerTheme();
    logConsole.element?.classList.toggle('hidden', !isDark);
    elements.themeToggleBtn?.setAttribute('aria-pressed', String(isDark));
    if (isDark) logConsole.log('Theme protocol switched to: DARK', 'system');
}

function toggleTheme() {
    const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(next);
}

// --- 侧边栏（移动端抽屉） ---
function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    elements.sidebarToggle?.setAttribute('aria-expanded', String(open));
    elements.sidebarScrim?.classList.toggle('hidden', !open);
}

// --- John Smith（彩蛋） ---
let isJohnSmithMode = false;
function toggleJohnSmithMode() {
    isJohnSmithMode = !isJohnSmithMode;
    document.body.classList.toggle('john-smith-mode', isJohnSmithMode);

    const appTitle = elements.appTitle;
    if (!appTitle) return;

    if (isJohnSmithMode) {
        document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Executing program: John_Smith.init()', type: 'system' } }));
        const newTitle = '程式已启动';
        let i = 0;
        appTitle.textContent = '|';
        const typingInterval = setInterval(() => {
            appTitle.textContent = newTitle.slice(0, i + 1) + (i < newTitle.length - 1 ? '|' : '');
            i++;
            if (i > newTitle.length) {
                clearInterval(typingInterval);
                appTitle.textContent = newTitle;
                document.title = '程式已启动';
                document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Program running. Identity override complete.', type: 'action' } }));
            }
        }, 150);
    } else {
        document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Terminating program: John_Smith.destroy()', type: 'system' } }));
        appTitle.textContent = 'yuki的图书馆';
        document.title = 'Yuki的图书馆';
        document.dispatchEvent(new CustomEvent('log-event', { detail: { message: 'Identity restored to default.', type: 'action' } }));
    }

    applyTheme(document.body.classList.contains('dark-mode') ? 'dark' : 'light', { persist: false });
}

// --- 背景设置 ---
function handleBgUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        saveSetting('customBg', file);
        const imageUrl = URL.createObjectURL(file);
        elements.customBackground.style.backgroundImage = `url('${imageUrl}')`;
        toast('背景已更新', 'success');
    }
}
function handleBgOpacityChange(event) {
    const opacity = event.target.value;
    elements.customBackground.style.opacity = opacity;
    saveSetting('customBgOpacity', opacity);
}
async function saveSetting(key, value) {
    const db = getDB();
    db.transaction(SETTINGS_STORE_NAME, 'readwrite').objectStore(SETTINGS_STORE_NAME).put({ key, value });
}
async function loadSetting(key) {
    const db = getDB();
    return new Promise(resolve => {
        const request = db.transaction(SETTINGS_STORE_NAME, 'readonly').objectStore(SETTINGS_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => resolve(null);
    });
}

// --- 主应用逻辑 ---
async function initializeApp() {
    try {
        validateDOMElements();
    } catch (error) {
        document.body.innerHTML = `<div style="color: red; padding: 20px;">${error.message}</div>`;
        return;
    }

    logConsole.init();
    document.addEventListener('log-event', (e) => logConsole.log(e.detail.message, e.detail.type));

    applyTheme(storedTheme(), { persist: false });
    document.documentElement.classList.remove('preload-dark');

    try {
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
        logConsole.log(`Service Worker registration failed: ${error.message}`, 'error');
    }

    await initDB();
    commandPalette.init();
    await registerAllCommands();
    await loadInitialSettings();
    bindSimpleEventListeners();
    await loadLists();
    await initMusicPlayer();
    initReader();
    app.start();
    logConsole.log('Application initialized successfully.', 'system');
}

async function registerAllCommands() {
    commandPalette.register({ id: 'theme.toggle', name: '切换 日间/夜间 主题', action: toggleTheme });
    commandPalette.register({ id: 'toc.toggle', name: '打开/关闭 目录', action: toggleTocPanel });
    commandPalette.register({ id: 'bookshelf.clear', name: '清空书库 (危险操作)', action: handleClearAllBooks });
    commandPalette.register({ id: 'music.toggle', name: '显示/隐藏 音乐播放器', action: () => { elements.musicPlayer.classList.toggle('hidden'); elements.navMusic.classList.toggle('active'); } });
    const books = await getAllBooksForSearch();
    books.forEach(book => {
        commandPalette.register({
            id: `book.open.${book.id}`,
            name: `打开书籍: ${book.title}`,
            action: () => {
                document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, { detail: { view: 'reader', bookId: book.id } }));
            },
        });
    });
}

async function loadInitialSettings() {
    const savedBgFile = await loadSetting('customBg');
    if (savedBgFile) elements.customBackground.style.backgroundImage = `url('${URL.createObjectURL(savedBgFile)}')`;
    const savedOpacity = (await loadSetting('customBgOpacity')) || '0.3';
    elements.customBackground.style.opacity = savedOpacity;
    elements.bgOpacitySlider.value = savedOpacity;

    const savedFontSize = Number(localStorage.getItem('yuki:fontSize'));
    applyReaderFontSize(Number.isFinite(savedFontSize) && savedFontSize > 0 ? savedFontSize : 16);
}

function bindSimpleEventListeners() {
    elements.bookUploadInput.addEventListener('change', (event) => {
        document.dispatchEvent(new CustomEvent(YUKI_EVENTS.FILES_DROPPED, { detail: { files: event.target.files } }));
    });
    elements.navBookshelf.querySelector('.nav-item-main').addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent(YUKI_EVENTS.REQUEST_VIEW_CHANGE, { detail: { view: 'bookshelf' } }));
        loadBookshelf(null);
        setSidebarOpen(false);
    });
    elements.createListBtn.addEventListener('click', handleCreateList);
    elements.searchBar.addEventListener('input', () => loadBookshelf());
    elements.clearAllBooksBtn.addEventListener('click', handleClearAllBooks);
    elements.fontSizeIncrease.addEventListener('click', increaseFontSize);
    elements.fontSizeDecrease.addEventListener('click', decreaseFontSize);
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
    elements.bgUploadInput.addEventListener('change', handleBgUpload);
    elements.bgOpacitySlider.addEventListener('input', handleBgOpacityChange);
    elements.analyzeTextBtn.addEventListener('click', showWordFrequencyPanel);
    elements.navMusic.addEventListener('click', () => { elements.musicPlayer.classList.toggle('hidden'); elements.navMusic.classList.toggle('active'); });
    elements.closeMusicBtn.addEventListener('click', () => { elements.musicPlayer.classList.add('hidden'); elements.navMusic.classList.remove('active'); });
    elements.addMusicBtn.addEventListener('click', () => elements.musicUploadInput.click());
    elements.musicUploadInput.addEventListener('change', handleMusicUpload);
    elements.playPauseBtn.addEventListener('click', togglePlayPause);
    elements.nextSongBtn.addEventListener('click', nextSong);
    elements.prevSongBtn.addEventListener('click', prevSong);
    elements.playlistBtn.addEventListener('click', showPlaylistModal);
    elements.audioElement.addEventListener('ended', nextSong);
    elements.johnSmithTrigger.addEventListener('click', toggleJohnSmithMode);
    elements.cokeBtn.addEventListener('click', () => toast('川普让加的 🎉🥤', 'info'));

    elements.sidebarToggle?.addEventListener('click', () => setSidebarOpen(!document.body.classList.contains('sidebar-open')));
    elements.sidebarScrim?.addEventListener('click', () => setSidebarOpen(false));

    document.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            commandPalette.toggle();
            return;
        }
        if (commandPalette.isVisible) return;

        const typingInField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) && event.target.type !== 'range';
        if (event.key === 'Escape') {
            closeTocPanel();
            setSidebarOpen(false);
            return;
        }
        if (!isReaderActive() || typingInField) return;

        switch (event.key) {
            case 'ArrowLeft': case 'a': case 'A': turnPagePrev(); break;
            case 'ArrowRight': case 'd': case 'D': turnPageNext(); break;
            case ' ': case 'PageDown': event.preventDefault(); turnPageNext(); break;
            case 'PageUp': event.preventDefault(); turnPagePrev(); break;
            default: break;
        }
    });

    let wheelTimeout;
    elements.readerView.addEventListener('wheel', (event) => {
        if (elements.readerView.classList.contains('hidden')) return;
        event.preventDefault();
        if (wheelTimeout) return;
        if (event.deltaY > 0) turnPageNext();
        else if (event.deltaY < 0) turnPagePrev();
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 100);
    }, { passive: false });
}

// --- 启动应用 ---
initializeApp();
