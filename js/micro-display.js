// micro-display.js — Micronutrient card colours (green/yellow/red), daily average / week total, per-day nutrients.

// --- Micronutrient display ---
const MICRO_TONES = {
  good: { text: 'text-emerald-400', bar: 'bg-emerald-500' },
  low: { text: 'text-amber-400', bar: 'bg-amber-400' },
  bad: { text: 'text-rose-400', bar: 'bg-rose-500' },
  none: { text: 'text-slate-300', bar: 'bg-slate-500' }
};
// Health range → colour. Targets: green at 90%+ of the target, yellow at 50–90%, red under 50% or above the
// upper level. Sodium: green under 2,000 mg, yellow to 2,300 mg, red above. Sat fat: green under 10% of energy,
// yellow to 12%, red above. Sugars: green up to 18% of energy, yellow to 22.5%, red above.
const SODIUM_HIGH = 2300, SAT_FAT_HIGH_PCT = 12;
const microTone = (r, k) => {
  if (k === 'sodium') return r <= 1 ? MICRO_TONES.good : r <= SODIUM_HIGH / SODIUM_LIMIT ? MICRO_TONES.low : MICRO_TONES.bad;
  if (k === 'sugars') return r <= 1 ? MICRO_TONES.good : r <= SUGAR_HIGH_PCT / SUGAR_PCT ? MICRO_TONES.low : MICRO_TONES.bad;
  if (k === 'satFat') return r <= 1 ? MICRO_TONES.good : r <= SAT_FAT_HIGH_PCT / SAT_FAT_PCT ? MICRO_TONES.low : MICRO_TONES.bad;
  return r >= 0.9 ? MICRO_TONES.good : r >= 0.5 ? MICRO_TONES.low : MICRO_TONES.bad;
};
// One row per nutrient. `days` scales everything up for a week total (amounts and targets alike, so the colours
// don't change); 1 is a single day or the daily average.
function microRows(m, kcal, days = 1) {
  const { targets } = microTargets();
  kcal *= days;
  return NUTRIENTS.map(([k, label, unit, group]) => {
    const food = (m.food[k] || 0) * days, supp = (m.supp[k] || 0) * days, total = food + supp;
    const coverage = m.coverage[k] || 0;
    const row = { k, label, unit, group, food, supp, total, coverage, has: m.food[k] != null || m.supp[k] != null,
      grey: coverage < COVERAGE_MIN, base: 0, tone: MICRO_TONES.none, text: `${fmtMicro(total)} ${unit}` };
    if (k === 'sodium') {
      row.base = SODIUM_LIMIT * days;
      row.tone = microTone(total / row.base, k);
      row.text += ` · aim under ${fmt(row.base)} mg`;
    } else if (k === 'satFat') {
      if (kcal > 0) {
        row.base = kcal * SAT_FAT_PCT / 100 / 9; // grams that make 10% of the energy
        row.tone = microTone(total / row.base, k);
        row.text += ` · ${fmt1(total * 9 / kcal * 100)}% of energy (guide: under ${SAT_FAT_PCT}%)`;
      }
    } else if (k === 'sugars') {
      if (kcal > 0) {
        row.base = kcal * SUGAR_PCT / 100 / 4; // grams that make 18% of the energy
        row.tone = microTone(total / row.base, k);
        row.text += ` · ${fmt1(total * 4 / kcal * 100)}% of energy (guide: under ${fmt(row.base)} g)`;
      }
    } else if (targets[k]) {
      row.base = targets[k] * days;
      row.tone = microTone(total / row.base, k);
      row.text = `${fmtMicro(total)} / ${fmtMicro(row.base)} ${unit}`;
    }
    // Over the upper level (per day) is red whatever the target says
    if (UL[k] && (UL_SUPPLEMENTS_ONLY.has(k) ? supp : total) > UL[k] * days) {
      row.tone = MICRO_TONES.bad;
      row.text += ` · above upper level`;
    }
    return row;
  });
}
// Food part in the row's colour (grey when too little of the food has data), supplements as a purple segment
function microBar(r) {
  if (!r.base) return '';
  const foodW = Math.min(100, r.food / r.base * 100);
  const suppW = Math.min(100 - foodW, r.supp / r.base * 100);
  return `<div class="h-2 bg-slate-900 rounded-full overflow-hidden flex"><div class="h-full ${r.tone.bar}${r.grey ? ' opacity-40' : ''}" style="width:${foodW}%"></div><div class="h-full bg-violet-400" style="width:${suppW}%"></div></div>`;
}

// Ready tab: collapsed by default, so nothing changes for anyone who doesn't use it
function microCard() {
  const w = weekMicros();
  const { sex, band, assumed } = microTargets();
  const warnings = ulWarnings();
  const week = microView === 'week';
  const rows = microRows(w, w.kcal, week ? w.days : 1);
  const pill = (v, label) => `<button type="button" data-action="set-micro-view" data-value="${v}" aria-pressed="${microView === v}"
    class="flex-1 px-3 py-1 rounded-full font-semibold transition-colors ${microView === v ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white'}">${label}</button>`;
  const legend = `<div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
    <span><span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> In range</span>
    <span><span class="inline-block w-2 h-2 rounded-full bg-amber-400"></span> A bit low / high</span>
    <span><span class="inline-block w-2 h-2 rounded-full bg-rose-500"></span> Well short / too high</span>
  </div>`;
  const toggle = !w.days ? '' : `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex bg-slate-900 rounded-full p-1 border border-slate-700 text-xs w-full sm:w-64" role="group" aria-label="Daily average or week total">
        ${pill('avg', 'Daily average')}${pill('week', 'Week total')}
      </div>
      ${legend}
    </div>
    ${week ? `<p class="text-[11px] text-slate-400">Totals for the ${plural(w.days, 'planned day')}, against ${w.days} × the daily target.</p>` : ''}`;
  const body = !w.days ? emptyNote('Plan your week in step 4 to see your micronutrients.')
    : toggle + NUTRIENT_GROUPS.map(([g, title]) => `
      <div class="space-y-2">
        <h3 class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${title}</h3>
        ${rows.filter(r => r.group === g).map(r => r.has ? `
          <div class="space-y-1">
            <div class="flex flex-wrap justify-between gap-x-2 text-xs">
              <span class="text-slate-300">${r.label}</span>
              <span class="font-semibold ${r.grey ? 'text-slate-400' : r.tone.text}">${r.text}</span>
            </div>
            ${microBar(r)}
            ${r.grey ? `<p class="text-[11px] text-slate-500">only ${fmt(r.coverage * 100)}% of your food has data</p>` : ''}
          </div>` : `
          <div class="flex justify-between text-xs"><span class="text-slate-400">${r.label}</span><span class="text-slate-500">no data</span></div>`).join('')}
      </div>`).join('');
  return `
    <details id="micro-card" ${microCardOpen ? 'open' : ''} class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md">
      <summary class="cursor-pointer select-none text-lg font-bold text-slate-100">🥗 Micronutrients (${week ? 'week total' : 'daily average'})${warnings.length ? ` <span class="text-xs font-semibold text-amber-300">· ⚠ ${plural(warnings.length, 'upper-level warning')}</span>` : ''}</summary>
      <div class="mt-3 space-y-4">
        <p class="text-xs text-slate-400">Estimates from the foods that have nutrient data${state.supplements.length ? ', plus supplements (<span class="text-violet-300">purple</span>)' : ''}. Targets: NHMRC Nutrient Reference Values, ${sex} ${band.replace('-', '–')}${assumed ? " — your stats in step 1 aren't filled in, so these are the adult male 19–50 values" : ''}. Add nutrients to a food with ✏️ Edit in the Single Food Pantry (step 2).</p>
        ${warnings.length ? `<div class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">${warnings.map(x => `<div>⚠ ${esc(x.text)}</div>`).join('')}</div>` : ''}
        ${body}
      </div>
    </details>`;
}

// Week tab, under a day: its supplements, any upper-level warnings, and (after 🥗) its nutrients
function dayExtrasHtml(day, d, dt, ul) {
  const supps = suppsOn(d);
  const warn = ul.filter(x => x.d === d);
  let html = '';
  if (supps.length) html += `<div class="text-[11px] text-violet-300">💊 ${supps.map(x => `${esc(x.name)} ${esc(doseText(x))}${x.kcal ? ` (${fmt(x.kcal)} kcal)` : ''}`).join(' · ')}</div>`;
  if (warn.length) html += `<div class="text-[11px] text-amber-300 space-y-0.5">${warn.map(x => `<div>⚠ ${esc(x.text)}</div>`).join('')}</div>`;
  if (openMicroDays.has(d)) {
    const rows = microRows(dayMicros(day, d), dt.cals).filter(r => r.has);
    html += rows.length ? `
      <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] bg-slate-900/60 border border-slate-700/50 rounded-lg p-2">
        ${rows.map(r => `<span class="${r.grey ? 'text-slate-500' : r.tone.text}"${r.grey ? ` title="only ${fmt(r.coverage * 100)}% of this day's food has data"` : ''}>${r.label}: ${fmtMicro(r.total)}${r.base && r.k !== 'sodium' && r.k !== 'satFat' ? `/${fmtMicro(r.base)}` : ''} ${r.unit}</span>`).join('')}
      </div>`
      : `<p class="text-[11px] text-slate-500 bg-slate-900/60 border border-slate-700/50 rounded-lg p-2">No nutrient data for this day's food yet — add it with ✏️ Edit in the Single Food Pantry (step 2).</p>`;
  }
  return html;
}

// Meals tab: the three nutrients a portion gives most of, as % of the daily target (only nutrients with data)
function richestLine(m) {
  const { targets } = microTargets();
  const { amount } = microTotals(slotItems(m));
  const top = Object.entries(amount).filter(([k, v]) => targets[k] && v > 0)
    .map(([k, v]) => [k, v / targets[k]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.length ? `<div class="text-[11px] text-slate-500">Richest in: ${top.map(([k, r]) => `${nutrient(k)[1]} ${fmt(r * 100)}%`).join(' · ')} of daily target per portion</div>` : '';
}
