# Claude Buddy — Claude Code Instructions

## Project Overview
**Claude Buddy** is a Pebble watchapp that mirrors Claude Code's activity in real time.
- Shows Claude's status (idle / thinking / waiting for permission) on your wrist
- Buzzes and shows the tool name when Claude needs permission to run a command
- UP button = Allow, DOWN button = Deny
UUID: `c1a2de30-b7f4-4e8a-9c12-0f5a6b7d8e9a`
GitHub: `brooks2564/Pebble-Claude-Buddy`

## Architecture
```
Claude Code (computer)
  └── hooks/hook-pre.js        ← blocks before each tool, waits for watch response
  └── hooks/hook-thinking.js   ← updates status to thinking/idle
        │ HTTP POST /wait, /state
        ▼
  server/server.js             ← Node.js HTTP server (port 9876)
        │ GET /status, POST /respond
        ▼
  src/pkjs/index.js            ← PebbleKit JS on phone, polls every 1.5s
        │ AppMessage
        ▼
  src/c/main.c                 ← Pebble watchapp — face animation + buttons
```

## Build & Install
```bash
cd /home/brooks2564/Pebble-Claude-Buddy
pebble build
cp build/Pebble-Claude-Buddy.pbw Pebble-Claude-Buddy.pbw
pebble install --phone 192.168.0.238
```

## Run the Server
```bash
node server/server.js
# Then open the Pebble app config page and set the URL to http://<your-ip>:9876
```

## Claude Code Hook Setup
Add to `~/.claude/settings.json` hooks section:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "node /home/brooks2564/Pebble-Claude-Buddy/hooks/hook-pre.js" }]
    }],
    "PostToolUse": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "node /home/brooks2564/Pebble-Claude-Buddy/hooks/hook-thinking.js idle" }]
    }]
  }
}
```
Set `CLAUDE_BUDDY_URL=http://localhost:9876` in your environment (or it defaults to that).

## File Structure
```
Pebble-Claude-Buddy/
├── package.json          ← Pebble manifest, all 7 platforms, 5 message keys
├── wscript               ← Build script
├── CLAUDE.md             ← This file
├── src/
│   ├── c/main.c          ← Watchapp C code (face animation, buttons)
│   └── pkjs/index.js     ← PebbleKit JS (polls server, relays AppMessage)
├── server/
│   └── server.js         ← Node.js HTTP server (runs on computer)
└── hooks/
    ├── hook-pre.js       ← Pre-tool-use hook (blocks for watch response)
    └── hook-thinking.js  ← Sets status to thinking or idle
```

## Message Keys
| Key        | ID | Direction        | Notes                          |
|------------|----|------------------|-------------------------------|
| STATUS     | 0  | JS → Watch       | 0=idle 1=thinking 2=waiting 3=approved 4=denied |
| TOOL_NAME  | 1  | JS → Watch       | Tool being requested           |
| TOOL_INPUT | 2  | JS → Watch       | Abbreviated input (60 chars)   |
| RESPONSE   | 3  | Watch → JS → srv | 1=allow 0=deny                 |
| ANIM_FRAME | 4  | JS → Watch       | Animation frame (0–11)         |

## Key Architecture Details
- **Watchapp** (not watchface) — button handling required
- **No SECOND_UNIT** — animation driven by AppTimer at 400ms
- **Dynamic bounds** — always `layer_get_bounds()`, never hardcode sizes
- **Color/B&W guard** — `#ifdef PBL_COLOR` for face colors
- **Permission flow**: server blocks on `/wait` → watch responds → hook-pre.js exits
- **Auto-deny timeout**: 60s if no watch response (server side)
- **Server unreachable**: hooks exit 0 (allow) so Claude isn't blocked when watch is off
- **Config page**: set server URL via Pebble app settings (gear icon)

## Target Platforms (all 7)
aplite, basalt, chalk, diorite, emery, flint, gabbro

## CloudPebble (repebble)
```
https://cloudpebble.repebble.com/ide/import/github/brooks2564/Pebble-Claude-Buddy
```
