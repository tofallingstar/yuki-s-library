importScripts('jszip.min.js');

let activeZip = null;

function getMimeType(path) {
    const extension = path.split('.').pop().toLowerCase();
    const mimeTypes = {
        'css': 'text/css', 'js': 'application/javascript', 'html': 'text/html', 'xhtml': 'application/xhtml+xml',
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
        'ttf': 'font/ttf', 'otf': 'font/otf', 'woff': 'font/woff', 'woff2': 'font/woff2'
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'ACTIVATE_EPUB') {
        const file = event.data.file;
        console.log('[SW] 收到激活指令，准备处理:', file.name);
        try {
            activeZip = await JSZip.loadAsync(file);
            console.log('[SW] EPUB已激活，文件系统准备就绪。');
        } catch (error) {
            console.error('[SW] 激活EPUB失败:', error);
            activeZip = null;
        }
    }
});

self.addEventListener('fetch', (event) => {
    if (!activeZip) {
        return;
    }

    const url = new URL(event.request.url);
    const path = url.pathname;

    // 应用自身的静态资源放行（用后缀匹配，部署在 GitHub Pages 的子路径下也能正确放行）
    const CORE_PATTERNS = [
        /\/js\//,
        /\/vendor\//,
        /\/fonts\//,
        /\/docs\//,
        /\/style\.css$/,
        /\/index\.html$/,
        /\/jszip\.min\.js$/,
        /\/sw\.js$/,
        /\/manifest\.json$/,
        /\/favicon\.ico$/,
    ];

    if (path.endsWith('/') || path === '/' || CORE_PATTERNS.some(pattern => pattern.test(path))) {
        return;
    }

    if (url.origin === self.origin && event.request.method === 'GET') {
        const decodedPath = decodeURIComponent(path);
        const filename = decodedPath.substring(decodedPath.lastIndexOf('/') + 1);

        if (!filename) return;

        const searchRegex = new RegExp(`(^|/)${filename}$`, 'i'); // 添加 'i' 忽略大小写
        const filesFound = activeZip.file(searchRegex);

        if (filesFound.length > 0) {
            const fileInZip = filesFound[0];
            console.log(`[SW] 智能路径匹配: 请求 '${filename}', 找到并提供 '${fileInZip.name}'`);
            
            event.respondWith(
                fileInZip.async('blob').then(blob => {
                    const headers = new Headers();
                    headers.append('Access-Control-Allow-Origin', '*');
                    headers.append('Content-Type', getMimeType(fileInZip.name));
                    return new Response(blob, {
                        status: 200,
                        statusText: 'OK',
                        headers: headers
                    });
                })
            );
        } else {
            console.warn(`[SW] 在EPUB中未找到文件: ${filename}`);
            event.respondWith(new Response('File not found in EPUB', { status: 404 }));
        }
    }
});