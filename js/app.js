// app.js — Re-rendering, tab switching, undo/redo history and commit() — the save-and-redraw step for every change.

// Only the open step is drawn on each change; the others draw when you switch to them
const PANEL_RENDERERS = {
  target: () => { renderStats(); renderTarget(); renderPrep(); renderSupplements(); },
  shopping: () => { renderEnergyUnit(); $('currency').value = state.currency; renderShopping(); },
  meals: () => renderMeals(),
  plan: () => renderPlan(),
  stock: () => renderStock(),
  summary: () => renderSummary()
};

function renderAll() {
  renderHistory();
  renderStatus();
  renderTabs();
  PANEL_RENDERERS[state.tab]();
}

function showTab(tab) {
  state.tab = tab;
  save();
  renderTabs();
  PANEL_RENDERERS[tab]();
}

// The pantry is a library: every food stays, and what to buy (f.grams) is always what the week plan uses
function syncDerivedGrams() {
  const used = plannedGrams();
  state.foods.forEach(f => { f.grams = Math.ceil((used[f.id] || 0) - 1e-9); });
}

// View settings (open tab, raw/cooked, kJ/kcal) aren't part of undo history
const snapshot = () => JSON.stringify({ ...state, tab: undefined, weightMode: undefined, viewDay: undefined, energyUnit: undefined });

// `group` merges rapid changes to one field (typing "2000") into a single undo step
function recordHistory(group) {
  const snap = snapshot();
  if (snap === lastSnapshot) return;
  const now = Date.now();
  if (!(group && group === lastGroup && now - lastGroupAt < 1000)) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }
  redoStack = [];
  lastSnapshot = snap;
  lastGroup = group || null;
  lastGroupAt = now;
}

function restore(snap) {
  const { tab, weightMode, viewDay, energyUnit } = state;
  applyState(JSON.parse(snap));
  Object.assign(state, { tab, weightMode, viewDay, energyUnit });
  lastSnapshot = snapshot();
  lastGroup = null;
  fillInputs();
  save();
  renderAll();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(lastSnapshot);
  restore(undoStack.pop());
  toast('Undone');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(lastSnapshot);
  restore(redoStack.pop());
  toast('Redone');
}

function renderHistory() {
  $('btn-undo').disabled = !undoStack.length;
  $('btn-redo').disabled = !redoStack.length;
}

function commit(group) {
  refreshSnapshots();
  syncDerivedGrams();
  recordHistory(group);
  save();
  renderAll();
}

// --- Actions ---
