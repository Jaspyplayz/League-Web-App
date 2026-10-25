#!/usr/bin/env bash
# Start a Turnpoint dev server for verification, owned by this run.
#   .cursor/skills/verify-turnpoint/scripts/launch.sh [port]     (default port 3100, never 3000)
# Ready = the home page answers 200 AND renders "Find the minute" (first request compiles it).
# Writes /tmp/verify-turnpoint/instance.json {pid, pgid, port, base, log}; drive.ts reads it.
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
PORT="${1:-${PORT:-3100}}"
STATE_DIR=/tmp/verify-turnpoint
STATE="$STATE_DIR/instance.json"
LOG="$STATE_DIR/dev-$PORT.log"
mkdir -p "$STATE_DIR"
cd "$ROOT"

if [ "$PORT" = "3000" ]; then echo "refusing port 3000: it may be Jasper's own server"; exit 1; fi
if [ -f "$STATE" ]; then
  OLD_PID=$(node -e "console.log(require('$STATE').pid)")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "an instance from an earlier run is still up (pid $OLD_PID). Run cleanup.sh first, or drive it after doctor.sh."; exit 1
  fi
  rm -f "$STATE"
fi
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "port $PORT is already taken by someone else; pick another: launch.sh 3101"; exit 1; fi
# next dev keeps a lock in .next/dev: one dev server per checkout.
if [ ! -d node_modules/next ]; then echo "installing deps (npm ci)"; npm ci --no-audit --no-fund >/dev/null; fi
if [ ! -f .env.local ]; then
  echo "note: no .env.local -> no RIOT_API_KEY / DATABASE_URL / Supabase. Only journeys that need 'nothing' can pass here; drive the live site or a preview for the rest."
fi

# setsid: own process group, so cleanup.sh kills exactly this server and its children.
setsid npx next dev -p "$PORT" -H 127.0.0.1 >"$LOG" 2>&1 < /dev/null &
PID=$!
PGID=$(ps -o pgid= "$PID" | tr -d ' ')
BASE="http://127.0.0.1:$PORT"
printf '{"pid":%s,"pgid":%s,"port":%s,"base":"%s","log":"%s","root":"%s"}\n' "$PID" "$PGID" "$PORT" "$BASE" "$LOG" "$ROOT" >"$STATE"

for i in $(seq 1 120); do
  if ! kill -0 "$PID" 2>/dev/null; then echo "dev server exited. Log:"; tail -40 "$LOG"; rm -f "$STATE"; exit 1; fi
  if grep -q "Ready in" "$LOG" && curl -fsS -m 60 "$BASE/" 2>/dev/null | grep -q "Find the minute"; then
    echo "ready: $BASE (pid $PID, log $LOG)"; exit 0
  fi
  sleep 1
done
echo "not ready after 120s. Log:"; tail -40 "$LOG"; exit 1
