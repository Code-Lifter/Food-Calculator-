// food-form.js — Micronutrient inputs and the add/edit food modal.

// Grouped inputs for the food form (per 100 g) and the supplement form (per dose): the label is just the
// nutrient's name, and the unit sits inside the box
function microFieldsHtml(prefix, suffix, withFibre) {
  return NUTRIENT_GROUPS.map(([g, title]) => {
    const list = NUTRIENTS.filter(([k, , , group]) => group === g && (withFibre || k !== 'fibre'));
    return list.length ? `
      <fieldset>
        <legend class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">${title}</legend>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${list.map(([k, label, unit]) => `<div>
            <label for="${prefix}-m-${k}" class="block text-xs text-slate-300 mb-0.5 truncate" title="${label} (${unit}${suffix})">${label}</label>
            <div class="relative">
              <input id="${prefix}-m-${k}" data-micro="${prefix}:${k}" type="number" step="any" min="0" placeholder="—" class="w-full bg-slate-900 border border-slate-700 rounded-lg pl-2 pr-9 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand placeholder-slate-600">
              <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">${unit}</span>
            </div>
          </div>`).join('')}
        </div>
      </fieldset>` : '';
  }).join('');
}
// "5 of 14 filled" beside the food form's vitamins & minerals heading
function renderMicroCount() {
  const boxes = [...document.querySelectorAll('[data-micro^="ff:"]')];
  const filled = boxes.filter(el => el.value.trim() !== '').length;
  $('ff-micro-count').innerHTML = filled ? `<span class="text-emerald-400 font-semibold">${filled}</span> of ${boxes.length} filled` : 'none filled yet';
}
// Only boxes with something typed are stored; blank means unknown
function readMicros(prefix) {
  const out = {};
  document.querySelectorAll(`[data-micro^="${prefix}:"]`).forEach(el => {
    const n = toNum(el.value);
    if (n != null && n >= 0) out[el.dataset.micro.split(':')[1]] = n;
  });
  return out;
}
function fillMicros(prefix, micros = {}) {
  document.querySelectorAll(`[data-micro^="${prefix}:"]`).forEach(el => {
    const v = micros[el.dataset.micro.split(':')[1]];
    el.value = v != null ? v : '';
  });
}

// The food modal adds a food, or (from ✏️ Edit) edits one in place
function openFoodModal(f = null, focus = null) {
  editingFoodId = f ? f.id : null;
  $('food-form').reset();
  fillMicros('ff', (f && f.micros) || {});
  $('food-modal-title').textContent = f ? 'Edit Food' : 'Add a Food';
  $('ff-submit').textContent = f ? 'Save changes' : 'Add food';
  if (f) {
    $('ff-name').value = f.name;
    $('ff-category').value = meta(f).category;
    $('ff-grams').value = f.grams;
    $('ff-cals').value = Math.round((state.energyUnit === 'kJ' ? f.cals * KJ_PER_KCAL : f.cals) * 10) / 10;
    ['protein', 'carbs', 'fat', 'fibre'].forEach(k => { $(`ff-${k}`).value = f[k] != null ? f[k] : ''; });
  }
  $('ff-more').open = true;
  $('ff-grams-hint').innerHTML = f && !f.locked
    ? '🔓 <b class="text-slate-300">From plan:</b> this is worked out from your week plan. Type a new amount to fix it (🔒).'
    : 'The total for the week, e.g. a 1kg bag = 1000. Once your meals use this food you can switch it to 🔓 From plan and the week plan works the amount out.';
  renderMicroCount();
  renderFormPreview();
  $('food-modal').showModal();
  if (focus === 'micros') {
    $('ff-more').scrollIntoView({ block: 'start' });
    const first = $('ff-micros').querySelector('input');
    (first || $('ff-name')).focus();
  } else $('ff-name').focus();
}
