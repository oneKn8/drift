#!/usr/bin/env bash

RED='\033[0;31m'
GREEN='\033[0;32m'
RESET='\033[0m'

PIDFILE=".drift.pids"

log() { echo -e "${GREEN}[drift]${RESET} $1"; }

if [ -f "$PIDFILE" ]; then
  read -r BACKEND_PID CELERY_PID FRONTEND_PID < "$PIDFILE"

  for pid in $BACKEND_PID $CELERY_PID $FRONTEND_PID; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
    fi
  done

  rm -f "$PIDFILE"
  log "All services stopped"
else
  # Fallback: kill by port
  for port in 8001 5182; do
    pid=$(lsof -ti ":$port" 2>/dev/null)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null
      log "Killed process on port $port"
    fi
  done
  log "Cleanup complete"
fi
