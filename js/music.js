// js/music.js

import { elements } from './dom.js';
import { getDB, MUSIC_STORE_NAME } from './db.js';

let playlist = [];
let currentSongIndex = -1;
let isPlaying = false;

export function applyMusicPlayerTheme() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    elements.musicPlayer.classList.toggle('yuki-panel', isDarkMode);
}

export function showPlaylistModal() {
    document.querySelector('#music-playlist-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'music-playlist-modal';
    if (document.body.classList.contains('dark-mode')) {
        modal.classList.add('yuki-panel');
    }
    modal.innerHTML = `
        <div class="playlist-header">
            <span>播放列表</span>
            <button class="close-playlist-btn">×</button>
        </div>
        <ul id="playlist-songs"></ul>
    `;
    document.body.appendChild(modal);
    
    const songListElement = modal.querySelector('#playlist-songs');
    if (playlist.length === 0) {
        songListElement.innerHTML = '<li class="playlist-song-item empty">暂无音乐</li>';
    } else {
        playlist.forEach((song, index) => {
            const item = document.createElement('li');
            item.className = 'playlist-song-item';
            if (index === currentSongIndex) {
                item.classList.add('playing');
            }
            item.innerHTML = `
                <span class="song-item-title">${song.title}</span>
                <button class="delete-song-btn" data-song-id="${song.id}" title="删除歌曲">×</button>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-song-btn')) {
                    e.stopPropagation();
                    deleteSong(song.id, song.title);
                } else {
                    loadSong(index);
                    playSong();
                    modal.remove();
                }
            });
            songListElement.appendChild(item);
        });
    }
    modal.querySelector('.close-playlist-btn').addEventListener('click', () => {
        modal.remove();
    });
    const playerRect = elements.musicPlayer.getBoundingClientRect();
    modal.style.left = `${playerRect.left}px`;
    modal.style.bottom = `${window.innerHeight - playerRect.top + 10}px`;
}

async function deleteSong(songId, songTitle) {
    if (!confirm(`确定要从播放列表中删除《${songTitle}》吗？`)) return;
    document.dispatchEvent(new CustomEvent('log-event', {
        detail: { message: `Deleting song: ${songTitle}`, type: 'action' }
    }));
    const db = getDB();
    const transaction = db.transaction(MUSIC_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUSIC_STORE_NAME);
    store.delete(songId);
    transaction.oncomplete = async () => {
        const wasPlayingId = playlist[currentSongIndex]?.id;
        const wasPlaying = isPlaying;
        await loadPlaylistFromDB();
        let newIndex = -1;
        if (wasPlayingId === songId) {
            if (wasPlaying && playlist.length > 0) {
                newIndex = Math.min(currentSongIndex, playlist.length - 1);
            }
        } else {
            newIndex = playlist.findIndex(song => song.id === wasPlayingId);
        }
        loadSong(newIndex);
        if (wasPlaying && newIndex !== -1) {
            playSong();
        } else {
            pauseSong();
        }
        if (document.querySelector('#music-playlist-modal')) {
            showPlaylistModal();
        }
    };
}

async function loadPlaylistFromDB() {
    const db = getDB();
    const songsFromDB = await new Promise(resolve => {
        db.transaction(MUSIC_STORE_NAME, 'readonly').objectStore(MUSIC_STORE_NAME).getAll().onsuccess = e => resolve(e.target.result || []);
    });
    playlist.forEach(song => URL.revokeObjectURL(song.src));
    playlist = songsFromDB.map(song => ({
        id: song.id,
        title: song.title,
        src: URL.createObjectURL(song.file)
    }));
}

function loadSong(songIndex) {
    const titleElement = elements.musicPlayer.querySelector('.music-header span');

    if (songIndex < 0 || songIndex >= playlist.length) {
        elements.songTitle.textContent = "播放列表为空";
        if (titleElement) titleElement.textContent = "音乐"; 
        elements.audioElement.src = "";
        currentSongIndex = -1;
        pauseSong();
        return;
    }
    currentSongIndex = songIndex;
    const song = playlist[currentSongIndex];
    
    elements.songTitle.textContent = song.title;
    if (titleElement) titleElement.textContent = `正在播放: ${song.title}`;

    elements.audioElement.src = song.src;

    document.dispatchEvent(new CustomEvent('log-event', {
        detail: { message: `Audio stream set to: ${song.title}`, type: 'info' }
    }));
    
    const modal = document.querySelector('#music-playlist-modal');
    if(modal) {
        modal.querySelectorAll('.playlist-song-item').forEach((item, index) => {
            item.classList.toggle('playing', index === currentSongIndex);
        });
    }
}

function playSong() {
    if (currentSongIndex === -1 && playlist.length > 0) {
        loadSong(0);
    }
    if (currentSongIndex === -1) return;
    isPlaying = true;
    elements.playPauseBtn.textContent = '⏸️';
    elements.audioElement.play().catch(e => console.error("Playback failed:", e));
    document.dispatchEvent(new CustomEvent('log-event', { detail: { message: `Playback started.`, type: 'action' } }));
}

function pauseSong() {
    isPlaying = false;
    elements.playPauseBtn.textContent = '▶️';
    elements.audioElement.pause();
    document.dispatchEvent(new CustomEvent('log-event', { detail: { message: `Playback paused.`, type: 'action' } }));
}

export function togglePlayPause() { 
    if (isPlaying) {
        pauseSong();
    } else {
        playSong();
    }
}

export function nextSong() {
    if (playlist.length === 0) return;
    const nextIndex = (currentSongIndex + 1) % playlist.length;
    loadSong(nextIndex);
    if (isPlaying || playlist.length === 1) playSong();
}

export function prevSong() {
    if (playlist.length === 0) return;
    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    loadSong(prevIndex);
    if (isPlaying || playlist.length === 1) playSong();
}

export function handleMusicUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const db = getDB();
    const transaction = db.transaction(MUSIC_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUSIC_STORE_NAME);
    files.forEach(file => {
        store.add({ title: file.name.replace(/\.[^/.]+$/, ""), file: file });
    });
    transaction.oncomplete = async () => {
        const shouldStartPlaying = !isPlaying;
        await loadPlaylistFromDB();
        if (shouldStartPlaying && playlist.length > 0) {
            loadSong(playlist.length - files.length);
            playSong();
        }
        elements.musicUploadInput.value = '';
    };
}

export function makeDraggable(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;
    const onMouseDown = (e) => {
        if (e.target !== handle && !handle.contains(e.target)) return;
        isDragging = true;
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    };
    const onMouseMove = (e) => {
        if (!isDragging) return;
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;
        element.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
        element.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    };
    const onMouseUp = () => {
        isDragging = false;
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
    };
    handle.addEventListener('mousedown', onMouseDown);
}

export async function initMusicPlayer() {
    await loadPlaylistFromDB();
    loadSong(0);
    applyMusicPlayerTheme();
    makeDraggable(elements.musicPlayer, elements.musicPlayer.querySelector('.music-header'));
}