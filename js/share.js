// share.js — Share links: the plan or shopping list compressed into the URL hash.

// --- Share link: the plan (or just the shopping list) packed into the URL hash ---
const SHARE_MAX = 8000; // characters; long enough for most chat apps and browsers
let incomingShare = null; // decoded payload from the URL, until loaded or dismissed

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const streamBytes = async (bytes, transform) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());

// 'z' = deflate-compressed JSON, 'j' = plain JSON (browsers without CompressionStream)
async function encodeShare(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'undefined') return `j${toBase64Url(json)}`;
  return `z${toBase64Url(await streamBytes(json, new CompressionStream('deflate-raw')))}`;
}
async function decodeShare(code) {
  const bytes = fromBase64Url(code.slice(1));
  const json = code[0] === 'z' ? await streamBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(json));
}

// The whole plan, minus view settings, ticks and snapshots that loading rebuilds
function planPayload() {
  const s = JSON.parse(snapshot());
  delete s.checked;
  delete s.stock; // what's in your cupboard isn't theirs
  const ids = new Set(s.foods.map(f => f.id));
  s.meals.forEach(m => m.items.forEach(i => { if (ids.has(i.foodId)) delete i.snap; }));
  return { v: 1, kind: 'plan', state: s };
}
const shopPayload = () => ({
  v: 1, kind: 'shop',
  items: shopItems().map(f => [f.name, Math.round(f.grams), meta(f).category, ...MACROS.map(([k]) => f[k] || 0)])
});
// Main shop and top-up together, one row per food
function shopItems() {
  const { main, topUp } = shopLists();
  const byId = new Map();
  [...main, ...topUp].forEach(f => { const was = byId.get(f.id); byId.set(f.id, was ? { ...was, grams: was.grams + f.grams } : f); });
  return [...byId.values()];
}

async function shareLink() {
  const base = location.href.split('#')[0];
  let kind = 'plan';
  let url = `${base}#share=${await encodeShare(planPayload())}`;
  if (url.length > SHARE_MAX) {
    kind = 'shop';
    url = `${base}#share=${await encodeShare(shopPayload())}`;
  }
  const what = kind === 'plan' ? 'your whole plan' : 'your shopping list (the full plan is too big for a link)';
  $('share-out').innerHTML = `
    <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md space-y-2">
      <label for="share-url" class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Link to ${what}</label>
      <input id="share-url" readonly value="${esc(url)}" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 text-xs font-mono focus:outline-none focus:border-brand">
      <p class="text-xs text-slate-400">${fmt(url.length)} characters.${location.protocol === 'file:' ? ' This page is open from your computer, so the link only works for someone with the same file — host it online to share properly.' : ' Anyone with the link can open it; nothing is uploaded.'}</p>
    </div>`;
  $('share-url').addEventListener('focus', e => e.target.select());
  copyText(url, kind === 'plan' ? 'Link copied — whole plan' : 'Link copied — shopping list only');
}

// A share link in the URL: offer it, never overwrite anything without asking
async function readShareHash() {
  const m = location.hash.match(/^#share=([zj][A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.href.split('#')[0]);
  try {
    const data = await decodeShare(m[1]);
    const valid = data && data.v === 1 && (
      (data.kind === 'plan' && data.state && Array.isArray(data.state.foods) && Array.isArray(data.state.plan)) ||
      (data.kind === 'shop' && Array.isArray(data.items)));
    if (!valid) throw new Error('bad share');
    incomingShare = data;
  } catch (err) {
    incomingShare = null;
    toast('That share link is broken or incomplete');
  }
  renderShareBanner();
}

function renderShareBanner() {
  const data = incomingShare;
  if (!data) { $('share-banner').innerHTML = ''; return; }
  const actions = (primary, label) => `
    <div class="flex flex-wrap gap-2">
      <button data-action="${primary}" class="bg-brand hover:bg-emerald-300 text-slate-950 font-bold py-2 px-4 rounded-lg transition-colors">${label}</button>
      <button data-action="dismiss-share" class="bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 font-semibold py-2 px-4 rounded-lg transition-colors">Dismiss</button>
    </div>`;
  if (data.kind === 'plan') {
    const st = data.state;
    $('share-banner').innerHTML = `
      <div class="bg-slate-800 p-5 rounded-xl border border-emerald-700/60 shadow-md space-y-3">
        <h2 class="text-lg font-bold text-slate-100">📩 Someone shared a meal plan</h2>
        <p class="text-sm text-slate-300">${plural((st.meals || []).length, 'meal')} and ${plural(st.foods.length, 'food')}. Loading it replaces your current targets, meals, pantry and week — you can Undo straight after.</p>
        ${actions('load-share', 'Load this plan')}
      </div>`;
    return;
  }
  const foods = data.items.map(([name, grams, category]) => ({ name: String(name), grams: Math.max(0, Number(grams) || 0), category }));
  $('share-banner').innerHTML = `
    <div class="bg-slate-800 p-5 rounded-xl border border-emerald-700/60 shadow-md space-y-3">
      <h2 class="text-lg font-bold text-slate-100">📩 Shared shopping list</h2>
      ${byAisle(foods).map(([label, list]) => `
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">${label}</h3>
          <ul class="text-sm text-slate-200 divide-y divide-slate-700/60">
            ${list.map(f => { const b = buyInfo(f); return `<li class="py-1.5"><label class="flex items-center gap-3"><input type="checkbox" class="w-5 h-5 accent-emerald-400 shrink-0"><span><b>${esc(f.name)}</b> — ${b.text ? `${b.text} <span class="text-xs text-slate-400">(${fmt(f.grams)}g)</span>` : `${fmt(f.grams)}g`}</span></label></li>`; }).join('')}
          </ul>
        </div>`).join('')}
      ${actions('add-share', 'Add these foods to my pantry')}
    </div>`;
}
