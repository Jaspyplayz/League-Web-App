#!/usr/bin/env bash
# Stop only the dev server launch.sh started (its process group, from the state file).
# Never kills by process name. Keeps .cache/verify-turnpoint/ (the evidence).
set -uo pipefail
STATE=/tmp/verify-turnpoint/instance.json
if [ ! -f "$STATE" ]; then echo "nothing to clean: no instance started by launch.sh"; exit 0; fi
PID=$(node -e "console.log(require('$STATE').pid)")
PGID=$(node -e "console.log(require('$STATE').pgid)")
PORT=$(node -e "console.log(require('$STATE').port)")
ROOT=$(node -e "console.log(require('$STATE').root)")
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM -- "-$PGID" 2>/dev/null
  for i in $(seq 1 10); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -KILL -- "-$PGID" 2>/dev/null || true
fi
rm -f "$STATE" "/tmp/verify-turnpoint/dev-$PORT.log"
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "WARNING: port $PORT still answers"; exit 1; fi
echo "stopped pid $PID (group $PGID), port $PORT free"
echo "evidence kept: $ROOT/.cache/verify-turnpoint/"
ls -1 "$ROOT/.cache/verify-turnpoint/" 2>/dev/null | tail -5
