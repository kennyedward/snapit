// Injected into the active tab when the user starts a capture. Draws a dimmed
// overlay and lets the user drag a rectangle to pick the region to snap.
// Styles are set via the CSSOM (element.style) so they aren't affected by the
// page's Content-Security-Policy.
(() => {
  // Guard against double-injection if the icon is clicked twice.
  if (window.__snapitSelecting) return;
  window.__snapitSelecting = true;

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;" +
    "background:rgba(0,0,0,0.30);";

  // The selection rectangle. Its huge box-shadow dims everything *outside* it,
  // creating a spotlight on the chosen area once dragging starts.
  const sel = document.createElement("div");
  sel.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;display:none;" +
    "border:2px solid #ff3b30;background:transparent;" +
    "box-shadow:0 0 0 100000px rgba(0,0,0,0.30);pointer-events:none;";

  const hint = document.createElement("div");
  hint.textContent = "Drag to select an area  ·  Esc to cancel";
  hint.style.cssText =
    "position:fixed;top:16px;left:50%;transform:translateX(-50%);" +
    "z-index:2147483647;padding:8px 16px;border-radius:999px;pointer-events:none;" +
    "background:rgba(20,20,24,0.92);color:#fff;font:13px/1 -apple-system," +
    "BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "box-shadow:0 4px 20px rgba(0,0,0,0.4);";

  overlay.appendChild(sel);
  overlay.appendChild(hint);
  document.documentElement.appendChild(overlay);

  let startX = 0, startY = 0, dragging = false;

  const rectFrom = (e) => {
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    return { x, y, width: Math.abs(e.clientX - startX), height: Math.abs(e.clientY - startY) };
  };

  function paint(r) {
    sel.style.left = `${r.x}px`;
    sel.style.top = `${r.y}px`;
    sel.style.width = `${r.width}px`;
    sel.style.height = `${r.height}px`;
  }

  function cleanup() {
    overlay.remove();
    window.__snapitSelecting = false;
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
      chrome.runtime.sendMessage({ type: "snapit-cancel" });
    }
  }

  overlay.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    hint.style.display = "none";
    overlay.style.background = "transparent"; // dimming now comes from `sel`
    sel.style.display = "block";
    paint(rectFrom(e));
  });

  overlay.addEventListener("mousemove", (e) => {
    if (dragging) paint(rectFrom(e));
  });

  overlay.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    const r = rectFrom(e);
    cleanup();
    if (r.width < 5 || r.height < 5) {
      chrome.runtime.sendMessage({ type: "snapit-cancel" });
      return;
    }
    chrome.runtime.sendMessage({ type: "snapit-region", rect: r, dpr: window.devicePixelRatio || 1 });
  });

  // Keep the frozen screenshot aligned with the page by blocking scroll.
  overlay.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("keydown", onKey, true);
})();
