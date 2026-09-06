#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v xcodegen &> /dev/null; then
    echo "Installing XcodeGen via Homebrew…"
    brew install xcodegen
fi

echo "Generating Xcode project…"
xcodegen generate

echo ""
echo "Done! Open SnapIt.xcodeproj in Xcode:"
echo "  open SnapIt.xcodeproj"
