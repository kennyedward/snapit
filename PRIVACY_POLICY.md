# Privacy Policy — SnapIt

**Last updated:** July 1, 2026

## Overview

SnapIt is a browser extension that captures screenshots of the visible browser tab and provides annotation tools. Your privacy is important to us.

## Data Collection

SnapIt does **not** collect, store, transmit, or share any personal data or browsing information.

## What SnapIt accesses

- **Active tab screenshot:** SnapIt captures a screenshot of the currently visible tab only when you explicitly trigger it (toolbar click or keyboard shortcut). The screenshot is stored temporarily in local browser storage, loaded into the editor, and then immediately deleted from storage.

## Data storage

- Screenshots are held in `chrome.storage.local` only for the brief moment between capture and editor load. They are deleted as soon as the editor opens.
- Annotation data (shapes, text) exists only in the editor's in-memory state and is never persisted or transmitted.

## Data sharing

SnapIt does **not** send any data to external servers, third-party services, or analytics platforms. All processing happens entirely within your browser.

## Permissions used

| Permission | Why it's needed |
|---|---|
| `activeTab` | To capture a screenshot of the currently visible tab when you click the toolbar button or use the keyboard shortcut |
| `storage` | To temporarily pass the screenshot from the background worker to the editor tab |

## Changes to this policy

If this policy is updated, the changes will be reflected in this document with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/kennyedward/snapit).
