# Weekly Meal Planner

Open `index.html` in a browser to run the app. It works straight from disk (`file://`): there is no build step, package.json or server.

```
index.html          page markup: tabs, panels, dialogs; loads everything below
css/styles.css      the few non-Tailwind styles (number inputs, print, box labels)
js/tailwind-config.js
js/*.js             the app, split by job (26 files, see "Code map")
```

## Stack
- Tailwind CSS from the CDN (`cdn.tailwindcss.com`), configured in `js/tailwind-config.js`. The brand colour is `brand` (#34d399). The theme is dark slate: `bg-slate-800` cards, `border-slate-700`.
- Vanilla JS in plain `<script src>` files (**not** ES modules, because modules don't load over `file://`). There is no framework; views are rebuilt with template strings into `innerHTML`.
- All files share one global scope, so a top-level `const`/`function` in one file is usable in every other file. **Load order matters** (it's the `<script>` list at the bottom of `index.html`): code that *runs* while a file loads, such as a `const` initialiser or a top-level statement, can only use what earlier files define. Functions can call anything, because they only run after `init.js`. New files go in that list; `init.js` stays last.
- Data is saved in `localStorage` under `STORAGE_KEY = 'weekly_meal_planner_v2'`. Keep the key stable, or saved data is lost.

## The six steps (tabs)
| Tab (`data-tab`) | Label | Renderer |
|---|---|---|
| `target` | 🎯 Targets | stats → BMR → daily calories/macros |
| `shopping` | 🥫 Single Food Pantry | `renderShopping()` — a searchable library of single foods (per 100g, micronutrient chips, pack/price, ✏️ Edit). No buy amounts here |
| `meals` | 🍽️ Meals | `renderMeals()` — meal builder (🔗 ratio / 📌 fixed / ↕ range ingredients) |
| `plan` | 📅 Week | `renderPlan()` — 1–10 day plan, auto-fill, ⚖️ fit portions |
| `stock` | 🏠 At home | `renderStock()` — how much of each needed food is already in the house; comes off the shopping list |
| `summary` | ✅ Ready | `renderSummary()` — shopping list, `storageCard()`, cooking plan, Day by day (each day shows `thawHtml()` — that night's freezer → fridge moves as ticks in `state.checked['thaw:<day eaten>|<mealId>']`), `microCard()` |

The internal id `shopping` was kept when the tab was renamed to "Single Food Pantry". Don't rename the ids; share links and saved state use them.

## Code map (in load order; each file's first line says what it holds)
| File | What's in it |
|---|---|
| `constants.js` | days, meal slots/types, `MACROS`, `NUTRIENTS` + NRV targets, upper levels, supplement options |
| `target-maths.js` | BMR → activity → goal → calories/macros (`targetsFor`, `runTargetTests`) |
| `state.js` | aisles, tags, rule defaults, `defaultState()`, live variables (`state`, `draft`, undo stacks, view toggles) |
| `helpers.js` | `$`, `fmt`, `esc`, `load`/`applyState`/`save`, `normaliseFood`, `toast`, lookups, nutrition totals |
| `micros.js` | micronutrient totals, day/week averages, `microTargets`, `ulWarnings` |
| `rules.js` | food tags, weekly rules, `solveWeek`/`planWithRules` |
| `shopping.js` | `meta`, packs/prices, raw↔cooked, status colours, `plural`, `emptyNote` |
| `render-core.js` | status bar (incl. `sugarCell`), tabs, step 1 render, prep-style switch |
| `picker.js` | `searchPicker` (type-to-filter food/meal picker) |
| `render-pantry.js` | step 2: `renderShopping`, `foodMicrosHtml` |
| `render-meals.js` | step 3: meal builder + meal cards (`renderMeals`) |
| `people.js` | one or two people (`state.people`, viewed one = `state.person`): `stashPerson`/`loadPerson`/`withPerson(i, fn)`, `viewPerson`, `syncPartners` (mirrors main meals to the other person on every commit), `allPlans`, `allSupplements`, `renderPersonBar`, `renderPeople` |
| `render-stock.js` | step 5, At home: `renderStock` — what's already in the house per food (`state.stock`, grams; counted foods typed as a count via `countUnit`). Typing updates only its row (`updateStockRow`) so the cursor stays; `shopLists()` subtracts it (main shop first, then the top-up). Cleared by Start a New Week; left out of share links |
| `render-week.js` | step 4: rules card, `renderMacroLean` (Macro balance sliders → `state.macroLean`) + `renderPlan` |
| `storage.js` | `cookingSessions`, `portionParts`, `isBatchMeal`, `storagePlan`, `eveningReminders`, `thawHtml`, `noThawNote` |
| `render-ready.js` | step 6: labels, storage/cooking/today/cost cards, `renderSummary` |
| `micro-display.js` | `microTone`, `microRows`, `microCard`, per-day nutrients |
| `food-form.js` | micronutrient inputs, `openFoodModal` |
| `supplements.js` | supplement maths, shopping lines, modal, `runMicroTests` |
| `app.js` | `renderAll`, `showTab`, undo/redo, `commit` |
| `edit.js` | `calculateTargets`, `addFood`, `removeFoods` |
| `autofill.js` | `fitMains` (solves portion sizes + ↕ amounts for a day: linear model, coordinate descent, then rounding; calories weigh 30×; each macro aims at its target × (1 + `state.macroLean[k]`), the Week tab's Macro balance sliders, ±20%; outside ±`MACRO_RANGE` of the plain target a steep `RANGE_WEIGHT` cost pulls it back; protein over its aim counts lightly unless leaned down; `fitScore` uses `leanedDaily()`), `dayMiss`, `autoFill` → `improveWeek` (tries swapping meals/snacks, and adding up to 2 snacks, where that fits a day better), `rerollSlot` (🎲) |
| `text-export.js` | `copyText`, `shopLists`, `shoppingText`, `mealPlanText` |
| `share.js` | share links in the URL hash |
| `json-boxes.js` | JSON import/export boxes, modal openers |
| `actions.js` | `actions` (buttons) and `changeActions` (inputs) by `data-action` name |
| `events.js` | event wiring (clicks, inputs, keys, forms) |
| `init.js` | start-up; must stay last |

## How changes flow
- **Clicks:** `<button data-action="name" data-id=…>` → `actions[name](el)` (event delegation, buttons only). `<select>`/`<input>` changes go to `changeActions`.
- **State changes:** mutate `state`, then call `commit(group?)`. That refreshes the meal snapshots, re-sizes unlocked basket grams, records undo history (up to 50 steps), saves and runs `renderAll()`.
- **View-only toggles** (open tab, kJ/kcal, raw/cooked, `microView`, `microCardOpen`, `openMicroDays`) don't use `commit`. They set the variable and call that tab's render function, and they aren't part of undo.
- **Loading:** `load()` → `applyState()` normalises and migrates old saves (`normaliseFood`, `migrateStats`, …). Any new field needs a default there, so older saves still load.
- Escape any user text going into HTML with `esc()`.

## Data model notes
- **The plan isn't fixed to Monday–Sunday.** `state.week = { start, days }` (household-wide, set in step 1's Prep Week card): the plan starts on weekday `start` (Monday = 0) and runs `days` days (1–10). `DAYS` and `ALL_DAYS` are filled **in place** by `setWeekShape()` (called from `applyState` and `setWeek`), so loop with `DAYS.map`/`DAYS.length`, never 7. Day `d`'s real weekday is `weekdayOf(d)`; short names go through `dayShort(d)` (past day 7 names repeat: "Monday (2)", "Mon 2"); the prep day before the plan (d = −1) is `prepDayName()`. `todayIndex()` is −1 when today falls after a short plan. `setWeek()` (people.js) resizes everyone's plan by position and keeps every-day supplements every day.
- Foods store nutrition **per 100 g**: `cals` (always kcal internally; kJ is display only), `protein`, `carbs`, `fat`, `fibre`, and optional `micros` ({ key: number }).
- A missing micronutrient key means **unknown, not zero**. `cleanMicros()` keeps only real numbers. The nutrient list is `NUTRIENTS`, grouped by `NUTRIENT_GROUPS`.
- Batch meals (`isBatchMeal`) are cooked on a prep day and boxed: either `servings > 1` with 🔗 ratio ingredients (only the ratio part goes in the box; extras are added on the day), or `prepAhead: true` (🍱 a one-portion recipe made for the whole week; the whole portion goes in the box). `storagePlan()` puts each box in the fridge, the freezer (after `fridgeDays`, if `freezes`) or flags it as 'over'.
- The pantry is a library: foods are never auto-removed, and `f.grams` (what to buy) is always derived from the week plan by `syncDerivedGrams()` on every `commit`. There is no fixed/🔒 amount any more; `normaliseFood` deletes the old `locked` field from saves.
- Weights are raw. Cooked mode converts using cooked factors (rice ×2.9, pasta ×2.2, chicken ×0.73).

## Live targets (edit.js)
- There's no Calculate button. `commit()` calls `applyLiveTargets()`: while `state.stats.autoTargets` is true and the stats are complete and valid (`statsResult()`), `state.daily` is set from `targetsFor()` on every change. The Daily Targets boxes are refreshed unless one has focus.
- Typing in a Daily Targets box sets `autoTargets = false` (the person's own numbers). The `calculate` action ("↻ Use calculated targets") turns live back on.
- `renderLiveTargets()` shows the result (or what's missing or out of range) under the stats; `renderTargetsMode()` shows the chip on the Daily Targets heading.
- Old saves: live if their saved targets were empty or matched the stats; otherwise hand-typed and kept (`normalisePerson`).

## Built-in example (example-data.js)
- `EXAMPLE_SESSION` is a full session (123 foods, 26 meals, a week, 4 supplements) for a made-up person (80 kg, 180 cm, 30). It was generated from the test library with the stats replaced, meal snapshots stripped and `grams` zeroed. **Never put real stats in it**: it ships in the public repo, unlike `test.json`.
- It's opened from 📋 Examples on step 2 (`open-json` with `data-focus="examples"`) or from the JSON modal. `loadExample()` replaces everything (two-click confirm), then sizes the week to the live targets. `addExampleFoods()` merges by name: your foods and meals win, and example meals are re-pointed at your foods. Copy and download give the example as JSON.

## Shared UI pieces (css/styles.css)
- **Delete needs two clicks.** Put `data-confirm="Click again to delete"` on any `data-action` button: the click handler in `events.js` (`confirmClick`) arms it on the first click (red, shows that text, 4 s) and only runs the action on the second. Used by delete meal / supplement / unused food, Clear week and Clear at-home. A food that meals use shows its "used by" warning instead; Erase everything has its own older version.
- Edit and Delete are always `.btn-edit` (✏️) and `.btn-del` (🗑), bottom-right in a `.card-foot`.
- Food and meal cards share `.macro-tiles` (kcal / protein / carbs / fat), `.chip` (+ `chip-brand`, `chip-sky`, `chip-muted`) for facts, and `details.micro-fold` for anything folded away (a food's vitamins and minerals, the Week tab's how-it-works text).

## Ready tab folding and labels
- `readyFold()` runs at the end of `renderSummary()` and turns each top-level card in `#summary-content` into `<details class="ready-card">`: the heading row becomes the `<summary>`, and any buttons in it move into the body. The key is the heading text without its changing parts (`data-fold`). Folded keys live in `readyFolded`, saved to `localStorage['ready_folded']` (a per-browser view setting, not in state or undo). Printing opens every card (`beforeprint`, with `printOpening` so it isn't remembered), then `afterprint` restores the folds.
- Box labels: `fitLabels(n)` picks the biggest square, 50 mm down to 25 mm, that puts all n labels on one page (186 × 255 mm printable, 2 mm gaps). It sets `--label` and `--k` on `#labels-sheet`, and the CSS scales text and padding by `--k`. More than ~60 labels still spill onto a second page at 25 mm.

## Two people (people.js)
- `state.stats`, `daily`, `plan`, `macroLean` and `supplements` are always **the person being viewed** (`state.person`). `state.people[i]` holds each person's own copy plus `name`. `stashPerson()` copies the viewed person's fields back into `state.people`; it runs in `save()`, `snapshot()` and `syncPartners()`. Old one-person saves load as `people: [that person]`.
- To compute something for another person, wrap it: `withPerson(i, () => …)`. Inside, all the usual helpers (`dayTotals`, `fitMains`, `dayMiss`, `suppsOn`) work on that person.
- `mealsPerDay` is per person too (it's in `PERSON_KEYS`). Household loops use `allPlans()` → `{ who, plan, n }` and must call `dayPortions(day, n)`; `slotsOf(i)` gives a person's main slots.
- `state.split['<day>|<slot>'] = true` marks a slot where each person picks their own main meal (👥 Same / 👤 Own on the Week tab, action `toggle-split`). `syncPartners()` skips split slots and slots only one person has. Auto-fill, 🎲 Shuffle week, Clear and Start a New Week reset the splits.
- 🎲 Shuffle week = `autoFill({ shuffle: true })`: random noise (`SHUFFLE_NOISE`) on each meal's fit, then `improveWeek({ mains: 'rescue' })`, which only swaps mains on days still more than 3% off calories.
- **Main meals are shared, the rest is per person.** `commit()` calls `syncPartners()`: the other person's main slots are set to match the viewed person's, and any day that changed is re-fitted to their targets. Snacks, portion sizes, ↕ picks, macro balance and supplements are each person's own.
- Household totals go through `allPlans()`: `plannedGrams`, `mealCounts`, `storagePlan` (each box has `who`), `cookingSessions`, `phaseGrams`, and `allSupplements()` for supplement shopping/cost. `boxesBySlot(boxes, who = state.person)` gives one person's boxes.
- Auto-fill picks mains by the average `fitScore` across people, fills each person, then `improveWeek()` swaps a main only if both people's days together get better. ⚖️ Fit portions sizes everyone.
- Ready tab: Today and Day by day show a block per person; "week at a glance" and micronutrients show the viewed person; shopping, At home, cost, boxes, labels and cooking are combined.

## Micronutrient colours
`microRows(m, kcal, days)` → rows with `tone` from `microTone()`:
- Nutrients with a target: green at 90% of the target or more, yellow at 50–90%, red under 50%.
- Sodium: green ≤ 2,000 mg, yellow ≤ 2,300 mg, red above.
- Saturated fat: green ≤ 10% of energy, yellow ≤ 12%, red above.
- Sugars (total, as on labels): green ≤ 18% of energy (`SUGAR_PCT`, the UK/EU 90 g-on-2,000-kcal reference intake), yellow ≤ 22.5%, red above. Also the status bar's Sugar / day tile (`sugarCell`, grey "?" when under 70% of food has a sugars value).
- Above the upper level (`UL`, per day) is always red.

Targets are the NHMRC (Australia/NZ) Nutrient Reference Values, picked by sex and age band in `microTargets()`. The Ready-tab card has a Daily average / Week total pill (`microView`). The week total multiplies the amounts and the targets by the number of planned days.

## Conventions
- No dependencies beyond the Tailwind CDN, and no build step: the page must keep working when opened by double-clicking. Use classic scripts, not `import`/`export`.
- Put new code in the file whose job it fits; start a new file (and add it to the script list) rather than letting one grow past ~400 lines.
- Use Australian/UK spelling and units in the UI (fibre, AUD/GBP, kJ).
- Editor dialogs (Edit Meal, Edit Food) share one layout: `<dialog class="… open:flex flex-col overflow-hidden">` with a fixed header, a scrolling body split into titled sections, and a fixed footer (Cancel + primary save). Units sit inside inputs, not in labels. Chip/stepper/toggle styles (`.mb-chip`, `.mb-step`, `.mb-toggle`) are plain CSS in `css/styles.css`. Use `open:flex`, not `flex`, or the closed dialog shows.
- Layouts must work at phone width (tabs show shorter labels below `sm`/`md`).
- Comments explain *why*. Keep the existing tone: short, plain-English help text under controls.

## Testing
There's no test suite. Open `index.html?test` to run the built-in maths checks (`runTargetTests`, `runMicroTests`; results go to the console). To check a change, load the page with Playwright (headless Chromium). Seed `localStorage['weekly_meal_planner_v2']` with a session JSON (`test-fixed.json` is a good one), then click through each tab and check for `pageerror` events; a `ReferenceError` on load usually means a file is in the wrong order. Stub the Tailwind CDN request if you're offline.
