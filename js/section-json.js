// section-json.js — "{ } Add JSON" beside + Add a food and + Create a meal: adds just foods, or just meals, from JSON without touching the rest.

// Which section the dialog is adding to: 'foods' or 'meals'
let sectionKind = 'foods';

// Takes a list ([…]), a session-like object ({ foods: […] }) or a single item ({ name, … })
function listFrom(data, key) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data[key])) return data[key];
    if (data.name) return [data];
  }
  return null;
}
const nameKey = s => String(s || '').trim().toLowerCase();

// Adds foods to the pantry. One with the same id or name as a food you have replaces its values (keeping
// its id, so your meals still point at it). Returns the counts and how each JSON id maps to a pantry id.
function mergeFoods(list) {
  const idFor = {};
  let added = 0, updated = 0;
  list.forEach(raw => {
    if (!raw || typeof raw !== 'object' || !String(raw.name || '').trim()) return;
    const f = normaliseFood({ ...JSON.parse(JSON.stringify(raw)), name: String(raw.name).trim() });
    delete f.grams; // what to buy comes from the week plan
    const mine = (raw.id != null && foodById(String(raw.id))) || state.foods.find(x => nameKey(x.name) === nameKey(f.name));
    if (mine) {
      Object.assign(mine, f, { id: mine.id, grams: mine.grams });
      idFor[String(raw.id ?? f.name)] = mine.id;
      updated++;
    } else {
      const id = raw.id != null && !foodById(String(raw.id)) ? String(raw.id) : uid();
      state.foods.push({ ...f, id, grams: 0 });
      idFor[String(raw.id ?? f.name)] = id;
      added++;
    }
  });
  return { added, updated, idFor };
}

// Adds meals. Each ingredient needs a food: its `foodId` (from this JSON's foods or your pantry) or a `food`/`name`
// matching a pantry food's name. A meal with the same id or name as one you have replaces it.
function mergeMeals(list, idFor = {}) {
  let added = 0, updated = 0;
  const skipped = [];
  list.forEach(raw => {
    if (!raw || typeof raw !== 'object' || !String(raw.name || '').trim()) return;
    const name = String(raw.name).trim();
    const missing = [];
    const items = (Array.isArray(raw.items) ? raw.items : []).map(it => {
      if (!it || typeof it !== 'object') return null;
      const byId = it.foodId != null && (idFor[String(it.foodId)] || (foodById(String(it.foodId)) && String(it.foodId)));
      const label = it.food || it.name || (it.snap && it.snap.name);
      const byName = !byId && label && (state.foods.find(f => nameKey(f.name) === nameKey(label)) || {}).id;
      const foodId = byId || byName;
      if (!foodId) { missing.push(label || it.foodId || '?'); return null; }
      const item = { ...it, foodId, grams: Math.max(0, Number(it.grams) || 0) };
      delete item.snap; delete item.food; delete item.name;
      if (!ITEM_MODES[item.mode]) delete item.mode;
      return item;
    }).filter(Boolean);
    if (missing.length || !items.length) { skipped.push(`${name} (${missing.length ? `no ${missing.join(', ')} in your pantry` : 'no ingredients'})`); return; }
    const types = (Array.isArray(raw.types) ? raw.types : [raw.type]).filter(t => MEAL_TYPES[t]);
    if (!types.length) types.push('dinner');
    const mine = (raw.id != null && mealById(String(raw.id))) || state.meals.find(m => nameKey(m.name) === nameKey(name));
    const meal = {
      id: mine ? mine.id : raw.id != null && !mealById(String(raw.id)) ? String(raw.id) : uid(),
      name, type: types[0], types, servings: Number(raw.servings) > 0 ? Number(raw.servings) : 1,
      fridgeDays: Number(raw.fridgeDays) >= 1 ? Math.min(7, Math.round(raw.fridgeDays)) : 3,
      freezes: raw.freezes === true, prepAhead: raw.prepAhead === true, items
    };
    if (mine) { state.meals[state.meals.indexOf(mine)] = meal; updated++; } else { state.meals.push(meal); added++; }
  });
  return { added, updated, skipped };
}

// The json box's load: foods only, or meals (plus any foods sent with them, so their ingredients resolve)
function importSection(data) {
  const key = sectionKind;
  const list = listFrom(data, key);
  if (!list) throw new Error(key === 'foods'
    ? 'Expected a list of foods: [ { "name": …, "cals": …, "protein": … }, … ] or { "foods": [ … ] }.'
    : 'Expected a list of meals: [ { "name": …, "type": "dinner", "items": [ … ] }, … ] or { "meals": [ … ] }.');
  const parts = [];
  let changed = 0, skipped = [];
  if (key === 'foods') {
    const r = mergeFoods(list);
    changed = r.added + r.updated;
    if (r.added) parts.push(`added ${plural(r.added, 'food')}`);
    if (r.updated) parts.push(`updated ${plural(r.updated, 'food')}`);
  } else {
    const foods = Array.isArray(data.foods) ? mergeFoods(data.foods) : { added: 0, updated: 0, idFor: {} };
    const r = mergeMeals(list, foods.idFor);
    changed = r.added + r.updated + foods.added + foods.updated;
    skipped = r.skipped;
    if (r.added) parts.push(`added ${plural(r.added, 'meal')}`);
    if (r.updated) parts.push(`updated ${plural(r.updated, 'meal')}`);
    if (foods.added) parts.push(`${plural(foods.added, 'new food')} for them`);
  }
  if (!changed) throw new Error(skipped.length ? `Nothing added. Skipped: ${skipped.join('; ')}.` : `No ${key} with a name found in that JSON.`);
  commit();
  $('section-json-modal').close();
  const text = parts.join(', ');
  toast(`${text[0].toUpperCase()}${text.slice(1)}${skipped.length ? ` — skipped ${skipped.join('; ')}` : ''}`, { undoable: true });
}

function openSectionJson(kind) {
  sectionKind = kind === 'meals' ? 'meals' : 'foods';
  const foods = sectionKind === 'foods';
  $('section-json-title').textContent = foods ? '{ } Add foods from JSON' : '{ } Add meals from JSON';
  $('section-json-help').innerHTML = foods
    ? 'Adds foods to your pantry, per 100g. Everything else stays as it is. A food with the same name as one you have updates it.'
    : 'Adds meals. Everything else stays as it is. Each ingredient needs a food from your pantry: give its <code>foodId</code>, or its name as <code>"food"</code>. You can include a <code>"foods"</code> list too, and those go in the pantry first. A meal with the same name as one you have replaces it.';
  $('section-json-sample').textContent = foods
    ? '[\n  { "name": "Greek yoghurt", "category": "dairy", "cals": 97, "protein": 9, "carbs": 4, "fat": 5 }\n]'
    : '[\n  { "name": "Yoghurt bowl", "type": "breakfast",\n    "items": [ { "food": "Greek yoghurt", "grams": 200 }, { "food": "Banana", "grams": 100 } ] }\n]';
  const box = $('section-json-modal');
  box.querySelector('[data-json-error]').classList.add('hidden');
  box.querySelector('[data-paste]').value = '';
  box.showModal();
}
