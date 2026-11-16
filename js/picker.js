// picker.js — The searchable food/meal picker used in the meal builder and week plan.

// --- Searchable picker (foods or meals): type to filter, ↑/↓ + Enter or click to pick ---
// items() returns [{ name, cals, tag, value }]; every typed word must appear in the name,
// names starting with the query come first, otherwise items keep their given order.
// showAllOnEmpty lists everything while the box is empty (for picking from a short-ish list)
function searchPicker({ input, list, items, onPick, emptyText, showAllOnEmpty = false }) {
  let hits = [];
  let active = -1;

  const close = () => {
    hits = [];
    active = -1;
    list.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const highlight = () => {
    list.querySelectorAll('[data-hit]').forEach(li => {
      const on = Number(li.dataset.hit) === active;
      li.setAttribute('aria-selected', on);
      li.classList.toggle('bg-slate-700', on);
      li.classList.toggle('hover:bg-slate-800', !on);
      if (on) li.scrollIntoView({ block: 'nearest' });
    });
    if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-opt-${active}`);
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q && !showAllOnEmpty) { close(); return; }
    const words = q ? q.split(/\s+/) : [];
    hits = items()
      .map(it => ({ ...it, key: String(it.name).toLowerCase() }))
      .filter(h => words.every(w => h.key.includes(w)))
      .sort((a, b) => b.key.startsWith(q) - a.key.startsWith(q))
      .slice(0, 30);
    active = hits.length ? 0 : -1;
    list.innerHTML = hits.length
      ? hits.map((h, n) => `
          <li id="${list.id}-opt-${n}" role="option" data-hit="${n}" class="px-3 py-2 cursor-pointer flex items-center justify-between gap-3 text-sm">
            <span class="text-slate-100 truncate">${esc(h.name)}</span>
            <span class="text-xs text-slate-400 shrink-0">${h.tag ? `<span class="text-brand">${h.tag}</span> · ` : ''}${fmt1(Number(h.cals) || 0)} kcal</span>
          </li>`).join('')
      : `<li class="px-3 py-2 text-sm text-slate-400">${emptyText}</li>`;
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    highlight();
  };

  const pick = n => {
    const hit = hits[n];
    if (!hit) return;
    input.value = hit.name;
    close();
    onPick(hit);
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) { render(); return; }
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault(); // never submit a form from the search box
      if (hits.length) pick(active);
    } else if (e.key === 'Escape') {
      // First Escape closes the list; only the next one closes a modal around it
      if (!list.classList.contains('hidden')) e.preventDefault();
      close();
    }
  });
  // mousedown (not click) so picking happens before the input's blur closes the list
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('[data-hit]');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.hit));
  });
}
