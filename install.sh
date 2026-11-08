#!/bin/bash
# Flowly installer: builds the Mac app from this folder and puts it in /Applications.
# Safe to run again; it updates the app and keeps your data.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="/Applications/Flowly.app"
step(){ printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
fail(){ printf '\n\033[1;31mError: %s\033[0m\n' "$1"; exit 1; }
# Downloads go in a private folder only this user can write to, removed when the script ends.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ "$(uname)" = "Darwin" ] || fail "This installer is for macOS. On other systems, run npm install and npm run build, then open dist/index.html in your browser."
case "$(uname -m)" in arm64) ARCH=arm64 ;; x86_64) ARCH=x64 ;; *) fail "Unsupported Mac processor: $(uname -m)" ;; esac

# 1. Node.js 22 or newer, only needed to build the app
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] && NODE_OK=1
fi
if [ $NODE_OK -eq 0 ]; then
  step "Installing Node.js (you'll be asked for your Mac password)"
  DIST=https://nodejs.org/dist/latest-v22.x
  curl -fsSL "$DIST/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt" || fail "Couldn't reach nodejs.org. Check your connection and run this again."
  PKG=$(grep -o 'node-v22[0-9.]*\.pkg$' "$TMP/SHASUMS256.txt" | head -1)
  [ -n "$PKG" ] || fail "Couldn't find the Node.js installer. Install it from https://nodejs.org and run this again."
  curl -fL "$DIST/$PKG" -o "$TMP/$PKG"
  # Install only what nodejs.org says it published
  WANT=$(awk -v f="$PKG" '$2==f{print $1}' "$TMP/SHASUMS256.txt")
  GOT=$(shasum -a 256 "$TMP/$PKG" | awk '{print $1}')
  [ -n "$WANT" ] && [ "$WANT" = "$GOT" ] || fail "The Node.js download didn't match its checksum. Run this again, or install Node.js from https://nodejs.org."
  sudo installer -pkg "$TMP/$PKG" -target /
  export PATH="/usr/local/bin:$PATH"
  command -v node >/dev/null 2>&1 || fail "Node.js didn't install. Install it from https://nodejs.org and run this again."
fi
echo "Node $(node -v)"

# 2. Build in this folder
cd "$SRC"
step "Installing build tools (first run takes a few minutes)"
# npm ci installs exactly the versions in package-lock.json
npm ci --no-audit --no-fund --loglevel=error
step "Building Flowly for $ARCH"
rm -rf release
npm run build >"$SRC/build.log" 2>&1 || { tail -20 "$SRC/build.log"; fail "Build failed. Full log: $SRC/build.log"; }
LOG="$SRC/build.log"
# electron-builder's own download failed with a 504 from GitHub release files even with Electron cached; this one reuses the cache and verifies it against checksums shipped in the npm package
node node_modules/electron/install.js || fail "Couldn't get Electron. Check your connection and run this again."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --"$ARCH" --dir -c.electronDist=node_modules/electron/dist >"$LOG" 2>&1 || { tail -20 "$LOG"; fail "Build failed. Full log: $LOG"; }
BUILT=$(find release -maxdepth 2 -name 'Flowly.app' -type d | head -1)
[ -n "$BUILT" ] || fail "Build finished but Flowly.app wasn't found in release."

# 3. Install. The app isn't signed by a registered developer, so it's signed locally to open without warnings.
step "Installing to /Applications"
osascript -e 'tell application "Flowly" to quit' >/dev/null 2>&1 || true
# the app under its old name holds the data the first launch copies, so it shouldn't be writing to it
osascript -e 'tell application "Budgeter" to quit' >/dev/null 2>&1 || true
sleep 1
rm -rf "$APP" 2>/dev/null || sudo rm -rf "$APP"
cp -R "$BUILT" "$APP" 2>/dev/null || sudo cp -R "$BUILT" "$APP"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

step "Done. Opening Flowly."
open "$APP"
echo "To update later: get the latest version of this folder (git pull) and run: bash install.sh"
