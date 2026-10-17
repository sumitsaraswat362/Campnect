import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, resolve } from 'node:path';

const port = Number(process.env.PORT || 5000);
const basePath = normalizeBasePath(process.env.BASE_PATH || '/');
const upstreamOrigin = normalizeUpstreamOrigin(process.env.CAMPNECT_API_ORIGIN);
const serviceSecret = process.env.ADMIN_PANEL_SERVICE_SECRET;
const publicDir = resolve('dist/public');

if (!upstreamOrigin) {
  throw new Error('CAMPNECT_API_ORIGIN is required for the Admin Panel server.');
}
if (!serviceSecret) {
  throw new Error('ADMIN_PANEL_SERVICE_SECRET is required for the Admin Panel server.');
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const relativePath = requestUrl.pathname.startsWith(basePath)
    ? requestUrl.pathname.slice(basePath.length - 1)
    : requestUrl.pathname;

  if (relativePath === '/api' || relativePath.startsWith('/api/')) {
    await proxyAdminRequest(req, res, relativePath, requestUrl.search);
    return;
  }

  if (!requestUrl.pathname.startsWith(basePath)) {
    res.writeHead(404).end('Not found');
    return;
  }

  const requestedFile = relativePath === '/' ? 'index.html' : relativePath.slice(1);
  const filePath = safeStaticPath(requestedFile);
  // The entry document must never be cached: it references hashed asset
  // filenames that change on every build, and a cached stale copy (or one
  // cached earlier with a wrong Content-Type) would otherwise keep loading
  // broken/old assets indefinitely, surviving even a hard refresh.
  if (filePath && filePath !== join(publicDir, 'index.html') && existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': mimeType(filePath), 'Cache-Control': 'public, max-age=31536000, immutable' });
    createReadStream(filePath).pipe(res);
    return;
  }

  const indexFile = join(publicDir, 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  createReadStream(indexFile).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Campnect Admin server listening on port ${port}${basePath}`);
});

async function proxyAdminRequest(req, res, relativePath, search) {
  const target = new URL(`${relativePath}${search}`, upstreamOrigin);
  const body = ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await readBody(req);
  const headers = new Headers();
  const authorization = req.headers.authorization;
  const contentType = req.headers['content-type'];
  const requestId = req.headers['x-request-id'];
  if (authorization) headers.set('Authorization', authorization);
  if (contentType) headers.set('Content-Type', contentType);
  if (requestId) headers.set('X-Request-ID', String(requestId));
  headers.set('X-Admin-Panel-Service-Secret', serviceSecret);

  try {
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    const responseType = upstream.headers.get('content-type');
    if (responseType) res.setHeader('Content-Type', responseType);
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(upstream.status).end(responseBody);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ success: false, error: { code: 'ADMIN_UPSTREAM_UNAVAILABLE', message: 'Admin service is temporarily unavailable.' } }));
  }
}

function normalizeBasePath(value) {
  const path = `/${String(value).replace(/^\/+|\/+$/g, '')}`;
  return path === '/' ? '/' : `${path}/`;
}

function normalizeUpstreamOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeStaticPath(requestedFile) {
  const candidate = resolve(publicDir, requestedFile);
  return candidate.startsWith(`${publicDir}/`) ? candidate : null;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function mimeType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  if (filePath.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}