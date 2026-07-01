// Background service worker: capture the visible tab, stash the image,
// and open the annotation editor in a new tab.

async function captureAndOpenEditor() {
  try {
    // Capture the currently visible area of the active tab as a PNG data URL.
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });

    // Data URLs can be large, so we hand it off via storage rather than the URL.
    const id = `shot_${Date.now()}`;
    await chrome.storage.local.set({ [id]: dataUrl });

    // Open the editor, passing the storage key so it knows which shot to load.
    await chrome.tabs.create({
      url: chrome.runtime.getURL(`editor.html?id=${id}`)
    });
  } catch (err) {
    console.error("SnapIt capture failed:", err);
    // Surface the error in a minimal way the user can see.
    chrome.tabs.create({
      url: chrome.runtime.getURL(
        `editor.html?error=${encodeURIComponent(err.message || String(err))}`
      )
    });
  }
}

// Toolbar button click.
chrome.action.onClicked.addListener(captureAndOpenEditor);

// Keyboard shortcut.
chrome.commands.onCommand.addListener((command) => {
  if (command === "capture") captureAndOpenEditor();
});
