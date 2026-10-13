// Tiny static server for local use — no dependencies.
// Usage: node server.js   (or: npm start)   then open http://localhost:5500
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5500;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // never serve anything outside the project folder
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data);
  });
});

// If the port is taken (e.g. the server is already running), try the next one.
function start(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 20) {
      console.log(`Port ${port} is in use, trying ${port + 1}...`);
      start(port + 1);
    } else {
      throw err;
    }
  });
  // localhost only, so .env is never reachable from other devices on your network
  server.listen(port, '127.0.0.1', () => {
    console.log(`ChatGPT UI running at http://localhost:${port}`);
  });
}

start(PORT);
