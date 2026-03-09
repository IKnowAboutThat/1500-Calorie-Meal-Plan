# Split Seasoning Blends Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split compound seasoning-blend ingredients (e.g., "Garlic, ginger, cilantro" at 12g) into individual ingredient rows in `recipe_ingredients`, and support sub-recipe sections (e.g., "Chimichurri Sauce") in the ingredient display.

**Architecture:** Add a `section` column to `recipe_ingredients` for sub-recipe grouping. Write a migration script that classifies comma-containing ingredient names as blends vs qualified singles, splits blends equally by weight, reuses or creates individual ingredient rows, and cleans up orphaned blend entries. Update backend API and frontend rendering to group ingredients by section.

**Tech Stack:** Python/SQLite (migration + schema), Flask (API), vanilla JS (frontend)

---

### Task 1: Add `section` column to `recipe_ingredients`

**Files:**
- Modify: `server/db.py:47-54`

**Step 1: Add column to schema**

In `db.py`, update the `recipe_ingredients` CREATE TABLE to include `section`:

```sql
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    amount REAL NOT NULL,
    unit TEXT DEFAULT 'g',
    sort_order INTEGER DEFAULT 0,
    section TEXT
);
```

**Step 2: Add migration in `init_db`**

Since the table already exists, the CREATE TABLE IF NOT EXISTS won't alter it. Add an ALTER TABLE after the `executescript(SCHEMA_SQL)` call in `init_db()`:

```python
# Add section column if it doesn't exist (migration)
try:
    conn.execute("ALTER TABLE recipe_ingredients ADD COLUMN section TEXT")
    conn.commit()
except Exception:
    pass  # Column already exists
```

**Step 3: Verify by starting the server**

Run: `cd server && python -c "from db import init_db; init_db(); print('OK')"`
Expected: OK, no errors

**Step 4: Commit**

```bash
git add server/db.py
git commit -m "feat: add section column to recipe_ingredients for sub-recipe grouping"
```

---

### Task 2: Write the blend-splitting migration script

**Files:**
- Create: `server/split_blends.py`

**Step 1: Write the migration script**

The script must:

1. **Classify** comma-containing ingredients as blend vs qualified single using a qualifier safelist:
   - Patterns: `", cooked"`, `", roasted"`, `", shelled"`, `", sliced"`, `", raw"`, `", 93% lean"`, `", unsweetened"`, `", diced"`, `", chopped"`, `", ground"`, `", dried"`, `", fresh"`, `", frozen"`
   - Also safelist specific names: `"Bell pepper, roasted"`, `"Ground turkey, 93% lean"`, `"Turkey breast, roasted"`, `"Turkey breast, sliced"`, `"Chicken breast, cooked"`, `"Eggplant, roasted"`, `"Zucchini, roasted"`, `"Broccoli, roasted"`, `"Black beans, cooked"`, `"Brown rice, cooked"`, `"Chickpeas, cooked"`, `"Edamame, shelled"`, `"Green lentils, cooked"`, `"Red lentils, cooked"`, `"Quinoa, cooked"`, `"Shrimp, cooked"`, `"Diced tomato"`, `"Bell pepper shells (2 peppers, roasted + eaten)"`

2. **Handle the chimichurri special case**: ingredient name contains `:`. Split on colon — the part before becomes the `section` label, parts after the colon are the sub-ingredients. Clean up "(GF)" from the section name.

3. **For each blend ingredient**, for each recipe that uses it:
   - Get the total amount in grams
   - Parse the sub-ingredient names from the comma-separated blend name
   - Split amount equally: `per_item = total // count`, distribute remainder 1g each to first N items
   - For each sub-ingredient name:
     - Strip whitespace, normalize
     - Look up existing ingredient by case-insensitive name match
     - If not found, create a new ingredient row (with NULL USDA data — we'll backfill later)
     - Insert a new `recipe_ingredients` row with the split amount, same `sort_order` as original, and `section` if applicable
   - Delete the original `recipe_ingredients` row for the blend

4. **Clean up orphaned blend ingredients**: After processing all recipes, delete any ingredient that is no longer referenced by any `recipe_ingredients` row.

5. **Print a report**: blends processed, new ingredients created, orphans deleted, any errors.

Key implementation details:
- Strip "(GF)" and similar parenthetical notes from sub-ingredient names before lookup/creation
- Handle "herbs" as a generic ingredient (create as-is)
- Handle compound sub-items like "chili powder", "chili flakes", "red chili flakes", "lemon zest", "rice vinegar", "white wine vinegar", "onion powder", "Italian herbs", "sesame seeds", "pickled ginger", "toasted rice", "coconut milk", "kaffir lime leaf" — these should NOT be further split
- For the lemongrass entries with "light coconut milk 30ml" — strip the "30ml" quantity note
- Use a transaction for each recipe's blend split so partial failures don't corrupt data

**Step 2: Run the migration**

Run: `cd server && python split_blends.py`
Expected: Report showing blends split, ingredients created, orphans cleaned

**Step 3: Verify data integrity**

Run a verification query:
```python
python -c "
from db import get_connection
conn = get_connection()
# No more blend ingredients in recipe_ingredients
blends = conn.execute('''
    SELECT i.name FROM ingredients i
    JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
    WHERE i.name LIKE '%,%'
    AND i.name NOT LIKE '%, cooked' AND i.name NOT LIKE '%, roasted'
    AND i.name NOT LIKE '%, shelled' AND i.name NOT LIKE '%, sliced'
    AND i.name NOT LIKE '%, 93%% lean'
''').fetchall()
print(f'Remaining blends in recipes: {len(blends)}')
for b in blends:
    print(f'  {b[0]}')
conn.close()
"
```
Expected: `Remaining blends in recipes: 0`

**Step 4: Commit**

```bash
git add server/split_blends.py
git commit -m "feat: migration script to split seasoning blends into individual ingredients"
```

---

### Task 3: Update backend API to include `section` in ingredient data

**Files:**
- Modify: `server/models/recipe.py:51-59`

**Step 1: Add `section` to the SELECT query**

In `_enrich_recipe`, update the ingredient query:

```python
    ing_rows = conn.execute("""
        SELECT ri.amount, ri.unit, ri.sort_order, ri.section,
               i.id as ingredient_id, i.name, i.calories_per_100g,
               i.protein_per_100g, i.fat_per_100g, i.carbs_per_100g,
               i.fiber_per_100g, i.micronutrients, i.category
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order
    """, (recipe_id,)).fetchall()
```

No other backend changes needed — `dict(ir)` will automatically include the `section` key.

**Step 2: Verify API response includes section**

Run: `cd server && python -c "from models.recipe import get_all_recipes; r = get_all_recipes(); print([i.get('section') for r0 in r for i in r0['ingredients'] if i.get('section')][:5])"`
Expected: Shows section values for chimichurri recipe ingredients

**Step 3: Commit**

```bash
git add server/models/recipe.py
git commit -m "feat: include section field in recipe ingredient API response"
```

---

### Task 4: Update frontend to render ingredient sections

**Files:**
- Modify: `app/js/recipe-library.js:334-345`
- Modify: `app/js/recipe-scaling.js:101-147`

**Step 1: Update `buildRecipeDetailHTML` ingredient rendering**

Replace the simple `.map()` with section-aware grouping:

```javascript
  // Group ingredients by section
  let ingredientRows = '';
  let currentSection = null;
  for (const ing of recipe.ingredients) {
    if (ing.section !== currentSection) {
      currentSection = ing.section;
      if (currentSection) {
        ingredientRows += `
      <tr class="ingredient-section-header">
        <td colspan="5"><h4>${escapeHTML(currentSection)}</h4></td>
      </tr>`;
      }
    }
    ingredientRows += `
      <tr${ing.section ? ' class="ingredient-sub"' : ''}>
        <td>${escapeHTML(ing.name)}</td>
        <td>${ing.amount}${ing.unit}</td>
        <td>${ing.calories}</td>
        <td>${ing.protein}g</td>
        <td>${ing.fiber}g</td>
      </tr>`;
  }
```

**Step 2: Update `renderScaledIngredientTable` in recipe-scaling.js**

Apply the same section-grouping logic to the scaled table renderer.

**Step 3: Add minimal CSS for section headers**

In the existing stylesheet or inline: `.ingredient-section-header h4` should have no top margin, smaller font size, and the `.ingredient-sub` rows should have a slight left indent on the name cell.

**Step 4: Verify by opening the app and viewing a recipe that had a chimichurri blend**

**Step 5: Commit**

```bash
git add app/js/recipe-library.js app/js/recipe-scaling.js
git commit -m "feat: render ingredient sections with sub-recipe headings"
```

---

### Task 5: Backfill USDA data for newly created ingredients

**Files:**
- Existing: `server/backfill_usda.py`

**Step 1: Re-run the backfill script**

Run: `cd server && python backfill_usda.py`

This will pick up any new ingredients created during the blend split that don't have USDA data yet.

**Step 2: Review results and fix any bad matches**

**Step 3: Commit updated database**

No code changes needed — the script already exists.
