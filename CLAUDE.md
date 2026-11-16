# Weekly Meal Planner

Open `meal-planner.html` in a browser to run the app. It works straight from disk (`file://`): there is no build step, package.json or server.

```
meal-planner.html   page markup: tabs, panels, dialogs; loads everything below
css/styles.css      the few non-Tailwind styles (number inputs, print, box labels)
js/tailwind-config.js
js/*.js             the app, split by job (26 files, see "Code map")
```

## Stack
- Tailwind CSS from the CDN (`cdn.tailwindcss.com`), configured in `js/tailwind-config.js`. The brand colour is `brand` (#34d399). The theme is dark slate: `bg-slate-800` cards, `border-slate-700`.
- Vanilla JS in plain `<script src>` files (**not** ES modules, because modules don't load over `file://`). There is no framework; views are rebuilt with template strings into `innerHTML`.
- All files share one global scope, so a top-level `const`/`function` in one file is usable in every other file. **Load order matters** (it's the `<script>` list at the bottom of `meal-planner.html`): code that *runs* while a file loads, such as a `const` initialiser or a top-level statement, can only use what earlier files define. Functions can call anything, because they only run after `init.js`. New files go in that list; `init.js` stays last.
- Data is saved in `localStorage` under `STORAGE_KEY = 'weekly_meal_planner_v2'`. Keep the key stable, or saved data is lost.

## The five steps (tabs)
| Tab (`data-tab`) | Label | Renderer |
|---|---|---|
| `target` | 🎯 Targets | stats → BMR → daily calories/macros |
| `shopping` | 🥫 Single Food Pantry | `renderShopping()` — single ingredients, the basket, prices, ✏️ Edit, micronutrient chips |
| `meals` | 🍽️ Meals | `renderMeals()` — meal builder (🔗 ratio / 📌 fixed / ↕ range ingredients) |
| `plan` | 📅 Week | `renderPlan()` — 7-day plan, auto-fill, ⚖️ fit portions |
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
| `render-core.js` | status bar, tabs, step 1 render, prep-style switch |
| `picker.js` | `searchPicker` (type-to-filter food/meal picker) |
| `render-pantry.js` | step 2: `renderShopping`, `foodMicrosHtml` |
| `render-meals.js` | step 3: meal builder + meal cards (`renderMeals`) |
| `render-week.js` | step 4: rules card + `renderPlan` |
| `storage.js` | `cookingSessions`, `portionParts`, `isBatchMeal`, `storagePlan`, `eveningReminders`, `thawHtml`, `noThawNote` |
| `render-ready.js` | step 5: labels, storage/cooking/today/cost cards, `renderSummary` |
| `micro-display.js` | `microTone`, `microRows`, `microCard`, per-day nutrients |
| `food-form.js` | micronutrient inputs, `openFoodModal` |
| `supplements.js` | supplement maths, shopping lines, modal, `runMicroTests` |
| `app.js` | `renderAll`, `showTab`, undo/redo, `commit` |
| `edit.js` | `calculateTargets`, `addFood`, `removeFoods` |
| `autofill.js` | `autoFill`, `fitMains`, `balanceDay` (portion fitting) |
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
- Foods store nutrition **per 100 g**: `cals` (always kcal internally; kJ is display only), `protein`, `carbs`, `fat`, `fibre`, and optional `micros` ({ key: number }).
- A missing micronutrient key means **unknown, not zero**. `cleanMicros()` keeps only real numbers. The nutrient list is `NUTRIENTS`, grouped by `NUTRIENT_GROUPS`.
- Batch meals (`isBatchMeal`) are cooked on a prep day and boxed: either `servings > 1` with 🔗 ratio ingredients (only the ratio part goes in the box; extras are added on the day), or `prepAhead: true` (🍱 a one-portion recipe made for the whole week; the whole portion goes in the box). `storagePlan()` puts each box in the fridge, the freezer (after `fridgeDays`, if `freezes`) or flags it as 'over'.
- `locked: true` means 🔒 a fixed amount to buy; unlocked means 🔓 the amount is sized from the week plan.
- Weights are raw. Cooked mode converts using cooked factors (rice ×2.9, pasta ×2.2, chicken ×0.73).

## Micronutrient colours
`microRows(m, kcal, days)` → rows with `tone` from `microTone()`:
- Nutrients with a target: green at 90% of the target or more, yellow at 50–90%, red under 50%.
- Sodium: green ≤ 2,000 mg, yellow ≤ 2,300 mg, red above.
- Saturated fat: green ≤ 10% of energy, yellow ≤ 12%, red above.
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
There's no test suite. Open `meal-planner.html?test` to run the built-in maths checks (`runTargetTests`, `runMicroTests`; results go to the console). To check a change, load the page with Playwright (headless Chromium). Seed `localStorage['weekly_meal_planner_v2']` with a session JSON (`test-fixed.json` is a good one), then click through each tab and check for `pageerror` events; a `ReferenceError` on load usually means a file is in the wrong order. Stub the Tailwind CDN request if you're offline.
