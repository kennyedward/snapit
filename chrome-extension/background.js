// Background service worker: capture the visible tab, let the user drag a
// region on the page, then open the annotation editor cropped to that region.

// Which captured shot is waiting for a region selection. Kept in session
// storage (not an in-memory variable) so it survives the service worker being
// suspended while the user is still dragging out their selection.
const PENDING_KEY = "snapit_pending_shot";

function openEditor(query) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?${query}`) });
}

function openError(err) {
  return openEditor(`error=${encodeURIComponent(err.message || String(err))}`);
}

async function beginCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // Capture first, while the page is clean — no overlay in the screenshot.
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  } catch (err) {
    console.error("SnapIt capture failed:", err);
    return openError(err);
  }

  const id = `shot_${Date.now()}`;
  await chrome.storage.local.set({ [id]: dataUrl });

  // Ask the page for a region. If we can't inject (e.g. chrome:// pages,
  // the Web Store, or the scripting permission isn't active yet) fall back to
  // opening the full screenshot.
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["selection.js"] });
    await chrome.storage.session.set({ [PENDING_KEY]: id });
  } catch (err) {
    // Restricted pages (chrome://, the Web Store, PDFs…) can't be scripted, so
    // region select isn't possible — fall back to the full-tab capture and let
    // the editor explain why.
    console.warn("SnapIt region overlay unavailable, using full capture:", err);
    openEditor(`id=${id}&full=1`);
  }
}

// Messages from the selection overlay. The listener stays sync; the async work
// runs separately since we never send a response back.
chrome.runtime.onMessage.addListener((msg) => {
  handleSelectionMessage(msg);
});

async function handleSelectionMessage(msg) {
  const stored = await chrome.storage.session.get(PENDING_KEY);
  const id = stored[PENDING_KEY];
  if (!id) return; // nothing waiting (stray message)

  if (msg.type === "snapit-region") {
    await chrome.storage.session.remove(PENDING_KEY);
    const { rect, dpr } = msg;
    openEditor(
      `id=${id}&x=${rect.x}&y=${rect.y}&w=${rect.width}&h=${rect.height}&dpr=${dpr}`
    );
  } else if (msg.type === "snapit-cancel") {
    await chrome.storage.session.remove(PENDING_KEY);
    chrome.storage.local.remove(id); // discard the unused shot
  }
}

// Toolbar button click.
chrome.action.onClicked.addListener(beginCapture);

// Keyboard shortcut.
chrome.commands.onCommand.addListener((command) => {
  if (command === "capture") beginCapture();
});
