#!/usr/bin/env node
// Claude Buddy — computer-side HTTP server
//
// Usage:  node server.js [--port 9876]
//
// Allowlist is persisted to ~/.claude/buddy-allowlist.json
// { "Bash": true, "Edit": true, ... }

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT          = parseInt(process.argv[process.argv.indexOf('--port') + 1] || '9876', 10);
const ALLOWLIST_PATH = path.join(process.env.HOME, '.claude', 'buddy-allowlist.json');
const WAIT_TIMEOUT_MS = 60000;

// ── Allowlist ─────────────────────────────────────────────────────────────
function loadAllowlist() {
  try { return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')); }
  catch (e) { return {}; }
}

function saveAllowlist(list) {
  try { fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(list, null, 2)); }
  catch (e) { console.error('Could not save allowlist:', e.message); }
}

let allowlist = loadAllowlist();

// ── Shared state ──────────────────────────────────────────────────────────
let state = { status: 'idle', tool: '', input: '' };
let pendingResolve  = null;
let pendingTimeout  = null;

function clearPending() {
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  pendingResolve = null;
}

// ── HTTP server ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /status — Pebble polls this ──────────────────────────────────
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  // ── POST /state — hooks update status without waiting ─────────────────
  if (req.method === 'POST' && req.url === '/state') {
    readBody(req, (data) => {
      state.status = data.status || 'idle';
      state.tool   = data.tool   || '';
      state.input  = data.input  || '';
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // ── POST /wait — pre-tool hook: check allowlist, then block for response
  if (req.method === 'POST' && req.url === '/wait') {
    readBody(req, (data) => {
      const toolName = data.tool || '';

      // Auto-approve if on the allowlist
      if (allowlist[toolName]) {
        console.log(`[allowlist] auto-approved: ${toolName}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ approved: true, always: false }));
        return;
      }

      // Show on watch and wait
      state.status = 'waiting';
      state.tool   = toolName;
      state.input  = data.input || '';

      if (pendingResolve) pendingResolve({ approved: false, always: false });
      clearPending();

      pendingTimeout = setTimeout(() => {
        console.log('[timeout] auto-approved after 60s');
        if (pendingResolve) {
          pendingResolve({ approved: true, always: false });
          clearPending();
        }
      }, WAIT_TIMEOUT_MS);

      pendingResolve = (result) => {
        clearPending();
        state.status = 'idle';
        state.tool   = '';
        state.input  = '';

        if (result.always) {
          allowlist[toolName] = true;
          saveAllowlist(allowlist);
          console.log(`[allowlist] added: ${toolName}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      };
    });
    return;
  }

  // ── POST /respond — Pebble JS forwards watch button result ────────────
  // Body: { response: 0 (deny) | 1 (allow) | 2 (allow always) }
  if (req.method === 'POST' && req.url === '/respond') {
    readBody(req, (data) => {
      const r = parseInt(data.response, 10);
      if (pendingResolve) {
        pendingResolve({ approved: r >= 1, always: r === 2 });
      }
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // ── GET /allowlist — inspect current allowlist ────────────────────────
  if (req.method === 'GET' && req.url === '/allowlist') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(allowlist, null, 2));
    return;
  }

  // ── DELETE /allowlist/:tool — remove a tool from the allowlist ─────────
  if (req.method === 'DELETE' && req.url.startsWith('/allowlist/')) {
    const tool = decodeURIComponent(req.url.slice('/allowlist/'.length));
    delete allowlist[tool];
    saveAllowlist(allowlist);
    console.log(`[allowlist] removed: ${tool}`);
    res.writeHead(200); res.end('ok');
    return;
  }

  res.writeHead(404); res.end('not found');
});

function readBody(req, cb) {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    try { cb(JSON.parse(body)); }
    catch (e) { cb({}); }
  });
}

server.listen(PORT, () => {
  console.log(`Claude Buddy server running on http://localhost:${PORT}`);
  console.log(`Allowlist: ${ALLOWLIST_PATH}`);
  console.log(`Current allowlist: ${JSON.stringify(allowlist)}`);
  console.log(`Find your local IP:  hostname -I | awk '{print $1}'`);
});
