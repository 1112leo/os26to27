import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const base = resolve(root);
const port = Number(process.argv[2] || 5176);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    let file = resolve(base, '.' + decodeURIComponent(url.pathname));
    if (file !== base && !file.startsWith(base + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (url.pathname === '/') {
      response.writeHead(404, { 'Content-Type': types['.html'] });
      response.end(await readFile(resolve(base, '404.html')));
      return;
    }
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { Location: url.pathname + '/' + url.search });
        response.end();
        return;
      }
      file = resolve(file, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('404');
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${port}\n`));
