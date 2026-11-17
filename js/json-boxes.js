// json-boxes.js — JSON import/export boxes (drop, pick or paste a session file) and modal openers.

// --- JSON boxes: drop or pick a file, or paste text ---
const JSON_BOXES = {
  session: {
    load: data => {
      if (!data || !Array.isArray(data.foods) || !Array.isArray(data.plan)) throw new Error("That doesn't look like a meal plan session.");
      applyState(data);
      draft = emptyDraft();
      fillInputs();
      commit();
      toast('Session loaded');
    }
  },
  // Loads a session, then the modal closes so the toast and page are visible
  modal: {
    load: data => {
      JSON_BOXES.session.load(data);
      $('json-modal').close();
    }
  }
};

function openMealModal() {
  const modal = $('meal-modal');
  if (!modal.open) modal.showModal();
  $('mb-name').focus();
}

function openJsonModal(focus) {
  $('json-out').value = JSON.stringify(state, null, 2);
  $('btn-copy-json').textContent = 'Copy JSON';
  $('json-modal').querySelector('[data-json-error]').classList.add('hidden');
  $('example-count').textContent = `${EXAMPLE_SESSION.foods.length} foods, ${EXAMPLE_SESSION.meals.length} meals and a full week.`;
  $('json-modal').showModal();
  if (focus === 'examples') $('json-examples').scrollIntoView({ block: 'start' });
}

function jsonBoxHtml(name, prompt) {
  return `
    <div class="space-y-2">
      <label data-drop="${name}" class="flex flex-col items-center gap-1 border-2 border-dashed border-slate-600 hover:border-brand rounded-lg p-4 text-center cursor-pointer transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span class="text-sm font-semibold text-slate-200">${prompt}</span>
        <span class="text-xs text-slate-400">Drag a .json file here, or click to choose one</span>
        <input type="file" accept=".json,application/json" data-file="${name}" class="hidden">
      </label>
      <textarea data-paste="${name}" rows="3" spellcheck="false" placeholder="…or paste JSON here — it loads straight away"
        class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-emerald-400 text-xs font-mono focus:outline-none focus:border-brand resize-y"></textarea>
      <p data-json-error role="alert" class="hidden text-xs text-rose-300"></p>
    </div>`;
}

function loadJsonText(name, text) {
  const error = document.querySelector(`[data-json-box="${name}"] [data-json-error]`);
  try {
    JSON_BOXES[name].load(JSON.parse(text));
    error.classList.add('hidden');
    return true;
  } catch (err) {
    error.textContent = err instanceof SyntaxError ? "That isn't valid JSON — check for missing commas or brackets." : err.message;
    error.classList.remove('hidden');
    return false;
  }
}

// A file dropped just outside a box would otherwise open in the tab and leave the page
['dragover', 'drop'].forEach(type => window.addEventListener(type, e => e.preventDefault()));

function loadJsonFile(name, file) {
  if (!file) return;
  file.text().then(text => loadJsonText(name, text));
}

document.querySelectorAll('[data-json-box]').forEach(el => {
  const name = el.dataset.jsonBox;
  el.innerHTML = jsonBoxHtml(name, el.dataset.prompt);

  const drop = el.querySelector('[data-drop]');
  const highlight = on => {
    drop.classList.toggle('border-brand', on);
    drop.classList.toggle('bg-emerald-500/10', on);
  };
  drop.addEventListener('dragover', e => { e.preventDefault(); highlight(true); });
  drop.addEventListener('dragleave', () => highlight(false));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    highlight(false);
    loadJsonFile(name, e.dataTransfer.files[0]);
  });

  el.querySelector('[data-file]').addEventListener('change', e => {
    loadJsonFile(name, e.target.files[0]);
    e.target.value = '';
  });

  // Pasted JSON loads immediately; typed JSON loads when you click away
  const paste = el.querySelector('[data-paste]');
  const loadPasted = () => {
    if (paste.value.trim() && loadJsonText(name, paste.value)) paste.value = '';
  };
  paste.addEventListener('paste', () => setTimeout(loadPasted));
  paste.addEventListener('blur', loadPasted);
});

// --- The built-in example (example-data.js) ---
const exampleJson = () => JSON.stringify(EXAMPLE_SESSION, null, 2);

// Replaces everything with the example, then sizes its week to the example person's targets
function loadExample() {
  applyState(JSON.parse(JSON.stringify(EXAMPLE_SESSION)));
  draft = emptyDraft();
  applyLiveTargets();
  fillInputs();
  state.plan.forEach((day, d) => fitMains(day, state.daily.cals, d));
  commit();
  $('json-modal').close();
  toast('Example loaded — have a look around', { undoable: true });
}

// Adds the example's foods and meals to what's there. A food or meal you already have (same name) stays yours;
// example meals that use one of your foods are pointed at yours.
function addExampleFoods() {
  const byName = new Map(state.foods.map(f => [f.name.toLowerCase(), f]));
  const idFor = {};
  let foods = 0, meals = 0;
  EXAMPLE_SESSION.foods.forEach(f => {
    const mine = byName.get(f.name.toLowerCase());
    if (mine) { idFor[f.id] = mine.id; return; }
    const id = state.foods.some(x => x.id === f.id) ? uid() : f.id;
    idFor[f.id] = id;
    state.foods.push(normaliseFood({ ...JSON.parse(JSON.stringify(f)), id, grams: 0 }));
    foods++;
  });
  const mealNames = new Set(state.meals.map(m => m.name.toLowerCase()));
  EXAMPLE_SESSION.meals.forEach(m => {
    if (mealNames.has(m.name.toLowerCase())) return;
    const copy = JSON.parse(JSON.stringify(m));
    copy.id = state.meals.some(x => x.id === m.id) ? uid() : m.id;
    copy.items.forEach(i => { i.foodId = idFor[i.foodId] || i.foodId; });
    state.meals.push(copy);
    meals++;
  });
  commit();
  toast(foods || meals ? `Added ${plural(foods, 'food')} and ${plural(meals, 'meal')} from the example` : 'You already have everything in the example', { undoable: foods + meals > 0 });
}
