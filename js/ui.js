// js/ui.js —— 通用 UI 小工具：Toast 通知、正则转义、节流

const TOAST_ICONS = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
};

function getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * 非阻塞提示，替代 alert()。
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} type
 * @param {number} duration 毫秒，0 表示不自动消失
 */
export function toast(message, type = 'info', duration = 3200) {
    const container = getContainer();
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span class="toast-text"></span>`;
    item.querySelector('.toast-text').textContent = message;
    container.appendChild(item);

    requestAnimationFrame(() => item.classList.add('toast-in'));

    const remove = () => {
        item.classList.remove('toast-in');
        item.classList.add('toast-out');
        setTimeout(() => item.remove(), 240);
    };
    if (duration > 0) setTimeout(remove, duration);
    item.addEventListener('click', remove);
    return remove;
}

/** 把用户输入安全地放进 new RegExp / replace 里 */
export function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 简单的尾部节流：连续调用只在安静 waitMs 后执行一次 */
export function debounce(fn, waitMs = 300) {
    let timer = null;
    const wrapped = (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, waitMs);
    };
    wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    wrapped.flush = (...args) => { if (timer) clearTimeout(timer); timer = null; fn(...args); };
    return wrapped;
}

/** 把 0~1 的进度格式化成百分比文本 */
export function percentText(value) {
    if (!Number.isFinite(value)) return '';
    const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
    return `${pct}%`;
}

/**
 * 应用内确认框，替代原生 confirm()。
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
    title = '确认操作',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
} = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" role="alertdialog" aria-modal="true">
                <h3 class="modal-title"></h3>
                <p class="modal-message"></p>
                <div class="modal-actions">
                    <button type="button" class="modal-btn modal-cancel"></button>
                    <button type="button" class="modal-btn modal-confirm"></button>
                </div>
            </div>
        `;
        overlay.querySelector('.modal-title').textContent = title;
        overlay.querySelector('.modal-message').textContent = message;
        overlay.querySelector('.modal-confirm').textContent = confirmText;
        overlay.querySelector('.modal-cancel').textContent = cancelText;
        if (danger) overlay.querySelector('.modal-confirm').classList.add('modal-danger');

        const close = (result) => {
            document.removeEventListener('keydown', onKeydown, true);
            overlay.remove();
            resolve(result);
        };
        const onKeydown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                close(false);
            }
        };
        overlay.querySelector('.modal-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.modal-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
        document.addEventListener('keydown', onKeydown, true);
        document.body.appendChild(overlay);
        overlay.querySelector('.modal-confirm').focus();
    });
}

export function promptDialog({
    title = '请输入',
    placeholder = '',
    value = '',
    confirmText = '确定',
    cancelText = '取消',
} = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <form class="modal-card" novalidate>
                <h3 class="modal-title"></h3>
                <input class="modal-input" type="text" autocomplete="off">
                <div class="modal-actions">
                    <button type="button" class="modal-btn modal-cancel"></button>
                    <button type="submit" class="modal-btn modal-confirm"></button>
                </div>
            </form>
        `;
        overlay.querySelector('.modal-title').textContent = title;
        overlay.querySelector('.modal-confirm').textContent = confirmText;
        overlay.querySelector('.modal-cancel').textContent = cancelText;
        const input = overlay.querySelector('.modal-input');
        input.placeholder = placeholder;
        input.value = value;

        const close = (result) => {
            document.removeEventListener('keydown', onKeydown, true);
            overlay.remove();
            resolve(result);
        };
        const submit = () => {
            const text = input.value.trim();
            if (!text) {
                input.classList.add('modal-input-invalid');
                input.focus();
                return;
            }
            close(text);
        };
        const onKeydown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                close(null);
            }
        };

        overlay.querySelector('.modal-cancel').addEventListener('click', () => close(null));
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
        overlay.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            submit();
        });
        document.addEventListener('keydown', onKeydown, true);
        document.body.appendChild(overlay);
        input.focus();
        input.select();
    });
}

