import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientDirectory } from './paths.mjs';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self'; frame-ancestors 'none'";

// Serve compiled public UI assets only. No source tree or saved game directories
// are reachable through this handler. Headless operation needs no frontend build.
export function serveClient(request, response, url, { liveTableUrl = '/', root = true, directory = clientDirectory } = {}) {
  const route = (root && url.pathname === '/') || /^\/games(?:\/[A-Za-z0-9_-]{1,120})?\/?$/.test(url.pathname);
  const asset = /^\/assets\/([A-Za-z0-9_.-]+\.(?:js|css|svg|png|woff2))$/.exec(url.pathname);
  const config = url.pathname === '/api/ui';
  if (!route && !asset && !config) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return true; }
  if (config) {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ liveTableUrl })); return true;
  }
  try {
    const file = asset ? join(directory, 'assets', asset[1]) : join(directory, 'index.html');
    const data = readFileSync(file);
    response.writeHead(200, {
      'Content-Type': asset ? types[file.slice(file.lastIndexOf('.'))] : 'text/html; charset=utf-8',
      'Cache-Control': asset ? 'public, max-age=31536000, immutable' : 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': csp,
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(asset ? 404 : 503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(asset ? 'Asset unavailable.' : 'Build the Tabletop App with npm run tabletop:build, then reload.');
  }
  return true;
}
