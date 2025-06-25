// js/dom.js

export const elements = {
    bookUploadInput: document.getElementById('book-upload'),
    bookshelfDiv: document.getElementById('bookshelf'),
    bookshelfView: document.getElementById('bookshelf-view'),
    viewerDiv: document.getElementById('viewer'),
    readerView: document.getElementById('reader-view'),
    prevButton: document.getElementById('prev'),
    nextButton: document.getElementById('next'),
    backToShelfBtn: document.getElementById('back-to-shelf-btn'),
    analyzeTextBtn: document.getElementById('analyze-text-btn'),
    fontSizeIncrease: document.getElementById('font-size-increase'),
    fontSizeDecrease: document.getElementById('font-size-decrease'),
    cokeBtn: document.getElementById('coke-btn'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'), 
    navMusic: document.getElementById('nav-music'),
    musicPlayer: document.getElementById('music-player'),
    songTitle: document.getElementById('song-title'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    nextSongBtn: document.getElementById('next-song-btn'),
    prevSongBtn: document.getElementById('prev-song-btn'),
    addMusicBtn: document.getElementById('add-music-btn'),
    playlistBtn: document.getElementById('playlist-btn'), 
    musicUploadInput: document.getElementById('music-upload'),
    audioElement: document.getElementById('audio-element'),
    loadingIndicator: document.getElementById('loading-indicator'),
    navBookshelf: document.getElementById('nav-bookshelf'),
    listsSubmenu: document.getElementById('lists-submenu'),
    createListBtn: document.getElementById('create-list-btn'),
    searchBar: document.getElementById('search-bar'),
    clearAllBooksBtn: document.getElementById('clear-all-books-btn'),
    navigationSidebar: document.querySelector('.navigation-sidebar'),
    closeMusicBtn: document.querySelector('#music-player .close-btn'),
    customBackground: document.getElementById('custom-background'),
    bgUploadInput: document.getElementById('bg-upload-input'), 
    bgOpacitySlider: document.getElementById('bg-opacity-slider'), 
    infoPanel: document.getElementById('info-panel'),
    infoChapter: document.getElementById('info-chapter'),
    infoProgress: document.getElementById('info-progress'),
    infoChapterProgress: document.getElementById('info-chapter-progress'),
    infoPagination: document.getElementById('info-pagination'),
    infoTimeLeft: document.getElementById('info-time-left'),
    johnSmithTrigger: document.getElementById('john-smith-trigger'),
    appTitle: document.querySelector('.navigation-sidebar h1'),
    
    commandPalette: document.getElementById('command-palette'),
    paletteInput: document.getElementById('palette-input'),
    paletteResults: document.getElementById('palette-results'),
};

export function validateDOMElements() {
    const missingElements = Object.entries(elements)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missingElements.length > 0) {
        throw new Error(`启动失败：以下关键DOM元素在HTML中未找到: ${missingElements.join(', ')}`);
    }
    console.log("所有DOM元素验证通过！");
    return true;
}