# SnapIt

Screenshot and annotation tools. Two independent apps live in this repo.

| Folder | What it is |
| --- | --- |
| `chrome-extension/` | Chrome extension (Manifest V3). Captures the visible tab or a region and opens an annotator. |
| `macos/SnapIt/` | Native macOS app (SwiftUI, macOS 14+). |

## Chrome extension

No build step.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `chrome-extension/` folder.
3. Trigger with the toolbar icon or `Alt+Shift+S`.

## macOS app

Requires Xcode 16+, macOS 14+, and Homebrew.

Install to `/Applications`:

```bash
cd macos/SnapIt && ./install.sh
```

This builds a Release copy, replaces any existing `/Applications/SnapIt.app`, and launches it. Grant Screen Recording permission on first capture, then relaunch.

For development in Xcode instead:

```bash
cd macos/SnapIt && ./setup.sh
open SnapIt.xcodeproj
```

Then run with `Cmd+R`. Xcode builds live in DerivedData, not `/Applications`, and each rebuild needs Screen Recording permission granted again.
