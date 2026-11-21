// dislikes.js — Two people: foods and meals one of them won't eat (👎 on pantry and meal cards), and keeping them out of that person's week.

// Each person keeps their own list: state.people[i].dislikes = { foods: [ids], meals: [ids] }.
// A meal is off for someone if it's marked itself or has a food they've marked in it.
// Only used with two people: one person just doesn't plan what they don't eat.
const noDislikes = () => ({ foods: [], meals: [] });
const dislikesOf = i => (state.people[i] && state.people[i].dislikes) || noDislikes();
const hates = (i, kind, id) => twoPeople() && dislikesOf(i)[kind].includes(String(id)); // ids from saves can be numbers

// Why person i won't eat meal m: '' when they will, else the meal's name or the first food in it they don't eat
function wontEat(i, m) {
  if (!m || !twoPeople()) return '';
  if (hates(i, 'meals', m.id)) return m.name;
  const item = m.items.find(it => hates(i, 'foods', it.foodId));
  return item ? (itemFood(item) || {}).name || 'an ingredient' : '';
}
const eats = (i, m) => !wontEat(i, m);
// Who doesn't eat meal m (names), for warnings
const refusers = m => everyone().filter(i => !eats(i, m)).map(personName);

function toggleDislike(i, kind, id) {
  const p = state.people[i];
  if (!p || !['foods', 'meals'].includes(kind)) return false;
  p.dislikes = p.dislikes || noDislikes();
  const list = p.dislikes[kind];
  id = String(id);
  const on = !list.includes(id);
  if (on) list.push(id); else list.splice(list.indexOf(id), 1);
  return on;
}

// Takes out of everyone's week the main meals and snacks they won't eat. A shared main becomes their own
// (👤 Own) with the meal that best fits their day from those they do eat; a snack is swapped the same way,
// or dropped. Returns how many were changed. Run when a dislike is added and after auto-fill.
function swapOutDislikes() {
  if (!twoPeople()) return 0;
  let changed = 0;
  everyone().forEach(i => withPerson(i, () => {
    state.plan.forEach((day, d) => {
      let cur = day, touched = false;
      mainSlots().forEach(([slot]) => {
        if (!cur[slot] || eats(i, mealById(cur[slot]))) return;
        if (everyone().some(j => j !== i && slotsOf(j).includes(slot))) state.split[`${d}|${slot}`] = true;
        const best = bestFor(cur, d, slot);
        if (best) cur = best.day;
        else { cur = cloneDay(cur); cur[slot] = ''; delete cur.sizes[slot]; delete cur.flex[slot]; }
        changed++;
        touched = true;
      });
      for (let s = cur.snacks.length - 1; s >= 0; s--) {
        if (eats(i, mealById(cur.snacks[s]))) continue;
        const best = bestFor(cur, d, 'snack', s);
        if (best) cur = best.day; else { cur = cloneDay(cur); cur.snacks.splice(s, 1); }
        changed++;
        touched = true;
      }
      if (touched) {
        if (state.daily.cals) fitMains(cur, state.daily.cals, d);
        state.plan[d] = cur;
      }
    });
  }));
  return changed;
}

// --- Rendering ---
// 👎 one toggle per person on a food or meal card (two people only). Pressed = that person won't eat it.
function dislikeButtons(kind, id, name) {
  if (!twoPeople()) return '';
  return everyone().map(i => {
    const on = hates(i, kind, id);
    return `<button data-action="toggle-dislike" data-kind="${kind}" data-id="${id}" data-person="${i}" aria-pressed="${on}"
      title="${on ? `${esc(personName(i))} won't eat ${esc(name)}: it's kept out of their meals. Press to allow it again.` : `Press if ${esc(personName(i))} doesn't eat ${esc(name)}: auto-fill and 🎲 won't give it to them`}"
      class="chip transition-colors ${on ? 'chip-dislike' : 'chip-muted hover:text-slate-300'}">👎 ${esc(personName(i))}</button>`;
  }).join('');
}
// On a meal card: who won't eat it because of a food in it (marking the meal itself shows on its button)
function dislikeNote(m) {
  const why = everyone().filter(i => !hates(i, 'meals', m.id)).map(i => [i, wontEat(i, m)]).filter(([, w]) => w);
  return why.map(([i, w]) => `<span class="chip chip-dislike">🚫 ${esc(personName(i))} · no ${esc(w)}</span>`).join('');
}
// A short "· 👎 Sam" for meal pickers
const dislikeTag = m => { const who = refusers(m); return who.length ? ` · 👎 ${who.join(', ')}` : ''; };
