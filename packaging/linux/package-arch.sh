#!/usr/bin/env bash
set -euo pipefail

BINARY_PATH="${1:-frontend/src-tauri/target/release/verifika}"
ARCH="${2:-x86_64}"
VERSION="${3:-1.0.0}"
OUTPUT_DIR="${4:-dist-packages}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> Building Arch Linux package (.pkg.tar.zst) for ${ARCH}..."

if [ ! -f "${BINARY_PATH}" ]; then
  echo "Error: Binary not found at ${BINARY_PATH}" >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGING_DIR}"' EXIT

mkdir -p "${STAGING_DIR}/usr/bin"
mkdir -p "${STAGING_DIR}/usr/share/applications"
mkdir -p "${STAGING_DIR}/usr/share/metainfo"
mkdir -p "${STAGING_DIR}/usr/share/icons/hicolor/32x32/apps"
mkdir -p "${STAGING_DIR}/usr/share/icons/hicolor/128x128/apps"
mkdir -p "${STAGING_DIR}/usr/share/icons/hicolor/256x256/apps"
mkdir -p "${STAGING_DIR}/usr/share/icons/hicolor/512x512/apps"

install -Dm755 "${BINARY_PATH}" "${STAGING_DIR}/usr/bin/verifika"
install -Dm644 "${SCRIPT_DIR}/ru.univ.verifika.desktop" "${STAGING_DIR}/usr/share/applications/ru.univ.verifika.desktop"
install -Dm644 "${SCRIPT_DIR}/ru.univ.verifika.metainfo.xml" "${STAGING_DIR}/usr/share/metainfo/ru.univ.verifika.metainfo.xml"

ICONS_DIR="${REPO_ROOT}/frontend/src-tauri/icons"
if [ -f "${ICONS_DIR}/32x32.png" ]; then
  install -Dm644 "${ICONS_DIR}/32x32.png" "${STAGING_DIR}/usr/share/icons/hicolor/32x32/apps/ru.univ.verifika.png"
  ln -sf ru.univ.verifika.png "${STAGING_DIR}/usr/share/icons/hicolor/32x32/apps/verifika.png"
fi
if [ -f "${ICONS_DIR}/128x128.png" ]; then
  install -Dm644 "${ICONS_DIR}/128x128.png" "${STAGING_DIR}/usr/share/icons/hicolor/128x128/apps/ru.univ.verifika.png"
  ln -sf ru.univ.verifika.png "${STAGING_DIR}/usr/share/icons/hicolor/128x128/apps/verifika.png"
fi
if [ -f "${ICONS_DIR}/icon.png" ]; then
  install -Dm644 "${ICONS_DIR}/icon.png" "${STAGING_DIR}/usr/share/icons/hicolor/512x512/apps/ru.univ.verifika.png"
  ln -sf ru.univ.verifika.png "${STAGING_DIR}/usr/share/icons/hicolor/512x512/apps/verifika.png"
fi

INSTALLED_SIZE=$(du -sk "${STAGING_DIR}/usr" | awk '{print $1 * 1024}')
BUILD_DATE=$(date +%s)

cat << EOF > "${STAGING_DIR}/.PKGINFO"
pkgname = verifika-bin
pkgbase = verifika-bin
pkgver = ${VERSION}-1
pkgdesc = Кроссплатформенная система тестирования студентов Верифика
url = https://github.com/leocallidus/verifika
builddate = ${BUILD_DATE}
packager = Verifika CI <support@verifika.ru>
size = ${INSTALLED_SIZE}
arch = ${ARCH}
license = MIT
depend = webkit2gtk-4.1
depend = gtk3
depend = libappindicator-gtk3
depend = openssl
provides = verifika
conflict = verifika
EOF

cd "${STAGING_DIR}"

if command -v bsdtar >/dev/null 2>&1; then
  LANG=C bsdtar -czf .MTREE --format=mtree \
    --options='!all,use-set,type,uid,gid,mode,time,size,md5,sha256' \
    .PKGINFO usr
fi

mkdir -p "${REPO_ROOT}/${OUTPUT_DIR}"
PACKAGE_NAME="verifika-${VERSION}-1-${ARCH}.pkg.tar.zst"
OUTPUT_FILE="${REPO_ROOT}/${OUTPUT_DIR}/${PACKAGE_NAME}"

# Create the zstd compressed package tar
if [ -f .MTREE ]; then
  tar --zstd -cf "${OUTPUT_FILE}" .PKGINFO .MTREE usr
else
  tar --zstd -cf "${OUTPUT_FILE}" .PKGINFO usr
fi

echo "==> Package created at ${OUTPUT_FILE}"

if command -v pacman >/dev/null 2>&1; then
  echo "==> Validating package with pacman..."
  pacman -Qip "${OUTPUT_FILE}"
fi
