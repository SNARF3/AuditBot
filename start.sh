#!/bin/bash
# AuditBot v2 — Script de inicio local (sin Docker)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== AuditBot v2 ==="

# Backend
echo "[1/2] Iniciando backend (puerto 8000)..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "  Creando entorno virtual..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt --quiet
fi
mkdir -p data/documents
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Frontend
echo "[2/2] Iniciando frontend (puerto 3000)..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias..."
  npm install --legacy-peer-deps --silent
fi
npm run dev -- --port 3000 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

sleep 3
echo ""
echo "✓ AuditBot v2 listo:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Presiona Ctrl+C para detener todo."

cleanup() {
  echo "Deteniendo..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM
wait
