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

    const CORE_FILES = [
        '/js/',
        '/style.css',
        '/main.js',
        '/index.html',
        '/favicon.ico',
        '/jszip.min.js', // <-- 放行 jszip
        '/lunr.min.js',  // <-- 放行 lunr
        '/fonts/'        // <-- 放行所有字体文件
    ];

    // 如果请求的路径以任何一个核心文件/文件夹开头，就直接返回，不拦截
    if (CORE_FILES.some(corePath => path.startsWith(corePath)) || path === '/') {
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