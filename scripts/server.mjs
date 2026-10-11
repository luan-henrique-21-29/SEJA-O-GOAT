import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const root = await realpath(process.argv.includes('--dist') ? path.join(projectRoot, 'dist') : projectRoot);
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const server = http.createServer(async (request, response) => {
  const reply = (status, message) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return reply(405, 'Método não permitido.');
  }
  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    return reply(400, 'Endereço inválido.');
  }
  // Check the original decoded target before any path normalization.
  const segments = pathname.split('/');
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || segments.includes('..')) {
    return reply(403, 'Acesso negado.');
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname !== '/index.html' && !pathname.startsWith('/src/') && !pathname.startsWith('/assets/')) {
    return reply(404, 'Arquivo não encontrado.');
  }
  if (segments.some(segment => segment.startsWith('.'))) return reply(403, 'Acesso negado.');

  try {
    const filename = await realpath(path.join(root, pathname.slice(1)));
    if (!filename.startsWith(root + path.sep)) return reply(403, 'Acesso negado.');
    const info = await stat(filename);
    if (!info.isFile()) return reply(404, 'Arquivo não encontrado.');
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(filename);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return reply(404, 'Arquivo não encontrado.');
    if (error.code === 'EACCES') return reply(403, 'Acesso negado.');
    console.error('Erro ao servir um arquivo:', error.message);
    return reply(500, 'Erro interno do servidor.');
  }
});
server.on('error', error => {
  console.error(`Não foi possível iniciar o servidor: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`Football Life Brasil em http://${displayHost}:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
