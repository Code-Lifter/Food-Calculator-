// render-stock.js — Step 5, At home: how much of each food on the shopping list is already in the house.
// Stored in state.stock as { foodId: grams } and taken off the shopping list (shopLists in text-export.js).

// Counted foods (eggs, apples) are entered as a count; everything else in grams
const countUnit = f => { const m = meta(f); return m.unitGrams > 0 ? { grams: m.unitGrams, word: m.unit || 'item' } : null; };
// "≈ 27 bananas": what the week needs, rounded up to whole ones
function unitHint(f, grams) {
  const u = countUnit(f);
  return u && grams > 0 ? `≈ ${plural(Math.ceil(grams / u.grams - 0.05), u.word)}` : '';
}

// The right-hand status for one food: covered, partly covered, or the whole amount still to buy
function stockStatus(f) {
  const have = haveOf(f), left = Math.max(0, f.grams - have);
  if (!left) return '<span class="text-emerald-400 font-semibold">✓ Got enough</span>';
  const b = buyInfo({ ...f, grams: left });
  return `<span class="${have ? 'text-amber-300' : 'text-slate-300'}">Buy <b>${fmtWeight(left)}</b>${b.text ? ` <span class="text-slate-400">· ${b.text}</span>` : ''}</span>`;
}

function renderStockSummary() {
  const need = state.foods.filter(f => f.grams > 0);
  const covered = need.filter(f => haveOf(f) >= f.grams).length;
  const partly = need.filter(f => haveOf(f) > 0 && haveOf(f) < f.grams).length;
  const shop = shopCost();
  $('stock-summary').innerHTML = need.length ? `
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/50"><div class="text-lg font-bold text-emerald-400">${covered}</div><div class="text-[11px] text-slate-400">got enough</div></div>
      <div class="p-2 rounded-lg bg-amber-950/30 border border-amber-800/50"><div class="text-lg font-bold text-amber-300">${partly}</div><div class="text-[11px] text-slate-400">got some</div></div>
      <div class="p-2 rounded-lg bg-slate-900/60 border border-slate-700/50"><div class="text-lg font-bold text-slate-100">${need.length - covered}</div><div class="text-[11px] text-slate-400">to buy${shop.priced ? ` · ≈ ${money(shop.total)}` : ''}</div></div>
    </div>` : '';
}

function renderStock() {
  renderStockSummary();
  const need = state.foods.filter(f => f.grams > 0);
  if (!need.length) {
    $('stock-list').innerHTML = `<div class="bg-slate-800 p-5 rounded-xl border border-slate-700">${emptyNote('Plan your week in step 4 first. The foods it needs show up here.')}</div>`;
    return;
  }
  $('stock-list').innerHTML = byAisle(need).map(([label, foods]) => `
    <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">${label}</h3>
      <ul class="divide-y divide-slate-700/60">
        ${foods.map(f => {
          const have = haveOf(f), u = countUnit(f);
          const shown = have ? (u ? Math.round(have / u.grams * 10) / 10 : have) : '';
          return `
          <li class="py-2.5 grid grid-cols-1 sm:grid-cols-[1fr_auto_12rem] items-center gap-x-4 gap-y-1.5">
            <div class="min-w-0">
              <b class="text-slate-100">${esc(f.name)}</b>
              <span class="block text-xs text-slate-400">Week needs ${fmtWeight(f.grams)}${unitHint(f, f.grams) ? ` (${unitHint(f, f.grams)})` : ''}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <label class="text-xs text-slate-400" for="stock-${f.id}">Have</label>
              <input id="stock-${f.id}" type="number" min="0" step="${u ? 'any' : 1}" inputmode="decimal" value="${shown}" placeholder="–" data-stock="${f.id}"${u ? ` data-unit-grams="${u.grams}"` : ''}
                class="w-20 bg-slate-900 border ${have >= f.grams ? 'border-emerald-700' : have ? 'border-amber-700' : 'border-slate-700'} rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand">
              <span class="w-16 text-xs text-slate-400 truncate" title="${u ? esc(u.word) + 's' : 'grams'}">${u ? esc(pluralLabel(u.word)) : 'g'}</span>
              <button data-action="stock-all" data-id="${f.id}" title="I've got at least ${fmtWeight(f.grams)}" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 py-1.5 px-2.5 rounded-lg border border-slate-600 transition-colors">All</button>
            </div>
            <div class="text-xs sm:text-right" data-stock-status="${f.id}">${stockStatus(f)}</div>
          </li>`;
        }).join('')}
      </ul>
    </div>`).join('');
}

// Food ids from data attributes are strings; imported foods may have number ids
const stockFood = id => state.foods.find(f => String(f.id) === String(id));

// While typing, only this row and the totals redraw (a full redraw would lose the cursor)
function updateStockRow(id) {
  const f = stockFood(id);
  if (!f) return;
  const status = document.querySelector(`[data-stock-status="${id}"]`);
  if (status) status.innerHTML = stockStatus(f);
  const input = $(`stock-${id}`);
  if (input) {
    input.classList.remove('border-emerald-700', 'border-amber-700', 'border-slate-700');
    input.classList.add(haveOf(f) >= f.grams ? 'border-emerald-700' : haveOf(f) ? 'border-amber-700' : 'border-slate-700');
  }
  renderStockSummary();
}
