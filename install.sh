#!/bin/sh
# Install the Artifact Library CLI (`artifact`) on Linux or macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/plugincompany/artifact-library/main/install.sh | sh
#
# Environment:
#   ARTIFACT_VERSION      release to install, e.g. 0.4.0 (default: latest)
#   ARTIFACT_INSTALL_DIR  target directory (default: ~/.local/bin)
#   ARTIFACT_BASE_URL     where the release files live (default: the GitHub release);
#                         a file:// URL or a local mirror works too
# The download is verified against the release's SHA256SUMS before it is installed.
set -eu

REPO="plugincompany/artifact-library"
VERSION="${ARTIFACT_VERSION:-latest}"
DEST="${ARTIFACT_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() { printf 'artifact install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    say "On Windows, run this in PowerShell instead:"
    say "  irm https://raw.githubusercontent.com/$REPO/main/install.ps1 | iex"
    exit 1 ;;
  *) fail "unsupported operating system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) fail "unsupported CPU architecture: $(uname -m)" ;;
esac
# Alpine and other musl-based systems need the musl build.
libc=""
if [ "$os" = linux ]; then
  if [ -f /etc/alpine-release ] || (command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl); then libc="-musl"; fi
fi
asset="artifact-$os-$arch$libc"

if [ -n "${ARTIFACT_BASE_URL:-}" ]; then
  base="${ARTIFACT_BASE_URL%/}"
elif [ "$VERSION" = latest ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/v${VERSION#v}"
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  fail "curl or wget is required"
fi
if command -v sha256sum >/dev/null 2>&1; then
  digest() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  digest() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  fail "sha256sum or shasum is required to verify the download"
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t artifact)"
trap 'rm -rf "$tmp"' EXIT INT TERM

say "Downloading $asset ($VERSION)…"
fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" || fail "could not download SHA256SUMS from $base"
fetch "$base/$asset" "$tmp/$asset" || fail "could not download $asset from $base"

expected="$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1; exit }' "$tmp/SHA256SUMS")"
[ -n "$expected" ] || fail "$asset is not listed in SHA256SUMS"
actual="$(digest "$tmp/$asset")"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset (expected $expected, got $actual)"

mkdir -p "$DEST"
chmod 755 "$tmp/$asset"
mv "$tmp/$asset" "$DEST/artifact"
say "Installed artifact $("$DEST/artifact" --version 2>/dev/null || true) to $DEST/artifact (checksum verified)."

case ":$PATH:" in
  *":$DEST:"*) ;;
  *) say ""; say "Add $DEST to your PATH, for example:"; say "  echo 'export PATH=\"$DEST:\$PATH\"' >> ~/.profile" ;;
esac
say ""
say "Next steps:"
say "  artifact config set server http://localhost:3000   # your Artifact Library server"
say "  artifact doctor"
say "  artifact skill install --agent claude              # or opencode, codex"
