#!/usr/bin/env node
// Pre-tool-use hook — called by Claude Code before every tool use.
// Reads the hook input from stdin (JSON), sends tool info to the server,
// and waits for a watch response before exiting.
//
// Exit 0 = allow, exit 1 = block (with JSON to stderr)

const SERVER = process.env.CLAUDE_BUDDY_URL || 'http://localhost:9876';

let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  let toolName  = 'unknown';
  let toolInput = '';
  try {
    const hook = JSON.parse(raw);
    toolName  = hook.tool_name || hook.tool || 'unknown';
    const inp = hook.tool_input || hook.input || {};
    // Grab the most useful short snippet from the input
    toolInput = inp.command || inp.file_path || inp.url || inp.query || JSON.stringify(inp).substring(0, 60);
  } catch (e) {}

  const http = require('http');
  const body = JSON.stringify({ tool: toolName, input: toolInput });
  const url  = new URL(SERVER + '/wait');

  const req = http.request({
    hostname: url.hostname,
    port:     url.port || 80,
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
          process.exit(0); // allow
        } else {
          process.stderr.write(JSON.stringify({ reason: 'Denied from Pebble watch' }) + '\n');
          process.exit(1); // block
        }
      } catch (e) {
        process.exit(0); // parse error — allow by default
      }
    });
  });

  req.on('error', () => process.exit(0)); // server not running — allow by default
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(body);
  req.end();
});
