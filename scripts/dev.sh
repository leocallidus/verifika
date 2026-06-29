#!/usr/bin/env bash
# scripts/dev.sh — dev-окружение для Верифика.
#
# Использование:
#   ./scripts/dev.sh           поднять backend (uvicorn :8000) + frontend (vite :5173)
#                              с предварительной очисткой портов 8000/5173.
#   ./scripts/dev.sh tauri     поднять backend + Tauri-приложение (`bun x tauri dev`).
#                              Vite крутится внутри Tauri-процесса.
#   ./scripts/dev.sh tauri-only запустить только Tauri-приложение (без backend).
#
# Журналы серверов:
#   /tmp/verifika-backend.log      (uvicorn)
#   /tmp/verifika-frontend.log     (vite, только в режиме по умолчанию)
#   /tmp/verifika-tauri.log        (tauri dev)
#
# Выход: Ctrl+C / SIGTERM завершает все дочерние процессы и подчищает порты.

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_LOG="/tmp/verifika-backend.log"
FRONTEND_LOG="/tmp/verifika-frontend.log"
TAURI_LOG="/tmp/verifika-tauri.log"

PORTS=(5173 8000)

BACKEND_PID=""
FRONTEND_PID=""
TAURI_PID=""

# --- helpers ---------------------------------------------------------------

color() {
  # $1 = имя цвета, $2 = текст
  local code
  case "$1" in
    red) code=31 ;;
    green) code=32 ;;
    yellow) code=33 ;;
    cyan) code=36 ;;
    dim) code=90 ;;
    *) code=0 ;;
  esac
  printf '\033[%dm%s\033[0m\n' "$code" "$2"
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    color red "❌ $1 не найден в PATH"
    color dim "  Подсказка: установите $1 и перезапустите скрипт."
    exit 127
  }
}

kill_port() {
  # $1 = порт
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k -n tcp "$port" >/dev/null 2>&1 || true
  fi
  # fallback: если порт всё ещё занят — найти по /proc/net/tcp
  if ss -ltn 2>/dev/null | grep -qE ":${port}[[:space:]]"; then
    color yellow "⚠ fuser не освободил :$port, пробую pkill"
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "uvicorn app.main" 2>/dev/null || true
    sleep 1
  fi
}

free_ports() {
  color cyan "▸ Освобождаю порты: ${PORTS[*]}"
  for p in "${PORTS[@]}"; do
    kill_port "$p"
  done
  sleep 1
  if ss -ltn 2>/dev/null | grep -qE ":(5173|8000)[[:space:]]"; then
    color red "✗ Порты 5173/8000 всё ещё заняты — прерываю."
    exit 1
  fi
  color green "✓ Порты свободны"
}

cleanup() {
  local signal="${1:-EXIT}"
  color yellow "▸ Завершение ($signal) — убиваю детей и освобождаю порты."
  if [[ -n "$TAURI_PID" ]]; then
    kill -TERM $TAURI_PID 2>/dev/null || true
    pkill -P $TAURI_PID 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]]; then
    kill -TERM $BACKEND_PID 2>/dev/null || true
    pkill -P $BACKEND_PID 2>/dev/null || true
  fi
  if [[ -n "$FRONTEND_PID" ]]; then
    kill -TERM $FRONTEND_PID 2>/dev/null || true
    pkill -P $FRONTEND_PID 2>/dev/null || true
  fi
  sleep 1
  pkill -9 -f "uvicorn app.main" 2>/dev/null || true
  pkill -9 -f "vite" 2>/dev/null || true
  pkill -9 -f "tauri dev" 2>/dev/null || true
  pkill -9 -f "bun.*tauri" 2>/dev/null || true
  for p in "${PORTS[@]}"; do
    if command -v fuser >/dev/null 2>&1; then
      fuser -k -n tcp "$p" >/dev/null 2>&1 || true
    fi
  done
  if [[ "$signal" != "EXIT" ]]; then
    exit 130
  fi
}

check_python_venv() {
  if [[ ! -x "$BACKEND_DIR/.venv/bin/uvicorn" ]]; then
    color red "❌ $BACKEND_DIR/.venv/bin/uvicorn не найден."
    color dim "  Подсказка: создайте venv и установите зависимости."
    exit 1
  fi
}

# --- режимы ----------------------------------------------------------------

mode="${1:-full}"

case "$mode" in
  full|backend+frontend|"")
    MODE="full"
    ;;
  tauri|tauri:dev)
    MODE="tauri"
    ;;
  tauri-only|tauri_only|frontend-only)
    MODE="tauri-only"
    ;;
  -h|--help|help)
    cat <<EOF
Использование:
  $0              # backend + frontend/vite (с очисткой портов)
  $0 tauri        # backend + tauri-приложение (vite крутится внутри tauri)
  $0 tauri-only   # только tauri-приложение (без backend)
EOF
    exit 0
    ;;
  *)
    color red "Неизвестный режим: $mode"
    echo "Доступные: (пусто), tauri, tauri-only"
    exit 2
    ;;
esac

require_tool ss
require_tool kill

trap 'cleanup INT'  INT
trap 'cleanup TERM' TERM
trap 'cleanup EXIT' EXIT

free_ports

# --- full mode: backend + vite --------------------------------------------

if [[ "$MODE" == "full" ]]; then
  check_python_venv

  color cyan "▸ Запуск backend (uvicorn :8000)"
  color dim "  лог: $BACKEND_LOG"
  : > "$BACKEND_LOG"
  (
    cd "$BACKEND_DIR"
    exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
  ) >>"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!

  color cyan "▸ Запуск frontend (vite :5173)"
  color dim "  лог: $FRONTEND_LOG"
  : > "$FRONTEND_LOG"
  (
    cd "$FRONTEND_DIR"
    exec bun run dev
  ) >>"$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!

  # ждём готовности (≤ ~12с) и печатаем итог
  for _ in $(seq 1 24); do
    sleep 0.5
    if ss -ltn 2>/dev/null | grep -qE ":8000[[:space:]]" \
       && ss -ltn 2>/dev/null | grep -qE ":5173[[:space:]]"; then
      break
    fi
  done

  if ss -ltn 2>/dev/null | grep -qE ":8000[[:space:]]"; then
    color green "✓ backend слушает :8000   (pid=$BACKEND_PID)"
  else
    color red "✗ backend не стартовал — смотрите $BACKEND_LOG"
  fi
  if ss -ltn 2>/dev/null | grep -qE ":5173[[:space:]]"; then
    color green "✓ frontend слушает :5173  (pid=$FRONTEND_PID)"
  else
    color red "✗ frontend не стартовал — смотрите $FRONTEND_LOG"
  fi

  color dim "▸ Tail логов: tail -F $BACKEND_LOG $FRONTEND_LOG"
  color dim "▸ Ctrl+C — остановить оба и освободить порты."

  # блокируем до получения сигнала
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
fi

# --- tauri mode (с backend) -----------------------------------------------

if [[ "$MODE" == "tauri" ]]; then
  check_python_venv

  color cyan "▸ Запуск backend (uvicorn :8000) [для tauri]"
  color dim "  лог: $BACKEND_LOG"
  : > "$BACKEND_LOG"
  (
    cd "$BACKEND_DIR"
    exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
  ) >>"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!

  color cyan "▸ Запуск Tauri-приложения (bun x tauri dev)"
  color dim "  лог: $TAURI_LOG; vite поднимется самим tauri на :5173"
  : > "$TAURI_LOG"
  (
    cd "$FRONTEND_DIR"
    exec bun x tauri dev
  ) >>"$TAURI_LOG" 2>&1 &
  TAURI_PID=$!

  # ждём готовности (≤ ~12с)
  for _ in $(seq 1 24); do
    sleep 0.5
    if ss -ltn 2>/dev/null | grep -qE ":8000[[:space:]]" \
       && ss -ltn 2>/dev/null | grep -qE ":5173[[:space:]]"; then
      break
    fi
  done

  if ss -ltn 2>/dev/null | grep -qE ":8000[[:space:]]"; then
    color green "✓ backend слушает :8000  (pid=$BACKEND_PID)"
  else
    color red "✗ backend не стартовал — смотрите $BACKEND_LOG"
  fi
  if ss -ltn 2>/dev/null | grep -qE ":5173[[:space:]]"; then
    color green "✓ vite (внутри tauri) :5173"
  else
    color yellow "… vite ещё просыпается (см. $TAURI_LOG)"
  fi

  color dim "▸ Ctrl+C — остановить backend + tauri и освободить порты."
  wait $BACKEND_PID $TAURI_PID 2>/dev/null
  exit 0
fi

# --- tauri-only mode -------------------------------------------------------

if [[ "$MODE" == "tauri-only" ]]; then
  color cyan "▸ Запуск Tauri-приложения без backend (bun x tauri dev)"
  color dim "  лог: $TAURI_LOG; vite крутится внутри tauri на :5173"
  color yellow "⚠ Backend не запущен — приложение упадёт на запросах /api/*."
  : > "$TAURI_LOG"
  (
    cd "$FRONTEND_DIR"
    exec bun x tauri dev
  ) >>"$TAURI_LOG" 2>&1 &
  TAURI_PID=$!
  color dim "▸ pid=$TAURI_PID  Ctrl+C — остановить."
  wait $TAURI_PID 2>/dev/null
  exit 0
fi
