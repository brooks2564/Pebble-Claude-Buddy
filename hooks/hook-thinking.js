#!/usr/bin/env node
// Called by PostToolUse hook to reset status.
// Usage: node hook-thinking.js thinking|idle

const SERVER = process.env.CLAUDE_BUDDY_URL || 'https://appraiser-aviation-polka.ngrok-free.dev';
const status = process.argv[2] || 'idle';

const https = require('https');
const body  = JSON.stringify({ status });
const url   = new URL(SERVER + '/state');

const req = https.request({
  hostname: url.hostname,
  port:     url.port || 443,
  path:     '/state',
  method:   'POST',
  headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  timeout:  2000,
}, () => {});

req.on('error', () => {});
req.write(body);
req.end();
