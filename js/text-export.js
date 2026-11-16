// text-export.js — Copy to clipboard, shopping lists (main shop + top-up), and the plain-text plan.

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => toast('Could not copy'));
}

const isShortLife = f => meta(f).shortLife === true;

// Grams of each food needed before the second prep day (early) and from it on (late).
// Batch boxes count for the session that cooks them; everything else for the day it's eaten.
function phaseGrams() {
  const { boxes } = storagePlan();
  const boxAt = boxesBySlot(boxes);
  const out = {};
  state.plan.forEach((day, d) => dayPortions(day).forEach(({ key, meal, size, flex }) => {
    const box = boxAt.get(`${d}|${key}`);
    slotItems(meal, size, flex).forEach(({ item, mode, grams }) => {
      const late = box && mode === 'ratio' ? box.session > 0 : d > state.prep.second;
      const g = out[item.foodId] = out[item.foodId] || { early: 0, late: 0 };
      g[late ? 'late' : 'early'] += grams;
    });
  }));
  return out;
}

// Two prep days split the list: the part of a short-life food only needed later moves to a mid-week top-up.
// Returns copies of the foods with each list's grams.
function shopLists() {
  const buy = state.foods.filter(f => f.grams > 0);
  const phase = state.prep.mode === 'two' ? phaseGrams() : {};
  const main = [], topUp = [];
  buy.forEach(f => {
    const have = Math.min(f.grams, haveOf(f));
    const p = phase[f.id];
    const split = state.prep.mode === 'two' && isShortLife(f) && p && p.late > 0;
    const early = split ? Math.min(f.grams, Math.ceil(p.early - 1e-9)) : f.grams;
    // What's at home covers the main shop first, then the top-up
    const earlyBuy = Math.max(0, early - have);
    const lateBuy = Math.max(0, f.grams - early - Math.max(0, have - early));
    if (earlyBuy > 0) main.push({ ...f, grams: earlyBuy, have });
    if (lateBuy > 0) topUp.push({ ...f, grams: lateBuy, have: earlyBuy > 0 ? 0 : have });
  });
  return { main, topUp };
}

// Grams of a food already at home (step 5)
const haveOf = f => Math.max(0, Number(state.stock[f.id]) || 0);

// Same "Name - 1,200g" lines as food-prep.html, grouped by aisle with what to pick up
function shoppingText() {
  const section = foods => byAisle(foods).map(([label, list]) =>
    `${label.replace(/^\S+\s/, '').toUpperCase()}\n` + list.map(f => {
      const b = buyInfo(f);
      return `${f.name} - ${fmt(f.grams)}g${b.text ? ` (${b.text})` : ''}`;
    }).join('\n')).join('\n\n');
  const { main, topUp } = shopLists();
  const shop = shopCost();
  const body = topUp.length
    ? `MAIN SHOP (before prep 1, Sunday)\n\n${section(main)}\n\nMID-WEEK TOP-UP (${DAYS[state.prep.second]}, before prep 2)\n\n${section(topUp)}`
    : section(main);
  const supps = state.supplements.map(x => {
    const weeks = weeksPerPack(x);
    return `${x.name} - ${doseText(x)} × ${dosesPerWeek(x)} this week${weeks != null ? ` (a pack lasts ≈ ${fmt1(weeks)} weeks)` : ''}${state.checked[`supp:${x.id}`] ? ' — need to rebuy' : ''}`;
  });
  return body + (shop.priced ? `\n\nEstimated shop: ${money(shop.total)}` : '') + (supps.length ? `\n\nSUPPLEMENTS\n${supps.join('\n')}` : '');
}

function mealPlanText() {
  const counts = mealCounts();
  const meals = state.meals.filter(m => counts[m.id]).map(m => {
    const s = servingsOf(m);
    const batch = s > 1 ? `, batch makes ${plural(s, 'portion')} (${plural(counts[m.id] / s, 'batch', 'batches')} needed)` : '';
    return `${m.name} — ${plural(counts[m.id], 'portion')} this week, ${fmt(portionTotals(m).cals)} kcal each${batch}`;
  });
  const { preps, boxes } = storagePlan();
  const boxAt = boxesBySlot(boxes);
  const evenings = eveningReminders(boxes);
  const where = b => b.place === 'freezer' ? 'freezer, thawed overnight' : b.place === 'over' ? `⚠ ${b.after} days after prep, doesn't freeze` : 'fridge';
  // Each prep session: what each batch is boxed into and where the boxes go
  const prepText = preps.map((_, i) => {
    const lines = boxGroups(boxes).filter(g => g.session === i).map(g => `  ${g.meal.name}: ${boxPlacesText(g.boxes)}`);
    return lines.length ? `${prepTitle(i, preps)}\n${lines.join('\n')}` : '';
  }).filter(Boolean);
  const portion = (m, size = 1, flex = {}) => `${m.name} (${plural(size, 'portion')}, ${fmt(slotTotals(m, size, flex).cals)} kcal)`;
  // Each meal's line, then what to weigh out (the box from the batch and where it's kept, plus extras)
  const detail = (m, size = 1, flex = {}, b = null) => {
    const { box, extras } = portionParts(m, size, flex);
    return (box ? `\n      - 1 box ≈ ${fmtWeight(box)} from the batch${b ? ` (${where(b)})` : ''}` : '') + extras.map(p => `\n      - ${box ? '+ ' : ''}${portionItemText(p)}`).join('');
  };
  const days = state.plan.map((day, d) => {
    const n = slot => { const m = mealById(day[slot]); return m ? portion(m, sizeOf(day, slot), flexOf(day, slot)) + detail(m, sizeOf(day, slot), flexOf(day, slot), boxAt.get(`${d}|${slot}`)) : '—'; };
    const snacks = day.snacks.map((id, i) => [mealById(id), i]).filter(([m]) => m).map(([m, i]) => `\n    ${portion(m)}${detail(m, 1, {}, boxAt.get(`${d}|snack${i}`))}`).join('') || ' —';
    const dt = dayTotals(day, d);
    const tonight = evenings[d].map(r => `\n  ${r}`).join('');
    return `${DAYS[d]} — ${fmt(dt.cals)} kcal (${macroLine(dt)})${mainSlots().map(([slot, label]) => `\n  ${label}: ${n(slot)}`).join('')}\n  Snacks:${snacks}${suppText(d)}${tonight}`;
  });
  return (meals.length ? `MEALS\n${meals.join('\n')}\n\n` : '') +
    (prepText.length ? `PREP & STORAGE\n${prepText.join('\n')}\n\n` : '') + days.join('\n\n');
}
