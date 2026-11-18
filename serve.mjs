// serve.mjs —— 零依赖静态服务器：`npm start` 后打开 http://127.0.0.1:5173
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.argv[2] || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.epub': 'application/epub+zip',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = path.join(ROOT, pathname);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 ${pathname}`);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Yuki的图书馆：http://127.0.0.1:${PORT}`);
  console.log('按 Ctrl+C 停止服务');
});
