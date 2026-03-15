#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'

PIDFILE=".drift.pids"

log() { echo -e "${GREEN}[drift]${RESET} $1"; }
err() { echo -e "${RED}[drift]${RESET} $1" >&2; }
dim() { echo -e "${DIM}$1${RESET}"; }

# --- Prerequisites ---

check() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is required but not found. $2"
    exit 1
  fi
}

check python3 "Install Python 3.10+"
check node "Install Node.js 18+"
check docker "Install Docker for Redis"

PYTHON_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
log "Python $PYTHON_VER"

NODE_VER=$(node -v)
log "Node $NODE_VER"

# --- Redis ---

if docker ps --format '{{.Names}}' | grep -q redis; then
  log "Redis already running"
else
  log "Starting Redis..."
  docker compose up -d
  sleep 1
fi

# Check Redis connectivity
if ! docker compose exec -T redis redis-cli ping &>/dev/null; then
  err "Redis not responding. Check docker compose logs."
  exit 1
fi
log "Redis connected"

# --- Backend ---

if [ ! -d "backend/.venv" ]; then
  log "Creating Python virtual environment..."
  python3 -m venv backend/.venv
fi

if [ ! -f "backend/.venv/lib/python${PYTHON_VER}/site-packages/fastapi/__init__.py" ]; then
  log "Installing backend dependencies (this may take a few minutes)..."
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

log "Starting backend on :8001"
cd backend
PYTHONPATH="" .venv/bin/uvicorn app.main:app --port 8001 --reload &>/dev/null &
BACKEND_PID=$!
cd ..

log "Starting Celery worker"
cd backend
PYTHONPATH="" .venv/bin/celery -A app.tasks.celery_app worker --loglevel=warning --concurrency=1 -P solo &>/dev/null &
CELERY_PID=$!
cd ..

# --- Frontend ---

if [ ! -d "frontend/node_modules" ]; then
  log "Installing frontend dependencies..."
  cd frontend && npm install --silent && cd ..
fi

log "Starting frontend on :5182"
cd frontend
API_PORT=8001 npx vite --port 5182 &>/dev/null &
FRONTEND_PID=$!
cd ..

# --- Save PIDs ---

echo "$BACKEND_PID $CELERY_PID $FRONTEND_PID" > "$PIDFILE"

echo ""
log "All services running"
dim "  Backend   http://localhost:8001"
dim "  Frontend  http://localhost:5182"
dim "  Redis     localhost:6379"
echo ""
log "Open http://localhost:5182"
log "Run ./stop.sh to shut down"
