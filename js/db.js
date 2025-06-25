// js/db.js

export const DB_NAME = 'yuki_library_db';
export const DB_VERSION = 7;
export const BOOK_STORE_NAME = 'books';
export const LIST_STORE_NAME = 'lists';
export const MUSIC_STORE_NAME = 'music';
export const SETTINGS_STORE_NAME = 'settings';

let db;

export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject("DB Error: " + e.target.error);
        
        request.onupgradeneeded = (e) => {
            console.log(`正在进行数据库升级到版本 ${DB_VERSION}...`);
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains(BOOK_STORE_NAME)) {
                const bookStore = dbInstance.createObjectStore(BOOK_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                bookStore.createIndex('listId', 'listId', { unique: false });
                bookStore.createIndex('type', 'type', { unique: false });
            }
            if (!dbInstance.objectStoreNames.contains(LIST_STORE_NAME)) {
                dbInstance.createObjectStore(LIST_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!dbInstance.objectStoreNames.contains(MUSIC_STORE_NAME)) {
                dbInstance.createObjectStore(MUSIC_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!dbInstance.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
                dbInstance.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            console.log("数据库初始化成功，所有表已就绪。");
            resolve(db);
        };
    });
}

export function getDB() {
    if (!db) throw new Error("数据库尚未初始化！");
    return db;
}