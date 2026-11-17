// shopping.js — Aisles, packs, prices, raw/cooked factors, and shared display bits (status colours, progress bars, plural).

// --- Shopping details: aisle, units, packs, prices, raw/cooked ---
const META_KEYS = ['category', 'unit', 'unitGrams', 'packGrams', 'packLabel', 'pricePerPack', 'cookedFactor', 'prep', 'shortLife'];

// A food's own details (aisle, packs, prices)
function meta(f) {
  const m = {};
  META_KEYS.forEach(k => { m[k] = f[k]; });
  if (!CATEGORIES.some(([c]) => c === m.category)) m.category = 'other';
  return m;
}

// prep → [where it's cooked, verb]; foods with no prep need no cooking
const PREP_METHODS = {
  boil: ['hob', 'Boil'], simmer: ['hob', 'Simmer'], pan: ['hob', 'Pan-fry'], steam: ['hob', 'Steam'],
  roast: ['oven', 'Roast'], bake: ['oven', 'Bake'], pantry: ['pantry', '']
};
const PREP_GROUPS = [['hob', '🔥 On the hob'], ['oven', '♨️ In the oven'], ['none', '🥣 No cooking — mix & portion'], ['pantry', '🫙 For cooking']];
const fmtWeight = g => g >= 1000 ? `${fmt1(g / 1000)}kg` : `${fmt(g)}g`;

const money = n => `${currencySymbol()}${n.toFixed(2)}`;
const pluralLabel = label => label.replace(/(\w+)$/, w => w === 'loaf' ? 'loaves' : /(s|x|ch|sh)$/.test(w) ? `${w}es` : `${w}s`);
const pricePerGram = f => { const m = meta(f); return m.pricePerPack != null && m.packGrams ? m.pricePerPack / m.packGrams : null; };

// What to pick up: counted foods round to whole units, weighed foods get a ~10% buffer, then whole packs
function buyInfo(f) {
  const m = meta(f);
  if (!(f.grams > 0)) return { units: 0, packs: 0, cost: null, text: '' };
  const units = m.unitGrams ? Math.max(1, Math.ceil(f.grams / m.unitGrams - 0.1)) : 0;
  const need = m.unitGrams ? units * m.unitGrams : f.grams * 1.1;
  const packs = m.packGrams ? Math.max(1, Math.ceil(need / m.packGrams - 1e-9)) : 0;
  const parts = [];
  if (units) parts.push(plural(units, m.unit));
  if (packs && m.packLabel) parts.push(`${packs} × ${packs > 1 ? pluralLabel(m.packLabel) : m.packLabel}`);
  return { units, packs, cost: packs && m.pricePerPack != null ? packs * m.pricePerPack : null, text: parts.join(' · ') };
}

// What's left to buy after what's at home (both shops)
function shopCost() {
  const { main, topUp } = shopLists();
  const bought = [...main, ...topUp];
  const priced = bought.map(buyInfo).filter(b => b.cost != null);
  return { total: priced.reduce((s, b) => s + b.cost, 0), priced: priced.length, items: bought.length };
}

// Cost of the food the plan actually eats (per gram, not whole packs); null if any ingredient has no price
function portionCost(meal) {
  let cost = 0;
  for (const { food, grams } of slotItems(meal)) {
    const ppg = pricePerGram(food);
    if (ppg == null) return null;
    cost += ppg * grams;
  }
  return cost;
}

// Stored grams are always raw; cooked mode shows (and takes) weights after cooking
const isCooked = () => state.weightMode === 'cooked';
// Typical cooked ÷ raw weight, used when a food has no cookedFactor of its own. First match wins.
// Oats are weighed dry and potatoes barely change, so both stay at 1.
const COOKED_DEFAULTS = [
  [/\boats?\b|porridge/i, 1],
  [/potato/i, 1],
  [/brown rice/i, 2.6],
  [/rice(?! ?(cakes?|milk|crackers?|paper))/i, 2.9],
  [/pasta|spaghetti|penne/i, 2.2],
  [/chicken/i, 0.73],
  [/beef mince|minced beef/i, 0.69],
  [/salmon/i, 0.85],
  [/lentil/i, 2.8],
  [/quinoa/i, 3.2]
];
// A name that says it's already cooked (or tinned) has no raw weight to convert from
function defaultCookedFactor(name) {
  if (/cooked|boiled|tinned|canned|drained/i.test(name)) return null;
  const hit = COOKED_DEFAULTS.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}
const cookedFactorOf = f => meta(f).cookedFactor || defaultCookedFactor(String(f.name)) || 1;
const shownGrams = (f, raw) => isCooked() ? raw * cookedFactorOf(f) : raw;
function gramsText(f, raw) {
  const changes = cookedFactorOf(f) !== 1;
  return `${fmt(shownGrams(f, raw))}g${changes ? ` <span class="${isCooked() ? 'text-amber-400' : 'text-slate-400'}">${isCooked() ? 'cooked' : 'raw'}</span>` : ''}`;
}

// Green within ±5% of the target, amber 5–10% under or over, red more than 10% either way.
// Icons and screen-reader words follow the same bands.
function tolerance(actual, target) {
  if (!target) return { text: 'text-slate-200', bar: 'bg-slate-500', icon: '', words: '' };
  const r = actual / target;
  if (r > 1.10) return { text: 'text-rose-400', bar: 'bg-rose-500', icon: '▲', words: 'over target' };
  if (r > 1.05) return { text: 'text-amber-400', bar: 'bg-amber-500', icon: '▲', words: 'a little over target' };
  if (r >= 0.95) return { text: 'text-emerald-400', bar: 'bg-emerald-500', icon: '✓', words: 'on target' };
  if (r >= 0.90) return { text: 'text-amber-400', bar: 'bg-amber-500', icon: '▼', words: 'a little under target' };
  return { text: 'text-rose-400', bar: 'bg-rose-500', icon: '▼', words: 'under target' };
}
const statusColor = (actual, target) => tolerance(actual, target).text;
function statusMark(actual, target) {
  if (!target) return '';
  const { icon, words } = tolerance(actual, target);
  return `<span aria-hidden="true">${icon}</span><span class="sr-only">${words}: </span> `;
}
const barColor = (actual, target) => tolerance(actual, target).bar;
function progressBar(actual, target) {
  const pct = target ? Math.min(100, (actual / target) * 100) : 0;
  return `<div class="h-2 bg-slate-900 rounded-full overflow-hidden"><div class="h-full ${barColor(actual, target)} transition-all" style="width:${pct}%"></div></div>`;
}

// Traffic light for "how much is left", same rules as food-prep.html:
// red = over, amber = within 15% of the target, green = plenty left
const TONES = {
  none: { card: 'bg-slate-900/60 border-slate-700/50', text: 'text-slate-200', bar: 'bg-slate-500', icon: '' },
  over: { card: 'bg-rose-950/40 border-rose-800/60', text: 'text-rose-400', bar: 'bg-rose-500', icon: '▲' },
  close: { card: 'bg-amber-950/40 border-amber-800/60', text: 'text-amber-400', bar: 'bg-amber-500', icon: '⚠' },
  room: { card: 'bg-emerald-950/30 border-emerald-800/50', text: 'text-emerald-400', bar: 'bg-emerald-500', icon: '✓' }
};
function leftTone(left, target) {
  if (!target) return TONES.none;
  if (left < 0) return TONES.over;
  return left / target <= 0.15 ? TONES.close : TONES.room;
}

function leftCards(totals, targets) {
  return MACROS.map(([k, suffix, label]) => {
    const target = targets[k], left = target - totals[k];
    const { card, text, icon } = leftTone(left, target);
    return `
      <div class="p-3 rounded-lg border transition-colors duration-300 ${card}">
        <span class="block text-[11px] font-semibold text-slate-300/80 uppercase tracking-wider">${label} Left</span>
        <span class="text-lg font-bold ${text}">${icon ? `<span aria-hidden="true">${icon}</span> ` : ''}${left < 0 ? `${fmt(-left)} ${suffix} over` : `${fmt(left)} ${suffix}`}</span>
      </div>`;
  }).join('');
}

function markInvalid(el, invalid) {
  el.setAttribute('aria-invalid', invalid);
  el.classList.toggle('border-rose-500', invalid);
  el.classList.toggle('border-slate-700', !invalid);
}

const plural = (n, word, many = word + 's') => `${fmt1(n)} ${n === 1 ? word : many}`;

const planIsEmpty = () => allPlans().every(({ plan, n }) => plan.every(day => !dayPortions(day, n).length));

const emptyNote = text => `<p class="text-sm text-slate-400 italic text-center py-6 border border-dashed border-slate-700 rounded-lg">${text}</p>`;
