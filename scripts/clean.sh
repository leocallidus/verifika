#!/usr/bin/env bash
# Clean generated dependencies, build outputs and caches.
#
# Usage:
#   ./scripts/clean.sh          # dry run
#   ./scripts/clean.sh --yes    # remove generated files
#   ./scripts/clean.sh --yes --venv  # also remove backend virtualenvs

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0
CLEAN_VENV=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes|--apply)
      APPLY=1
      ;;
    --venv)
      CLEAN_VENV=1
      ;;
    -h|--help)
      cat <<'EOF'
Clean generated dependencies, build outputs and caches.

Usage:
  ./scripts/clean.sh               # dry run
  ./scripts/clean.sh --yes         # remove generated files
  ./scripts/clean.sh --yes --venv  # also remove backend virtualenvs
EOF
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

paths=(
  "frontend/node_modules"
  "frontend/dist"
  "frontend/.vite"
  "frontend/.turbo"
  "frontend/.parcel-cache"
  "frontend/playwright-report"
  "frontend/test-results"
  "frontend/coverage"
  "frontend/.nyc_output"
  "frontend/src-tauri/target"
  "node_modules"
  "dist"
  "build"
  ".pytest_cache"
  "backend/.pytest_cache"
  "htmlcov"
  "playwright-report"
  "test-results"
  ".ruff_cache"
  ".mypy_cache"
  ".uv-cache"
  "logs"
)

if [[ "$CLEAN_VENV" -eq 1 ]]; then
  paths+=(
    "backend/.venv"
    ".venv"
    "venv"
    ".venv.bak"
  )
fi

print_header() {
  if [[ "$APPLY" -eq 1 ]]; then
    printf 'Cleaning generated files in %s\n' "$ROOT_DIR"
  else
    printf 'Dry run. Re-run with --yes to remove these paths.\n'
  fi
}

remove_path() {
  local rel="$1"
  local abs="$ROOT_DIR/$rel"
  if [[ ! -e "$abs" && ! -L "$abs" ]]; then
    return
  fi
  printf '  %s\n' "$rel"
  if [[ "$APPLY" -eq 1 ]]; then
    rm -rf -- "$abs"
  fi
}

print_header

for rel in "${paths[@]}"; do
  remove_path "$rel"
done

while IFS= read -r -d '' file; do
  rel="${file#$ROOT_DIR/}"
  printf '  %s\n' "$rel"
  if [[ "$APPLY" -eq 1 ]]; then
    rm -f -- "$file"
  fi
done < <(find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/node_modules" -prune -o \
  -path "$ROOT_DIR/frontend/node_modules" -prune -o \
  -path "$ROOT_DIR/frontend/src-tauri/target" -prune -o \
  -path "$ROOT_DIR/backend/uploads" -prune -o \
  -type f \( \
    -name '*.tsbuildinfo' -o \
    -name '*.pyc' -o \
    -name '*.pyo' -o \
    -name '.coverage' -o \
    -name '*.log' \
  \) -print0)

while IFS= read -r -d '' dir; do
  rel="${dir#$ROOT_DIR/}"
  printf '  %s\n' "$rel"
  if [[ "$APPLY" -eq 1 ]]; then
    rm -rf -- "$dir"
  fi
done < <(find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/node_modules" -prune -o \
  -path "$ROOT_DIR/frontend/node_modules" -prune -o \
  -path "$ROOT_DIR/frontend/src-tauri/target" -prune -o \
  -path "$ROOT_DIR/backend/uploads" -prune -o \
  -type d \( \
    -name '__pycache__' -o \
    -name '.pytest_cache' \
  \) -print0)

if [[ "$APPLY" -eq 1 ]]; then
  printf 'Done.\n'
else
  printf 'No files were removed.\n'
fi
