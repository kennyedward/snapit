// SnapIt editor: load the captured screenshot onto a canvas and let the user
// draw rectangles, circles/ellipses, and text blocks on top of it.

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const textInput = document.getElementById("textInput");
const messageEl = document.getElementById("message");

// ---------- State ----------
let bgImage = null;          // the screenshot, drawn underneath everything
let objects = [];            // annotation objects, drawn in order
let selectedId = null;
let currentTool = "select";

let undoStack = [];
let redoStack = [];

const style = {
  color: "#ff3b30",
  strokeWidth: 4,
  fontSize: 28,
};

let nextId = 1;
const newId = () => `o${nextId++}`;

// Interaction bookkeeping
let drag = null;      // { mode, id, startX, startY, orig }
let cropDrag = null;  // { startX, startY } while dragging out a crop region
let cropRect = null;  // { x, y, w, h } pending crop region, in canvas pixels
let exporting = false; // suppress the crop overlay while flattening for export
let eraserDown = false; // erasing while the mouse is held
let erasedAny = false;   // did this erase stroke remove anything (for undo)

// ---------- Load the screenshot ----------
(async function init() {
  const params = new URLSearchParams(location.search);

  const error = params.get("error");
  if (error) {
    showMessage(`Capture failed: ${error}`, 6000);
    sizeCanvas(900, 500);
    redraw();
    seedHistory();
    return;
  }

  const id = params.get("id");
  if (!id) {
    showMessage("No screenshot id provided.", 6000);
    sizeCanvas(900, 500);
    redraw();
    seedHistory();
    return;
  }

  const stored = await chrome.storage.local.get(id);
  const dataUrl = stored[id];
  if (!dataUrl) {
    showMessage("Screenshot data not found (it may have expired).", 6000);
    sizeCanvas(900, 500);
    redraw();
    seedHistory();
    return;
  }

  // Free the storage now that we have the image in this page.
  chrome.storage.local.remove(id);

  // Optional crop region (device pixels), passed when the user selected an area.
  const crop = readCrop(params);

  const img = new Image();
  img.onload = () => {
    if (crop) {
      // Bake the selected region into an offscreen canvas used as the background.
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(crop.w));
      off.height = Math.max(1, Math.round(crop.h));
      off.getContext("2d").drawImage(
        img, crop.x, crop.y, crop.w, crop.h, 0, 0, off.width, off.height
      );
      bgImage = off;
      sizeCanvas(off.width, off.height);
    } else {
      bgImage = img;
      sizeCanvas(img.naturalWidth, img.naturalHeight);
    }
    fitToViewport();
    redraw();
    seedHistory();
    if (params.get("full")) {
      showMessage("Region select isn't available on this page — captured the whole tab.", 5000);
    }
  };
  img.src = dataUrl;
})();

// Turn the crop query params (CSS px + devicePixelRatio) into device pixels,
// clamped so a bad value can't produce a zero/negative-size canvas.
function readCrop(params) {
  if (!params.has("w") || !params.has("h")) return null;
  const dpr = parseFloat(params.get("dpr")) || 1;
  const x = (parseFloat(params.get("x")) || 0) * dpr;
  const y = (parseFloat(params.get("y")) || 0) * dpr;
  const w = (parseFloat(params.get("w")) || 0) * dpr;
  const h = (parseFloat(params.get("h")) || 0) * dpr;
  if (w < 1 || h < 1) return null;
  return { x, y, w, h };
}

function sizeCanvas(w, h) {
  canvas.width = w;
  canvas.height = h;
}

// Scale the canvas down (via CSS) so it fits the window without changing
// its internal resolution — keeps exports crisp.
function fitToViewport() {
  const maxW = stage.clientWidth - 48;
  const maxH = stage.clientHeight - 116; // top padding + room for the bottom dock
  const scale = Math.min(1, maxW / canvas.width, maxH / canvas.height);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}
window.addEventListener("resize", () => { fitToViewport(); positionTextInput(); positionCropConfirm(); });

// ---------- Coordinate mapping (screen -> canvas pixels) ----------
function toCanvasCoords(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}
function canvasScale() {
  const rect = canvas.getBoundingClientRect();
  return rect.width / canvas.width; // displayed px per canvas px
}

// ---------- Drawing ----------
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Skip a text object while its textarea is open for editing.
  for (const o of objects) if (!o._editing) drawObject(o);
  if (selectedId) {
    const sel = objects.find((o) => o.id === selectedId);
    if (sel && !sel._editing) drawSelection(sel);
  }
  if (cropRect && !exporting) drawCropOverlay(cropRect);
}

function drawObject(o) {
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = o.strokeWidth;
  ctx.lineJoin = "round";

  if (o.type === "pen") {
    ctx.lineCap = "round";
    const pts = o.points;
    if (pts.length === 1) {
      // A single tap renders as a dot.
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, o.strokeWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else if (o.type === "rect") {
    const { x, y, w, h } = normRect(o);
    ctx.strokeRect(x, y, w, h);
  } else if (o.type === "ellipse") {
    const { x, y, w, h } = normRect(o);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (o.type === "text") {
    ctx.textBaseline = "top";
    ctx.font = `${o.fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const lines = o.text.split("\n");
    lines.forEach((line, i) => {
      ctx.fillText(line, o.x, o.y + i * o.fontSize * 1.2);
    });
  }
  ctx.restore();
}

function drawSelection(o) {
  if (!o) return;
  if (o.type === "pen") return; // strokes highlight without a selection box
  const b = boundsOf(o);
  ctx.save();
  ctx.strokeStyle = "#4f8cff";
  ctx.lineWidth = Math.max(1, 1.5 / canvasScale());
  ctx.setLineDash([6 / canvasScale(), 4 / canvasScale()]);
  ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.restore();
}

// Normalize a rect/ellipse so width/height are positive.
function normRect(o) {
  return {
    x: Math.min(o.x, o.x + o.w),
    y: Math.min(o.y, o.y + o.h),
    w: Math.abs(o.w),
    h: Math.abs(o.h),
  };
}

function boundsOf(o) {
  if (o.type === "pen") {
    const xs = o.points.map((p) => p.x);
    const ys = o.points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (o.type === "text") {
    ctx.save();
    ctx.font = `${o.fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const lines = o.text.split("\n");
    const w = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    ctx.restore();
    return { x: o.x, y: o.y, w, h: lines.length * o.fontSize * 1.2 };
  }
  return normRect(o);
}

function hitTest(x, y) {
  // Topmost first.
  for (let i = objects.length - 1; i >= 0; i--) {
    const b = boundsOf(objects[i]);
    const pad = 8;
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
      return objects[i];
    }
  }
  return null;
}

// ---------- Undo / redo ----------
// A history entry captures everything an edit (including a crop) can change:
// the annotations, the background image, and the canvas size. bgImage is held
// by reference — crop always makes a *new* canvas rather than mutating in
// place — so entries stay cheap to keep around.
function historyEntry() {
  return { objects: JSON.stringify(objects), bg: bgImage, w: canvas.width, h: canvas.height };
}
function restoreEntry(e) {
  objects = JSON.parse(e.objects);
  bgImage = e.bg;
  if (canvas.width !== e.w || canvas.height !== e.h) {
    sizeCanvas(e.w, e.h);
    fitToViewport();
  }
  selectedId = null;
  redraw();
}
// The undo stack always keeps a seed entry at the bottom (the loaded state), so
// the *first* undo after a change actually reverts it.
function seedHistory() {
  undoStack = [historyEntry()];
  redoStack = [];
}
function snapshot() {
  undoStack.push(historyEntry());
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (undoStack.length < 2) return; // nothing above the seed
  redoStack.push(undoStack.pop());
  restoreEntry(undoStack[undoStack.length - 1]);
}
function redo() {
  if (!redoStack.length) return;
  const entry = redoStack.pop();
  undoStack.push(entry);
  restoreEntry(entry);
}

// ---------- Mouse interaction on canvas ----------
canvas.addEventListener("mousedown", (evt) => {
  if (textInput.style.display === "block") commitText();
  const p = toCanvasCoords(evt);

  if (currentTool === "select") {
    const hit = hitTest(p.x, p.y);
    selectedId = hit ? hit.id : null;
    if (hit) {
      drag = { mode: "move", id: hit.id, startX: p.x, startY: p.y, orig: { ...hit } };
    }
    redraw();
    return;
  }

  if (currentTool === "text") {
    startTextEditing(p.x, p.y);
    return;
  }

  if (currentTool === "crop") {
    const c = clampToCanvas(p);
    cropDrag = { startX: c.x, startY: c.y };
    cropRect = { x: c.x, y: c.y, w: 0, h: 0 };
    hideCropConfirm();
    redraw();
    return;
  }

  if (currentTool === "eraser") {
    eraserDown = true;
    erasedAny = false;
    eraseAt(p);
    return;
  }

  if (currentTool === "pen") {
    // Freehand highlight: record points as the mouse moves.
    const o = {
      id: newId(),
      type: "pen",
      points: [{ x: p.x, y: p.y }],
      color: style.color,
      strokeWidth: style.strokeWidth,
    };
    objects.push(o);
    selectedId = o.id;
    drag = { mode: "draw", id: o.id };
    return;
  }

  // rect / ellipse: begin a new shape
  const o = {
    id: newId(),
    type: currentTool,
    x: p.x, y: p.y, w: 0, h: 0,
    color: style.color,
    strokeWidth: style.strokeWidth,
  };
  objects.push(o);
  selectedId = o.id;
  drag = { mode: "create", id: o.id, startX: p.x, startY: p.y };
});

window.addEventListener("mousemove", (evt) => {
  if (eraserDown) {
    eraseAt(toCanvasCoords(evt));
    return;
  }
  if (cropDrag) {
    const c = clampToCanvas(toCanvasCoords(evt));
    cropRect.x = Math.min(cropDrag.startX, c.x);
    cropRect.y = Math.min(cropDrag.startY, c.y);
    cropRect.w = Math.abs(c.x - cropDrag.startX);
    cropRect.h = Math.abs(c.y - cropDrag.startY);
    redraw();
    return;
  }
  if (!drag) return;
  const p = toCanvasCoords(evt);
  const o = objects.find((x) => x.id === drag.id);
  if (!o) return;

  if (drag.mode === "create") {
    o.w = p.x - drag.startX;
    o.h = p.y - drag.startY;
  } else if (drag.mode === "draw") {
    o.points.push({ x: p.x, y: p.y });
  } else if (drag.mode === "move") {
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (o.type === "pen") {
      o.points = drag.orig.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    } else {
      o.x = drag.orig.x + dx;
      o.y = drag.orig.y + dy;
    }
  }
  redraw();
});

window.addEventListener("mouseup", () => {
  if (eraserDown) {
    eraserDown = false;
    if (erasedAny) snapshot();
    return;
  }
  if (cropDrag) {
    cropDrag = null;
    if (cropRect && cropRect.w >= 5 && cropRect.h >= 5) {
      showCropConfirm(); // wait for the user to choose Crop or Copy
    } else {
      cropRect = null;
      hideCropConfirm();
      redraw();
    }
    return;
  }
  if (!drag) return;
  const o = objects.find((x) => x.id === drag.id);

  if (drag.mode === "create") {
    // Discard accidental zero-size shapes.
    if (o && Math.abs(o.w) < 3 && Math.abs(o.h) < 3) {
      objects = objects.filter((x) => x.id !== o.id);
      selectedId = null;
    } else {
      snapshot();
    }
    // Auto-return to select after drawing one shape.
    setTool("select");
  } else if (drag.mode === "draw") {
    // Discard a stray click with no real stroke; otherwise keep the highlight.
    if (o && o.points.length < 2) {
      objects = objects.filter((x) => x.id !== o.id);
      selectedId = null;
    } else {
      snapshot();
    }
    // Stay in the pen tool so several areas can be highlighted in a row.
  } else if (drag.mode === "move") {
    snapshot();
  }
  drag = null;
  redraw();
});

// ---------- Text editing ----------
let editingId = null;

function startTextEditing(x, y, existing = null) {
  editingId = existing ? existing.id : null;
  const obj = existing || {
    id: newId(),
    type: "text",
    x, y,
    text: "",
    color: style.color,
    fontSize: style.fontSize,
  };

  textInput.value = obj.text || "";
  textInput.dataset.x = obj.x;
  textInput.dataset.y = obj.y;
  textInput.dataset.color = obj.color;
  textInput.dataset.fontSize = obj.fontSize;
  textInput.style.display = "block";
  textInput.style.color = obj.color;
  positionTextInput();
  // If editing existing, hide its drawn version while typing.
  if (existing) existing._editing = true;
  redraw();
  setTimeout(() => { textInput.focus(); autoSizeTextInput(); }, 0);
}

function positionTextInput() {
  if (textInput.style.display !== "block") return;
  const scale = canvasScale();
  const rect = canvas.getBoundingClientRect();
  const x = parseFloat(textInput.dataset.x);
  const y = parseFloat(textInput.dataset.y);
  const fs = parseFloat(textInput.dataset.fontSize);
  textInput.style.left = `${rect.left + window.scrollX + x * scale}px`;
  textInput.style.top = `${rect.top + window.scrollY + y * scale}px`;
  textInput.style.fontSize = `${fs * scale}px`;
  textInput.style.lineHeight = "1.2";
}

function autoSizeTextInput() {
  textInput.style.width = "auto";
  textInput.style.height = "auto";
  textInput.style.width = `${textInput.scrollWidth + 4}px`;
  textInput.style.height = `${textInput.scrollHeight}px`;
}

textInput.addEventListener("input", autoSizeTextInput);
textInput.addEventListener("keydown", (e) => {
  // Enter commits, Shift+Enter makes a new line, Esc cancels.
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    commitText();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelText();
  }
});
textInput.addEventListener("blur", () => {
  if (textInput.style.display === "block") commitText();
});

function commitText() {
  const text = textInput.value.replace(/\s+$/g, "");
  const x = parseFloat(textInput.dataset.x);
  const y = parseFloat(textInput.dataset.y);
  const color = textInput.dataset.color;
  const fontSize = parseFloat(textInput.dataset.fontSize);

  hideTextInput();

  if (editingId) {
    const o = objects.find((x) => x.id === editingId);
    if (o) {
      o._editing = false;
      if (text) { o.text = text; snapshot(); }
      else { objects = objects.filter((x) => x.id !== o.id); snapshot(); }
    }
  } else if (text) {
    objects.push({ id: newId(), type: "text", x, y, text, color, fontSize });
    snapshot();
  }
  editingId = null;
  selectedId = null;
  redraw();
}

function cancelText() {
  if (editingId) {
    const o = objects.find((x) => x.id === editingId);
    if (o) o._editing = false;
  }
  hideTextInput();
  editingId = null;
  redraw();
}

function hideTextInput() {
  textInput.style.display = "none";
  textInput.value = "";
}

// Double-click a text object to edit it.
canvas.addEventListener("dblclick", (evt) => {
  const p = toCanvasCoords(evt);
  const hit = hitTest(p.x, p.y);
  if (hit && hit.type === "text") {
    selectedId = hit.id;
    startTextEditing(hit.x, hit.y, hit);
  }
});

// ---------- Crop tool ----------
const cropConfirm = document.getElementById("cropConfirm");

function clampToCanvas(p) {
  return {
    x: Math.max(0, Math.min(canvas.width, p.x)),
    y: Math.max(0, Math.min(canvas.height, p.y)),
  };
}

// Dim everything outside the pending crop rectangle and outline it.
function drawCropOverlay(r) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.fill("evenodd"); // punch the selection out of the dim layer
  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = Math.max(1, 2 / canvasScale());
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function showCropConfirm() {
  cropConfirm.hidden = false;
  positionCropConfirm();
}
function hideCropConfirm() {
  cropConfirm.hidden = true;
}
function positionCropConfirm() {
  if (cropConfirm.hidden || !cropRect) return;
  // The bar is position:fixed, so viewport coordinates from the canvas rect
  // place it directly under the selection.
  const scale = canvasScale();
  const rect = canvas.getBoundingClientRect();
  cropConfirm.style.left = `${rect.left + (cropRect.x + cropRect.w / 2) * scale}px`;
  cropConfirm.style.top = `${rect.top + (cropRect.y + cropRect.h) * scale + 10}px`;
}

// Trim the image (and all annotations) down to the selected rectangle.
function applyCrop(r) {
  const rx = Math.round(r.x), ry = Math.round(r.y);
  const rw = Math.round(r.w), rh = Math.round(r.h);

  const off = document.createElement("canvas");
  off.width = rw;
  off.height = rh;
  const octx = off.getContext("2d");
  if (bgImage) octx.drawImage(bgImage, rx, ry, rw, rh, 0, 0, rw, rh);
  else { octx.fillStyle = "#fff"; octx.fillRect(0, 0, rw, rh); }
  bgImage = off;

  for (const o of objects) {
    if (o.type === "pen") o.points = o.points.map((pt) => ({ x: pt.x - rx, y: pt.y - ry }));
    else { o.x -= rx; o.y -= ry; }
  }

  sizeCanvas(rw, rh);
  fitToViewport();
  cropRect = null;
  cropDrag = null;
  hideCropConfirm();
  selectedId = null;
  snapshot();
  setTool("select");
  redraw();
  showMessage("Cropped to selection.");
}

// Copy just the selected rectangle to the clipboard, leaving the image intact.
async function copyRegion(r) {
  const rx = Math.round(r.x), ry = Math.round(r.y);
  const rw = Math.round(r.w), rh = Math.round(r.h);

  // Render a clean frame (no selection outline, no crop overlay) to copy from.
  const prevSel = selectedId;
  selectedId = null;
  exporting = true;
  redraw();
  const off = document.createElement("canvas");
  off.width = rw;
  off.height = rh;
  off.getContext("2d").drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
  exporting = false;
  selectedId = prevSel;
  redraw(); // restore overlay + selection so the user can crop/copy again

  try {
    const blob = await new Promise((res) => off.toBlob(res, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showMessage("Copied selected region to clipboard.");
  } catch (err) {
    showMessage(`Copy failed: ${err.message}`, 5000);
  }
}

function cancelCrop() {
  cropRect = null;
  cropDrag = null;
  hideCropConfirm();
  redraw();
}

// Eraser: remove the topmost annotation under the point (whole objects).
function eraseAt(p) {
  const hit = hitTest(p.x, p.y);
  if (!hit) return;
  objects = objects.filter((o) => o.id !== hit.id);
  if (selectedId === hit.id) selectedId = null;
  erasedAny = true;
  redraw();
}

document.getElementById("cropApplyBtn").addEventListener("click", () => { if (cropRect) applyCrop(cropRect); });
document.getElementById("cropCopyBtn").addEventListener("click", () => { if (cropRect) copyRegion(cropRect); });
document.getElementById("cropCancelBtn").addEventListener("click", cancelCrop);
stage.addEventListener("scroll", positionCropConfirm);

// ---------- Toolbar wiring ----------
// The Draw tool uses a soft DOM cursor (see #penCursor) that swirls while
// moving, so we hide the native cursor over the canvas and drive our own.
const penCursorEl = document.getElementById("penCursor");
let penCursorIdleTimer = null;

function tintPenCursor() {
  penCursorEl.style.setProperty("--pen-color", style.color);
}

function movePenCursor(evt) {
  if (currentTool !== "pen") return;
  penCursorEl.style.left = `${evt.clientX}px`;
  penCursorEl.style.top = `${evt.clientY}px`;
  penCursorEl.hidden = false;
  penCursorEl.classList.add("moving");
  clearTimeout(penCursorIdleTimer);
  // Stop swirling shortly after the mouse settles.
  penCursorIdleTimer = setTimeout(() => penCursorEl.classList.remove("moving"), 140);
}

function hidePenCursor() {
  penCursorEl.hidden = true;
  penCursorEl.classList.remove("moving");
}

stage.addEventListener("mousemove", movePenCursor);
stage.addEventListener("mouseleave", hidePenCursor);

function setTool(tool) {
  // Leaving the crop tool abandons any half-made selection.
  if (tool !== "crop" && (cropRect || cropDrag)) cancelCrop();
  currentTool = tool;
  document.querySelectorAll(".tool[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
  if (tool === "pen") {
    tintPenCursor();
    canvas.style.cursor = "none"; // our swirling dot stands in for it
  } else {
    hidePenCursor();
    canvas.style.cursor =
      tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  }
}

document.querySelectorAll(".tool[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

// Central place to change the active color (from a swatch or the custom picker).
function setColor(color, fromPicker) {
  style.color = color;
  if (!fromPicker) document.getElementById("color").value = color;
  document.querySelectorAll(".swatch[data-color]").forEach((s) => {
    s.classList.toggle("active", s.dataset.color.toLowerCase() === color.toLowerCase());
  });
  if (currentTool === "pen") tintPenCursor();
  applyStyleToSelection();
}

document.querySelectorAll(".swatch[data-color]").forEach((s) => {
  s.addEventListener("click", () => setColor(s.dataset.color, false));
});
document.getElementById("color").addEventListener("input", (e) => {
  setColor(e.target.value, true);
});
document.getElementById("strokeWidth").addEventListener("input", (e) => {
  style.strokeWidth = +e.target.value;
  document.getElementById("strokeVal").textContent = e.target.value;
  applyStyleToSelection();
});
document.getElementById("fontSize").addEventListener("input", (e) => {
  style.fontSize = +e.target.value;
  document.getElementById("fontVal").textContent = e.target.value;
  applyStyleToSelection();
});

// Apply style changes to the currently selected object too.
function applyStyleToSelection() {
  if (!selectedId) return;
  const o = objects.find((x) => x.id === selectedId);
  if (!o) return;
  o.color = style.color;
  if (o.type !== "text") o.strokeWidth = style.strokeWidth;
  if (o.type === "text") o.fontSize = style.fontSize;
  redraw();
}

document.getElementById("deleteBtn").addEventListener("click", deleteSelected);
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);
document.getElementById("saveBtn").addEventListener("click", savePng);
document.getElementById("copyBtn").addEventListener("click", copyToClipboard);

function deleteSelected() {
  if (!selectedId) return;
  objects = objects.filter((o) => o.id !== selectedId);
  selectedId = null;
  snapshot();
  redraw();
}

// ---------- Keyboard shortcuts ----------
window.addEventListener("keydown", (e) => {
  if (textInput.style.display === "block") return; // typing

  // A pending crop grabs Enter (apply) and Esc (cancel).
  if (cropRect) {
    if (e.key === "Enter") { e.preventDefault(); applyCrop(cropRect); return; }
    if (e.key === "Escape") { e.preventDefault(); cancelCrop(); return; }
  }

  const meta = e.metaKey || e.ctrlKey;

  if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault(); redo(); return;
  }
  if (meta && e.key.toLowerCase() === "c") { copyToClipboard(); return; }
  if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); savePng(); return; }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedId) { e.preventDefault(); deleteSelected(); }
  }
  if (e.key === "v" || e.key === "V") setTool("select");
  if (e.key === "d" || e.key === "D") setTool("pen");
  if (e.key === "r" || e.key === "R") setTool("rect");
  if (e.key === "c" || e.key === "C") setTool("ellipse");
  if (e.key === "t" || e.key === "T") setTool("text");
  if (e.key === "x" || e.key === "X") setTool("crop");
  if (e.key === "e" || e.key === "E") setTool("eraser");
});

// ---------- Export ----------
function flattenedCanvas() {
  // Redraw without the selection outline for a clean export.
  const prevSel = selectedId;
  selectedId = null;
  redraw();
  const out = canvas;
  selectedId = prevSel;
  return out;
}

function savePng() {
  const c = flattenedCanvas();
  const url = c.toDataURL("image/png");
  redraw(); // restore selection outline
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `snapit-${stamp}.png`;
  a.href = url;
  a.click();
  showMessage("Saved PNG to your downloads.");
}

async function copyToClipboard() {
  try {
    flattenedCanvas();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    redraw();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showMessage("Copied annotated image to clipboard.");
  } catch (err) {
    showMessage(`Copy failed: ${err.message}`, 5000);
  }
}

// ---------- Misc ----------
let messageTimer = null;
function showMessage(text, ms = 2500) {
  messageEl.textContent = text;
  messageEl.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { messageEl.hidden = true; }, ms);
}

// Sync initial UI values. Start in the pen tool so the user can draw a
// red highlight anywhere on the shot the moment the editor opens.
setTool("pen");
setColor(style.color, false); // syncs the picker + highlights the matching swatch
document.getElementById("strokeWidth").value = style.strokeWidth;
document.getElementById("fontSize").value = style.fontSize;
