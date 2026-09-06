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

```bash
cd macos/SnapIt && ./setup.sh
open SnapIt.xcodeproj
```

Then run with `Cmd+R`. Grant Screen Recording permission on first launch.
