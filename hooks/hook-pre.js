#!/usr/bin/env node
// Pre-tool-use hook — called by Claude Code before every tool use.
// Exit 0 = allow, exit 1 = block

const SERVER = process.env.CLAUDE_BUDDY_URL || 'https://appraiser-aviation-polka.ngrok-free.dev';

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let toolName  = 'unknown';
  let toolInput = '';
  try {
    const hook = JSON.parse(raw);
    toolName  = hook.tool_name || hook.tool || 'unknown';
    const inp = hook.tool_input || hook.input || {};
    toolInput = inp.command || inp.file_path || inp.url || inp.query || JSON.stringify(inp).substring(0, 60);
  } catch (e) {}

  const https = require('https');
  const body  = JSON.stringify({ tool: toolName, input: toolInput });
  const url   = new URL(SERVER + '/wait');

  const req = https.request({
    hostname: url.hostname,
    port:     url.port || 443,
    path:     '/wait',
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout:  65000,
  }, (res) => {
    let resp = '';
    res.on('data', d => resp += d);
    res.on('end', () => {
      try {
        const data = JSON.parse(resp);
        if (data.approved) {
          process.exit(0);
        } else {
          process.stderr.write(JSON.stringify({ reason: 'Denied from Pebble watch' }) + '\n');
          process.exit(1);
        }
      } catch (e) {
        process.exit(0);
      }
    });
  });

  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(body);
  req.end();
});
