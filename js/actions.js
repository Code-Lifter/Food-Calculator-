// actions.js — Every button (actions) and select/checkbox (changeActions) handler, by data-action name.

const actions = {
  'undo': undo,
  'redo': redo,
  'set-unit': el => { state.stats.unit = el.dataset.value; commit(); },
  'set-gender': el => { state.stats.gender = el.dataset.value; commit(); },
  'set-goal': el => { state.stats.goal = el.dataset.value; commit(); },
  'set-speed': el => { if (SPEEDS[state.stats.goal]) state.stats[`${state.stats.goal}Speed`] = el.dataset.value; commit(); },
  'set-prep': el => {
    if (state.prep.mode === el.dataset.value) return;
    state.prep.mode = el.dataset.value === 'two' ? 'two' : 'freezer';
    commit();
    toast(planIsEmpty() ? 'Prep style set' : 'Prep style changed — re-run Auto-fill week to plan around it', { undoable: true });
  },
  'toggle-short-life': el => {
    const f = foodById(el.dataset.id);
    if (!f) return;
    f.shortLife = !isShortLife(f);
    commit();
  },
  'print-labels': () => {
    const html = labelsHtml();
    if (!html) { toast('No batch boxes this week — plan some batch meals first'); return; }
    $('labels-sheet').innerHTML = html;
    const mm = fitLabels($('labels-sheet').children.length);
    document.body.classList.add('printing-labels');
    toast(`${$('labels-sheet').children.length} labels at ${mm / 10} × ${mm / 10} cm — print at 100% scale (not “fit to page”)`);
    window.print();
  },
  // A view setting like raw/cooked, so it isn't an undo step. Whatever is typed is converted to the new unit.
  'set-energy-unit': el => {
    const to = el.dataset.value === 'kcal' ? 'kcal' : 'kJ';
    if (state.energyUnit === to) return;
    const input = $('ff-cals');
    const v = parseFloat(input.value);
    if (v > 0) input.value = Math.round((to === 'kJ' ? v * KJ_PER_KCAL : v / KJ_PER_KCAL) * 10) / 10;
    state.energyUnit = to;
    save();
    renderEnergyUnit();
    renderFormPreview();
  },
  'set-weight-mode': el => {
    state.weightMode = el.dataset.value;
    save();
    renderAll();
    toast(isCooked() ? 'Showing COOKED weights' : 'Showing raw weights');
  },
  'calculate': calculateTargets,
  'delete-food': el => {
    const f = foodById(el.dataset.id);
    if (!f) return;
    const users = mealsUsing(f.id);
    // First click on a food meals use shows who uses it; "Remove anyway" comes back here
    if (users.length && pendingDelete !== f.id) {
      pendingDelete = f.id;
      renderShopping();
      return;
    }
    pendingDelete = null;
    removeFoods([f.id]);
    commit();
    toast(users.length ? `Removed ${f.name} — ${users.length} meal${users.length === 1 ? '' : 's'} keep its calories` : `Removed ${f.name}`, { undoable: true });
  },
  'cancel-delete': () => {
    pendingDelete = null;
    renderShopping();
  },
  're-add-meal': el => {
    const m = mealById(el.dataset.id);
    if (!m) return;
    reAddFoods(missingFoods([m]));
    commit();
    toast('Back in your pantry', { undoable: true });
  },
  're-add-missing': () => {
    reAddFoods(missingFoods());
    commit();
    toast('Back in your pantry', { undoable: true });
  },
  'toast-undo': () => {
    // Only reverses the change the toast was about; anything newer goes through ↶ Undo
    if (toastUndoDepth >= 0 && toastUndoDepth === undoStack.length) undo();
    else toast("You've changed things since — use ↶ Undo at the top");
  },
  'add-ingredient': () => {
    if (!mbPicked) { toast('Search for a food and pick it from the list'); $('mb-search').focus(); return; }
    const [kind, ref] = mbPicked.split(':');
    const grams = parseFloat($('mb-grams').value);
    if (!(grams > 0)) { toast('Enter a weight in grams'); $('mb-grams').focus(); return; }
    let food = kind === 'food' ? foodById(ref) : null;
    if (!food) { mbPicked = null; toast('That food is no longer in your pantry — search again'); return; }
    // Typed weight is in the current mode; meals always store raw grams
    const raw = isCooked() ? grams / cookedFactorOf(food) : grams;
    const existing = draft.items.find(i => i.foodId === food.id);
    if (existing) existing.grams += raw;
    else draft.items.push({ foodId: food.id, grams: raw, snap: snapOf(food) });
    mbPicked = null;
    $('mb-search').value = '';
    renderMeals();
    $('mb-search').focus();
  },
  // Switching how an ingredient behaves keeps the amount per portion the same
  'draft-mode': el => {
    const i = draft.items[Number(el.dataset.idx)];
    const to = el.dataset.mode;
    if (!i || !ITEM_MODES[to] || modeOf(i) === to) return;
    const servings = draftServings();
    const perPortion = modeOf(i) === 'ratio' ? i.grams / servings : i.grams;
    i.mode = to;
    i.grams = to === 'ratio' ? perPortion * servings : perPortion;
    if (to === 'range') { i.min = 0; i.max = Math.max(5, Math.round(perPortion * 2)); }
    else { delete i.min; delete i.max; }
    renderMeals();
  },
  'remove-ingredient': el => {
    draft.items.splice(Number(el.dataset.idx), 1);
    renderMeals();
  },
  'save-meal': () => {
    const name = $('mb-name').value.trim();
    if (!name) { toast('Give your meal a name'); $('mb-name').focus(); return; }
    if (!draft.items.length) { toast('Add at least one ingredient'); return; }
    const types = draftTypes();
    if (!types.length) { toast('Tick at least one: breakfast, lunch, dinner or snack'); return; }
    const fridgeDays = Math.min(7, Math.max(1, Math.round(parseFloat($('mb-fridge').value)) || 3));
    const meal = { id: draft.id || uid(), name, type: types[0], types, servings: draftServings(), fridgeDays, freezes: $('mb-freezes').checked, prepAhead: $('mb-prep-ahead').checked, items: draft.items };
    const idx = state.meals.findIndex(m => m.id === meal.id);
    if (idx >= 0) state.meals[idx] = meal; else state.meals.push(meal);
    actions['reset-draft']();
    $('meal-modal').close();
    commit();
    toast(`Saved ${name}`);
  },
  // A half-built new meal is kept between openings; an unfinished edit is not
  'open-meal': () => {
    if (draft.id) actions['reset-draft']();
    openMealModal();
  },
  'close-meal': () => $('meal-modal').close(),
  // −/+ beside a number box: steps it within its min/max, then fires 'input' so the usual listeners run
  'step-input': el => {
    const input = $(el.dataset.target);
    const min = input.min !== '' ? Number(input.min) : -Infinity, max = input.max !== '' ? Number(input.max) : Infinity;
    const now = Math.round(parseFloat(input.value)) || 0;
    input.value = Math.min(max, Math.max(min, now + Number(el.dataset.step)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  },
  // Fewer meals a day empties the slots that go away (one undo step brings them back)
  'set-meals-per-day': el => {
    const n = Number(el.dataset.value);
    if (n === state.mealsPerDay) return;
    const keep = new Set(mainSlots(n).map(([slot]) => slot));
    let removed = 0;
    state.plan.forEach(day => MAIN_SLOTS.forEach(([slot]) => {
      if (keep.has(slot)) return;
      if (day[slot]) removed++;
      day[slot] = '';
      delete day.sizes[slot];
      delete day.flex[slot];
    }));
    state.mealsPerDay = n;
    commit();
    toast(`${n} meals a day${removed ? ` — took ${plural(removed, 'meal')} off the week` : ''}`, { undoable: removed > 0 });
  },
  'open-food': () => openFoodModal(),
  'edit-food': el => { const f = foodById(el.dataset.id); if (f) openFoodModal(f, el.dataset.focus); },
  'open-supp': () => openSuppModal(),
  'edit-supp': el => { const x = state.supplements.find(y => y.id === el.dataset.id); if (x) openSuppModal(x); },
  'close-supp': () => $('supp-modal').close(),
  'delete-supp': el => {
    const x = state.supplements.find(y => y.id === el.dataset.id);
    if (!x) return;
    state.supplements = state.supplements.filter(y => y !== x);
    delete state.checked[`supp:${x.id}`];
    commit();
    toast(`Deleted ${x.name}`, { undoable: true });
  },
  // View-only, like the day picker: not saved, not an undo step
  'set-micro-view': el => { microView = el.dataset.value; renderSummary(); },
  'toggle-day-micros': el => {
    const d = Number(el.dataset.day);
    if (openMicroDays.has(d)) openMicroDays.delete(d); else openMicroDays.add(d);
    renderPlan();
  },
  'close-food': () => $('food-modal').close(),
  'reset-draft': () => {
    draft = emptyDraft();
    mbPicked = null;
    $('mb-name').value = '';
    $('mb-search').value = '';
    $('mb-servings').value = 1;
    $('mb-fridge').value = 3;
    $('mb-freezes').checked = false;
    $('mb-prep-ahead').checked = false;
    setDraftTypes(['breakfast']);
    renderMeals();
  },
  'edit-meal': el => {
    const m = mealById(el.dataset.id);
    if (!m) return;
    draft = { id: m.id, items: m.items.map(i => ({ ...i })) };
    $('mb-name').value = m.name;
    setDraftTypes(typesOf(m));
    $('mb-servings').value = servingsOf(m);
    $('mb-fridge').value = fridgeDaysOf(m);
    $('mb-freezes').checked = freezesOf(m);
    $('mb-prep-ahead').checked = m.prepAhead === true;
    renderMeals();
    openMealModal();
  },
  'delete-meal': el => {
    const id = el.dataset.id;
    const meal = mealById(id);
    state.meals = state.meals.filter(m => m.id !== id);
    state.plan.forEach(day => {
      MAIN_SLOTS.forEach(([slot]) => {
        if (day[slot] !== id) return;
        day[slot] = '';
        delete day.sizes[slot];
        delete day.flex[slot];
      });
      day.snacks = day.snacks.filter(s => s !== id);
    });
    if (draft.id === id) draft.id = null;
    commit();
    toast(`Deleted ${meal ? meal.name : 'meal'}`, { undoable: true });
  },
  'remove-snack': el => {
    state.plan[el.dataset.day].snacks.splice(Number(el.dataset.idx), 1);
    commit();
  },
  'autofill': () => autoFill(),
  // 🎲 next to Auto-fill: the whole week laid out differently (see autoFill)
  'shuffle-week': () => autoFill({ shuffle: true }),
  // Two people: this slot on this day is each person's own meal (or back to the same meal for both,
  // in which case the other person gets the viewed person's meal on the next commit)
  'toggle-split': el => {
    const key = `${el.dataset.day}|${el.dataset.slot}`;
    const own = !state.split[key];
    if (own) state.split[key] = true; else delete state.split[key];
    commit();
    const label = (MAIN_SLOTS.find(([s]) => s === el.dataset.slot) || [, el.dataset.slot])[1].toLowerCase();
    toast(own
      ? `${DAYS[el.dataset.day]} ${label}: pick your own meals — changes here no longer change ${personName(1 - state.person)}'s`
      : `${DAYS[el.dataset.day]} ${label}: same meal for both again`, { undoable: true });
  },
  // 🎲 a different meal for one slot or snack (see rerollSlot)
  'reroll': el => rerollSlot(Number(el.dataset.day), el.dataset.slot, Number(el.dataset.idx) || 0),
  'stock-all': el => {
    const f = stockFood(el.dataset.id);
    if (!f) return;
    // Counted foods round up to whole ones (27 bananas, not 26.7)
    const u = countUnit(f);
    state.stock[f.id] = u ? Math.ceil(f.grams / u.grams - 0.05) * u.grams : f.grams;
    commit();
  },
  'clear-stock': () => {
    if (!Object.keys(state.stock).length) return;
    state.stock = {};
    commit();
    toast('Cleared what\'s at home', { undoable: true });
  },
  'reset-lean': () => {
    state.macroLean = { protein: 0, carbs: 0, fat: 0 };
    commit();
  },
  // Everyone's portions, each to their own targets
  'fit-portions': () => {
    const targets = everyone().map(i => withPerson(i, () => state.daily.cals));
    if (!targets.some(Boolean)) { toast('Set your daily calories in step 1 first'); return; }
    const sized = everyone().reduce((n, i) => n + withPerson(i, () => (state.daily.cals ? state.plan.filter((day, d) => fitMains(day, state.daily.cals, d)).length : 0)), 0);
    if (!sized) { toast('Pick some main meals for some days first'); return; }
    commit();
    const missing = everyone().filter(i => !targets[i]).map(personName);
    toast(twoPeople()
      ? `Portions sized for ${everyone().filter(i => targets[i]).map(i => `${personName(i)} (${fmt(targets[i])} kcal)`).join(' and ')}${missing.length ? ` — ${missing[0]} has no calorie target yet` : ''}`
      : `Portions sized to ${fmt(targets[0])} kcal a day`, { undoable: true });
  },
  'view-person': el => viewPerson(Number(el.dataset.person)),
  // One person ↔ two. The second person starts with the same main meals; going back to one keeps person 1.
  'set-people': el => {
    const n = Number(el.dataset.value);
    if (n === state.people.length) return;
    stashPerson();
    if (n === 2) {
      state.people.push(newPerson(''));
      commit();
      viewPerson(1);
      toast('Second person added — fill in their stats below', { undoable: true });
    } else {
      const gone = personName(1);
      loadPerson(0);
      state.people = [state.people[0]];
      fillInputs();
      commit();
      toast(`Back to one person — ${gone} removed`, { undoable: true });
    }
  },
  'view-day': el => {
    state.viewDay = Number(el.dataset.day);
    save();
    renderPlan();
  },
  'clear-slot': el => {
    const day = state.plan[el.dataset.day];
    day[el.dataset.slot] = '';
    delete day.sizes[el.dataset.slot];
    delete day.flex[el.dataset.slot];
    commit();
  },
  'same-as-yesterday': el => {
    const d = Number(el.dataset.day);
    state.plan[d] = cloneDay(state.plan[d - 1]);
    commit();
    toast(`${DAYS[d]} now matches ${DAYS[d - 1]}`);
  },
  'copy-to-weekdays': el => {
    const d = Number(el.dataset.day);
    for (let i = 0; i < 5; i++) if (i !== d) state.plan[i] = cloneDay(state.plan[d]);
    commit();
    toast(`Copied ${DAYS[d]} to every weekday`);
  },
  'clear-plan': () => {
    clearAllPlans();
    commit();
    toast('Week plan cleared', { undoable: true });
  },
  'copy-shopping': () => copyText(shoppingText(), 'Shopping list copied'),
  'copy-meals': () => copyText(mealPlanText(), 'Meal plan copied'),
  'share': () => { shareLink().catch(() => toast('Could not make a link')); },
  'dismiss-share': () => {
    incomingShare = null;
    renderShareBanner();
  },
  'load-share': () => {
    applyState(incomingShare.state);
    Object.assign(state, { tab: 'summary', viewDay: todayIndex() });
    incomingShare = null;
    draft = emptyDraft();
    fillInputs();
    renderShareBanner();
    commit();
    toast('Shared plan loaded', { undoable: true });
  },
  'add-share': () => {
    // A shared shopping list adds its foods to the pantry library (amounts come from your own plan)
    incomingShare.items.forEach(([name, , category, ...macros]) => {
      const food = { name: String(name), grams: 0, category };
      MACROS.forEach(([k], i) => { food[k] = Number(macros[i]) || 0; });
      if (!state.foods.some(f => f.name.toLowerCase() === food.name.toLowerCase())) state.foods.push({ id: idForNewFood(food.name), ...food });
    });
    incomingShare = null;
    renderShareBanner();
    state.tab = 'shopping';
    commit();
    toast('Shared foods added to your pantry', { undoable: true });
  },
  'print': () => {
    renderSummary();
    window.print();
  },
  'open-json': el => openJsonModal(el && el.dataset.focus),
  'example-load': loadExample,
  'example-add-foods': () => { addExampleFoods(); $('json-modal').close(); },
  'example-copy': () => copyText(exampleJson(), 'Example JSON copied'),
  'example-download': () => {
    const anchor = document.createElement('a');
    anchor.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(exampleJson());
    anchor.download = 'meal-planner-example.json';
    anchor.click();
  },
  'close-json': () => $('json-modal').close(),
  'copy-json': el => {
    const out = $('json-out');
    const done = () => { el.textContent = 'Copied ✓'; };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(out.value).then(done, () => { out.select(); document.execCommand('copy'); done(); });
    } else {
      out.select();
      document.execCommand('copy');
      done();
    }
  },
  'export': () => {
    const anchor = document.createElement('a');
    anchor.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state));
    anchor.download = 'meal-plan.json';
    anchor.click();
  },
  // The week is disposable; meals, foods and targets are kept
  'new-week': () => {
    clearAllPlans();
    state.checked = {};
    state.stock = {};
    state.viewDay = todayIndex();
    commit();
    toast('New week started — your meals and foods are kept', { undoable: true });
  },
  // Two clicks within 4 seconds, then an Undo toast
  'erase-all': () => {
    const btn = $('btn-erase');
    if (!eraseArmed) {
      eraseArmed = true;
      btn.textContent = 'Click again to erase everything';
      eraseTimer = setTimeout(() => { eraseArmed = false; btn.textContent = 'Erase everything'; }, 4000);
      return;
    }
    clearTimeout(eraseTimer);
    eraseArmed = false;
    btn.textContent = 'Erase everything';
    state = { ...defaultState(), tab: state.tab };
    draft = emptyDraft();
    fillInputs();
    commit();
    toast('Everything erased', { undoable: true });
  }
};

const changeActions = {
  'set-currency': el => {
    if (CURRENCIES[el.value]) state.currency = el.value;
    commit();
  },
  'set-prep-day': el => {
    const d = Number(el.value);
    if (Number.isInteger(d) && d >= 0 && d <= 5) state.prep.second = d;
    commit();
  },
  // Amounts are typed in the current raw/cooked mode; stored raw
  'draft-amount': el => {
    const i = draft.items[Number(el.dataset.idx)];
    const f = i && itemFood(i);
    if (!f) return;
    const raw = Math.max(0, parseFloat(el.value) || 0) / (isCooked() ? cookedFactorOf(f) : 1);
    if (el.dataset.field === 'grams') i.grams = raw;
    else {
      i[el.dataset.field] = raw;
      const [lo, hi] = [Number(i.min) || 0, Number(i.max) || 0];
      if (lo > hi) { i.min = hi; i.max = lo; } // typed the wrong way round
      i.grams = (Number(i.min) + Number(i.max)) / 2; // the default sits mid-range
    }
    renderMeals();
  },
  'set-slot': el => {
    const day = state.plan[el.dataset.day];
    day[el.dataset.slot] = el.value;
    delete day.sizes[el.dataset.slot];
    delete day.flex[el.dataset.slot];
    commit();
  },
  'set-size': el => {
    const day = state.plan[el.dataset.day];
    const size = Math.min(3, Math.max(0.25, parseFloat(el.value) || 1));
    if (size === 1) delete day.sizes[el.dataset.slot];
    else day.sizes[el.dataset.slot] = size;
    commit();
  },
  'add-snack': el => {
    const day = state.plan[el.dataset.day];
    if (el.value && day.snacks.length < MAX_SNACKS) day.snacks.push(el.value);
    commit();
  },
  'swap-day': el => {
    if (el.value === '') return;
    const a = Number(el.dataset.day), b = Number(el.value);
    [state.plan[a], state.plan[b]] = [state.plan[b], state.plan[a]];
    // "Own meal" marks travel with their day
    MAIN_SLOTS.forEach(([slot]) => {
      const ka = `${a}|${slot}`, kb = `${b}|${slot}`, wasA = state.split[ka], wasB = state.split[kb];
      if (wasB) state.split[ka] = true; else delete state.split[ka];
      if (wasA) state.split[kb] = true; else delete state.split[kb];
    });
    commit();
    toast(`Swapped ${DAYS[a]} and ${DAYS[b]}`);
  },
  'toggle-check': el => {
    state.checked[el.dataset.id] = el.checked;
    commit();
  },
  'set-lean': el => {
    if (!LEAN_MACROS.some(([k]) => k === el.dataset.lean)) return;
    state.macroLean[el.dataset.lean] = Math.min(0.2, Math.max(-0.2, (parseFloat(el.value) || 0) / 100));
    commit();
    toast('Macro balance saved. Hit Auto-fill or ⚖️ Fit portions to use it');
  },
  'set-rule': el => {
    const def = RULE_DEFS.find(d => d.key === el.dataset.rule);
    if (!def) return;
    const max = def.key === 'maxRepeats' ? 7 * MEALS_MAX : 21;
    const n = Math.round(parseFloat(el.value));
    state.rules[def.key] = Number.isFinite(n) ? Math.min(max, Math.max(def.key === 'maxRepeats' ? 1 : 0, n)) : DEFAULT_RULES[def.key];
    commit();
  }
};
