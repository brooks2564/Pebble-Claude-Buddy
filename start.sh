#!/bin/bash
# Claude Buddy — start server + ngrok tunnel together
# Run this in a terminal and leave it open while using Claude Code.
#
# Watch app URL: https://appraiser-aviation-polka.ngrok-free.dev

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the Node server in the background
node "$SCRIPT_DIR/server/server.js" &
SERVER_PID=$!
echo "Server started (PID $SERVER_PID)"

# Give it a moment to bind the port
sleep 1

# Start ngrok tunnel (runs in foreground so Ctrl+C stops both)
trap "kill $SERVER_PID 2>/dev/null; exit" INT TERM
ngrok http --domain=appraiser-aviation-polka.ngrok-free.dev 9876
kill $SERVER_PID 2>/dev/null
