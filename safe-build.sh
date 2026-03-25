#!/bin/zsh

set -u

ROOT_DIR="/Users/macbookbpm/Desktop/KOZA"
cd "$ROOT_DIR" || exit 1

SERVER_WAS_RUNNING=0
if ./start-dev.sh status >/dev/null 2>&1; then
  SERVER_WAS_RUNNING=1
  ./start-dev.sh stop >/dev/null 2>&1 || true
fi

rm -rf .next
npm run build
BUILD_EXIT=$?

if [[ "$SERVER_WAS_RUNNING" -eq 1 ]]; then
  ./start-dev.sh start >/dev/null 2>&1 || true
fi

exit "$BUILD_EXIT"