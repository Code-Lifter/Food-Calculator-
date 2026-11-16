# Weekly Meal Planner

A meal planner that runs entirely in your browser: set your calorie and macro targets, build a pantry of single foods, turn them into meals, plan the week, and get a shopping list, a prep/cooking plan and freezer reminders.

## Use it

Download or clone the repo and open `meal-planner.html` in a browser. There's nothing to install and no server or build step. Your plan is saved in your browser (`localStorage`). To move it between devices, use the JSON export/import.

## The five steps

1. **🎯 Targets:** your stats → daily calories and macros.
2. **🥫 Single Food Pantry:** foods from their labels (per 100 g), with optional vitamins and minerals.
3. **🍽️ Meals:** recipes built from pantry foods (🔗 ratio / 📌 fixed / ↕ range ingredients), batch cooking and 🍱 make-ahead.
4. **📅 Week:** a 7-day plan, auto-fill and portion fitting to hit your targets.
5. **✅ Ready:** the shopping list, cooking plan, fridge/freezer boxes, 🌙 freezer → fridge reminders, and micronutrients (daily average / week total).

## Code

`meal-planner.html` holds the page layout. The app logic is split by job into `js/` (plain scripts, loaded in order), and `css/styles.css` holds the few custom styles. Styling uses Tailwind via CDN. See [CLAUDE.md](CLAUDE.md) for a full map of the code and its conventions.
