#!/bin/bash
# Build SnapIt in Release and install it to /Applications.
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="SnapIt"
BUNDLE_ID="com.kennyedward.snapit"
BUILD_DIR="$PWD/build"
DEST="/Applications/$APP_NAME.app"

if [ ! -d "$APP_NAME.xcodeproj" ]; then
    ./setup.sh
fi

echo "Building $APP_NAME (Release)…"
xcodebuild \
    -project "$APP_NAME.xcodeproj" \
    -scheme "$APP_NAME" \
    -configuration Release \
    -derivedDataPath "$BUILD_DIR" \
    -quiet \
    build

BUILT_APP="$BUILD_DIR/Build/Products/Release/$APP_NAME.app"

echo "Installing to $DEST…"
pkill -x "$APP_NAME" 2>/dev/null || true
rm -rf "$DEST"
cp -R "$BUILT_APP" "$DEST"

# The app is ad-hoc signed, so each build has a new signature and any
# previous Screen Recording grant no longer applies. Clear it so macOS
# prompts again on first capture.
tccutil reset ScreenCapture "$BUNDLE_ID" >/dev/null 2>&1 || true

echo "Done. Launching $APP_NAME…"
open "$DEST"
echo ""
echo "On first capture, grant Screen Recording permission when prompted, then relaunch SnapIt."
