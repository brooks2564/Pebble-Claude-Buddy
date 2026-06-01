#!/usr/bin/env node
// Called by a PostToolUse or notification hook to update Claude's status.
// Usage: node hook-thinking.js thinking|idle

const SERVER = process.env.CLAUDE_BUDDY_URL || 'http://localhost:9876';
const status = process.argv[2] || 'idle';

const http = require('http');
const body = JSON.stringify({ status });
const url  = new URL(SERVER + '/state');

const req = http.request({
  hostname: url.hostname,
  port:     url.port || 80,
  path:     '/state',
  method:   'POST',
  headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  timeout:  2000,
}, () => {});

req.on('error', () => {});
req.write(body);
req.end();
