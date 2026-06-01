# Claude Buddy

A Pebble smartwatch app that keeps you in the loop while Claude Code works — and lets you approve or deny tool calls right from your wrist.

## What it does

- **Shows Claude's status** in real time: Idle, Thinking, or Waiting for permission
- **Buzzes your wrist** when Claude wants to run a `Bash`, `Edit`, or `Write` command
- **Three response options** so you stay in control without interrupting your flow

## Responding to a permission prompt

### All models (buttons)
| Button | Action |
|--------|--------|
| UP | Allow once |
| SELECT | Allow always (remembers this tool) |
| DOWN | Deny |

### Touch-capable models (emery, gabbro)
Tap one of three color-coded zones that appear on screen:

| Zone | Color | Action |
|------|-------|--------|
| Top | Green | Allow once |
| Middle | Blue | Allow always |
| Bottom | Red | Deny |

Buttons still work on touch models too.

## Allow always

Tapping **Allow always** (SELECT or middle zone) adds that tool to `~/.claude/buddy-allowlist.json`. Future requests from that tool are auto-approved without waking the watch.

To revoke:
```bash
curl -X DELETE http://localhost:9876/allowlist/Bash
```

To inspect:
```bash
curl http://localhost:9876/allowlist
```

## Setup

### 1. Install the watch app
```bash
pebble build
pebble install --phone <your-phone-ip>
```

### 2. Start the server (leave running)
```bash
node server/server.js
```

### 3. Configure the server URL on your watch
Open the Pebble app on your phone → Claude Buddy → gear icon → enter `http://<your-computer-ip>:9876`

Find your IP: `hostname -I | awk '{print $1}'`

### 4. Wire up Claude Code hooks
Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{ "type": "command", "command": "node /path/to/Pebble-Claude-Buddy/hooks/hook-pre.js" }]
    }],
    "PostToolUse": [{
      "matcher": "Bash|Edit|Write",
      "hooks": [{ "type": "command", "command": "node /path/to/Pebble-Claude-Buddy/hooks/hook-thinking.js idle" }]
    }]
  }
}
```

## Architecture

```
Claude Code (computer)
  └── hooks/hook-pre.js        ← blocks before Bash/Edit/Write, waits for watch
  └── hooks/hook-thinking.js   ← resets status to idle after tool completes
        │ HTTP
        ▼
  server/server.js             ← Node.js server (port 9876, manages allowlist)
        │ HTTP polling
        ▼
  src/pkjs/index.js            ← PebbleKit JS on phone, polls every 1.5s
        │ AppMessage (Bluetooth)
        ▼
  src/c/main.c                 ← Pebble watchapp — face animation + touch/buttons
```

If the server is unreachable (watch off, wrong IP), hooks exit 0 and Claude proceeds normally — it never blocks your work.

## Platforms

Supports all 7 Pebble platforms: aplite, basalt, chalk, diorite, emery, flint, gabbro.

## CloudPebble

Import directly into CloudPebble (use [cloudpebble.repebble.com](https://cloudpebble.repebble.com)):

```
https://cloudpebble.repebble.com/ide/import/github/brooks2564/Pebble-Claude-Buddy
```

## Inspired by

[Anthropic's claude-desktop-buddy](https://github.com/anthropics/claude-desktop-buddy) — an open-source ESP32 desk pet that does the same thing with a physical microcontroller.
