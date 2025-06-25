// 暂废弃方案
/**
 * @param {string} iconName - Lucide Icon 的名称。
 * @param {object} options - 可选的图标属性。
 * @returns {string} SVG 图像的 HTML 字符串。
 */
function createIconSvg(iconName, options = {}) {
    if (!window.lucide || !window.lucide.icons[iconName]) {
        console.warn(`Icon '${iconName}' not found in lucide library.`);
        return ''; // 如果图标库未加载或图标不存在，返回空字符串
    }

    const { size = 20, color = 'currentColor', strokeWidth = 2 } = options;
    const iconNode = window.lucide.icons[iconName];
    const svg = iconNode.toSvg({
        width: size,
        height: size,
        'stroke-width': strokeWidth,
        color: color,
    });
    return svg;
}


/**
 * 替换指定元素的内容为一个 Lucide Icon。
 * @param {HTMLElement} element - 要被替换图标的DOM元素。
 * @param {string} iconName - Lucide Icon 的名称。
 * @param {object} options - 可选的图标属性。
 */
export function replaceWithIcon(element, iconName, options = {}) {
    if (!element) return;
    element.innerHTML = createIconSvg(iconName, options);
}

/**
 * 这是一个集中的函数，用来在应用启动时统一替换所有需要图标的按钮。
 */
export function initIcons() {
    if (!window.lucide) {
        console.error("Lucide icon library not loaded yet. Cannot initialize icons.");
        return;
    }
    console.log("Initializing icons...");
    
    // 阅读器工具栏
    replaceWithIcon(document.getElementById('back-to-shelf-btn'), 'arrow-left-from-line', { size: 18 });
    replaceWithIcon(document.getElementById('analyze-text-btn'), 'bar-chart-3', { size: 18 });
    replaceWithIcon(document.getElementById('coke-btn'), 'beer', { size: 18 });
    replaceWithIcon(document.getElementById('font-size-decrease'), 'minus', { size: 18 });
    replaceWithIcon(document.getElementById('font-size-increase'), 'plus', { size: 18 });

    // 阅读器翻页箭头
    replaceWithIcon(document.getElementById('prev'), 'chevron-left', { size: 28 });
    replaceWithIcon(document.getElementById('next'), 'chevron-right', { size: 28 });

    // 音乐播放器
    replaceWithIcon(document.getElementById('add-music-btn'), 'list-music', { size: 22 });
    replaceWithIcon(document.getElementById('prev-song-btn'), 'skip-back', { size: 22 });
    replaceWithIcon(document.getElementById('play-pause-btn'), 'play', { size: 22 });
    replaceWithIcon(document.getElementById('next-song-btn'), 'skip-forward', { size: 22 });
    replaceWithIcon(document.getElementById('playlist-btn'), 'list-ordered', { size: 22 });
    
    // 侧边栏
    const createListBtn = document.getElementById('create-list-btn');
    if (createListBtn) {
        createListBtn.innerHTML = createIconSvg('plus-circle', {size: 16, style: 'margin-right: 8px; vertical-align: middle;'}) + " 新建列表";
    }

    console.log("Icons initialized.");
}

/**
 * 特殊函数，用于更新播放/暂停按钮的图标状态
 * @param {boolean} isPlaying - 当前是否正在播放
 */
export function updatePlayPauseIcon(isPlaying) {
    const iconName = isPlaying ? 'pause' : 'play';
    replaceWithIcon(document.getElementById('play-pause-btn'), iconName, { size: 22 });
}