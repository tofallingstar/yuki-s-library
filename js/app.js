import { elements } from './dom.js'; 
import { YUKI_EVENTS } from './events.js';
import { switchToBookshelfView, loadBookshelf, handleFileUpload } from './bookshelf.js';
import { openEpub, destroyRendition } from './reader.js';

class App {
    constructor() {
        this.state = {
            currentView: 'bookshelf',
        };
    }

    start() {
        console.log("App is starting...");
        this.bindGlobalListeners();
        switchToBookshelfView();
        loadBookshelf();
    }

    bindGlobalListeners() {
        // --- 视图切换 ---
        document.addEventListener(YUKI_EVENTS.REQUEST_VIEW_CHANGE, (event) => {
            const { view, bookId } = event.detail;
            this.changeView(view, { bookId });
        });

        // --- 文件上传 ---
        document.addEventListener(YUKI_EVENTS.FILES_DROPPED, (event) => {
            const { files } = event.detail;
            const pseudoEvent = { target: { files: files } };
            handleFileUpload(pseudoEvent);
        });

        // --- 全局拖拽 ---
        const dropZone = document.body;
        dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = event.dataTransfer.files;
            if (files.length > 0) {
                document.dispatchEvent(new CustomEvent(YUKI_EVENTS.FILES_DROPPED, {
                    detail: { files }
                }));
            }
        });
    }

    changeView(viewName, options = {}) {
        if (this.state.currentView === viewName && viewName !== 'reader') return;

        this.state.currentView = viewName;
        document.dispatchEvent(new CustomEvent('log-event', { detail: { message: `Changing view to: ${viewName}`, type: 'system' } }));

        // 根据视图名称，切换侧边栏的禁用状态
        if (viewName === 'reader') {
            elements.navigationSidebar.classList.add('disabled');
        } else {
            elements.navigationSidebar.classList.remove('disabled');
        }


        if (viewName === 'bookshelf') {
            destroyRendition();
            switchToBookshelfView();
        } else if (viewName === 'reader' && options.bookId) {
            openEpub(options.bookId);
        }
    }
}

export const app = new App();