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
let drag = null; // { mode, id, startX, startY, orig }

// ---------- Load the screenshot ----------
(async function init() {
  const params = new URLSearchParams(location.search);

  const error = params.get("error");
  if (error) {
    showMessage(`Capture failed: ${error}`, 6000);
    sizeCanvas(900, 500);
    redraw();
    return;
  }

  const id = params.get("id");
  if (!id) {
    showMessage("No screenshot id provided.", 6000);
    sizeCanvas(900, 500);
    redraw();
    return;
  }

  const stored = await chrome.storage.local.get(id);
  const dataUrl = stored[id];
  if (!dataUrl) {
    showMessage("Screenshot data not found (it may have expired).", 6000);
    sizeCanvas(900, 500);
    redraw();
    return;
  }

  // Free the storage now that we have the image in this page.
  chrome.storage.local.remove(id);

  const img = new Image();
  img.onload = () => {
    bgImage = img;
    sizeCanvas(img.naturalWidth, img.naturalHeight);
    fitToViewport();
    redraw();
  };
  img.src = dataUrl;
})();

function sizeCanvas(w, h) {
  canvas.width = w;
  canvas.height = h;
}

// Scale the canvas down (via CSS) so it fits the window without changing
// its internal resolution — keeps exports crisp.
function fitToViewport() {
  const maxW = stage.clientWidth - 48;
  const maxH = stage.clientHeight - 48;
  const scale = Math.min(1, maxW / canvas.width, maxH / canvas.height);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}
window.addEventListener("resize", () => { fitToViewport(); positionTextInput(); });

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
  for (const o of objects) drawObject(o);
  if (selectedId) drawSelection(objects.find((o) => o.id === selectedId));
}

function drawObject(o) {
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = o.strokeWidth;
  ctx.lineJoin = "round";

  if (o.type === "rect") {
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
function snapshot() {
  undoStack.push(JSON.stringify(objects));
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(objects));
  objects = JSON.parse(undoStack.pop());
  selectedId = null;
  redraw();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(objects));
  objects = JSON.parse(redoStack.pop());
  selectedId = null;
  redraw();
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
  if (!drag) return;
  const p = toCanvasCoords(evt);
  const o = objects.find((x) => x.id === drag.id);
  if (!o) return;

  if (drag.mode === "create") {
    o.w = p.x - drag.startX;
    o.h = p.y - drag.startY;
  } else if (drag.mode === "move") {
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    o.x = drag.orig.x + dx;
    o.y = drag.orig.y + dy;
  }
  redraw();
});

window.addEventListener("mouseup", () => {
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

// Don't draw a text object while its textarea is open.
const _origDrawObject = drawObject;
function drawObjectGuarded(o) {
  if (o._editing) return;
  _origDrawObject(o);
}
// Patch redraw to respect _editing.
function redrawWithGuard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
  else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  for (const o of objects) drawObjectGuarded(o);
  if (selectedId) {
    const sel = objects.find((o) => o.id === selectedId);
    if (sel && !sel._editing) drawSelection(sel);
  }
}
redraw = redrawWithGuard;

// ---------- Toolbar wiring ----------
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll(".tool[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
  canvas.style.cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
}

document.querySelectorAll(".tool[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

document.getElementById("color").addEventListener("input", (e) => {
  style.color = e.target.value;
  applyStyleToSelection();
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
  if (e.key === "r" || e.key === "R") setTool("rect");
  if (e.key === "c" || e.key === "C") setTool("ellipse");
  if (e.key === "t" || e.key === "T") setTool("text");
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

// Sync initial UI values.
setTool("select");
document.getElementById("color").value = style.color;
document.getElementById("strokeWidth").value = style.strokeWidth;
document.getElementById("fontSize").value = style.fontSize;
