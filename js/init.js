// init.js — Start-up: load saved data, first render, share links, ?test self-tests. Must load last.

// --- Init ---
// `selected` on Other so the form's reset() goes back to it for custom foods
$('ff-category').innerHTML = CATEGORIES.map(([c, label]) => `<option value="${c}" ${c === 'other' ? 'selected' : ''}>${label}</option>`).join('');
$('ff-micros').innerHTML = microFieldsHtml('ff', ' /100g', false);
$('sp-micros').innerHTML = microFieldsHtml('sp', '', true);
$('sp-unit').innerHTML = DOSE_UNITS.map(u => `<option value="${u}">${u}</option>`).join('');
$('sp-timing').innerHTML = TIMINGS.map(([t, label]) => `<option value="${t}" ${t === 'any' ? 'selected' : ''}>${label}</option>`).join('');
$('sp-days').innerHTML = DAYS.map((name, d) => `<label class="flex items-center gap-1.5 text-sm text-slate-200 cursor-pointer"><input type="checkbox" data-supp-day value="${d}" checked class="w-4 h-4 accent-emerald-400">${name.slice(0, 3)}</label>`).join('');
load();
if (state.supplements.length) $('supp-card').open = true;
lastSnapshot = snapshot();
fillInputs();
renderAll();
readShareHash();
window.addEventListener('hashchange', readShareHash);
if (new URLSearchParams(location.search).has('test')) { runTargetTests(); runMicroTests(); }
