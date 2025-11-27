#!/usr/bin/env bash
# run.sh - start backend and open default browser (Kali)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Start backend in background
echo "Starting backend..."
python3 backend.py &

# give backend a moment
sleep 1

# open default browser to local UI
echo "Opening UI - http://127.0.0.1:5000"
xdg-open "http://127.0.0.1:5000" >/dev/null 2>&1 || echo "Open http://127.0.0.1:5000 in your browser."
