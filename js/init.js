// init.js — Start-up: load saved data, first render, share links, ?test self-tests. Must load last.

// --- Init ---
// `selected` on Other so the form's reset() goes back to it for custom foods
$('ff-category').innerHTML = CATEGORIES.map(([c, label]) => `<option value="${c}" ${c === 'other' ? 'selected' : ''}>${label}</option>`).join('');
$('ff-micros').innerHTML = microFieldsHtml('ff', ' /100g', false);
$('sp-micros').innerHTML = microFieldsHtml('sp', '', true);
$('sp-unit').innerHTML = DOSE_UNITS.map(u => `<option value="${u}">${u}</option>`).join('');
$('sp-timing').innerHTML = TIMINGS.map(([t, label]) => `<option value="${t}" ${t === 'any' ? 'selected' : ''}>${label}</option>`).join('');
state.viewDay = Math.max(0, todayIndex()); // the Week tab opens on today, unless a saved session says otherwise
load();
renderSuppDays();
if (state.supplements.length) $('supp-card').open = true;
lastSnapshot = snapshot();
fillInputs();
renderAll();
readShareHash();
window.addEventListener('hashchange', readShareHash);
if (new URLSearchParams(location.search).has('test')) { runTargetTests(); runMicroTests(); }
