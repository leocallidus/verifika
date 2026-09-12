#!/usr/bin/env bash
set -euo pipefail

BINARY_PATH="${1:-frontend/src-tauri/target/release/verifika}"
ARCH="${2:-x86_64}"
VERSION="${3:-1.0.0}"
OUTPUT_DIR="${4:-dist-packages}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Building Flatpak package (.flatpak) for ${ARCH}..."

if [ ! -f "${BINARY_PATH}" ]; then
  echo "Error: Binary not found at ${BINARY_PATH}" >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGING_DIR}"' EXIT

mkdir -p "${STAGING_DIR}/icons"
cp "${BINARY_PATH}" "${STAGING_DIR}/verifika"
cp "${SCRIPT_DIR}/ru.univ.verifika.desktop" "${STAGING_DIR}/"
cp "${SCRIPT_DIR}/ru.univ.verifika.metainfo.xml" "${STAGING_DIR}/"
cp "${SCRIPT_DIR}/ru.univ.verifika.yml" "${STAGING_DIR}/"
cp -r "${REPO_ROOT}/frontend/src-tauri/icons"/* "${STAGING_DIR}/icons/"

cd "${STAGING_DIR}"

flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub org.gnome.Platform//46 org.gnome.Sdk//46

flatpak-builder --user --repo=repo --force-clean build-dir ru.univ.verifika.yml

mkdir -p "${REPO_ROOT}/${OUTPUT_DIR}"
OUTPUT_FILE="${REPO_ROOT}/${OUTPUT_DIR}/verifika-${VERSION}-${ARCH}.flatpak"

flatpak build-bundle repo "${OUTPUT_FILE}" ru.univ.verifika

echo "==> Flatpak bundle created at ${OUTPUT_FILE}"
