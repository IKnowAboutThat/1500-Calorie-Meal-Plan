# Adrenal Cocktail As Real Recipe Implementation Plan

**Goal:** Replace the hardcoded adrenal cocktail macro object with a real recipe selected by the user, and add a planner feature to apply that recipe to each day of the week as a supplemental planned item without using normal meal slots.

**Architecture:** Treat the adrenal cocktail as a normal recipe in the recipe system, but store it in each day’s meal plan as an `extras` entry rather than a regular slot assignment. Planner macros, auto-plan math, shopping list generation, and dashboard totals all read from the same plan data instead of a separate hardcoded cocktail object.

**Tech Stack:** Vanilla JS SPA frontend, Flask API + SQLite backend, existing weekly plan persistence via `meal_plans.plan_data`, localStorage-backed settings.

---

## Why This Approach

- A real recipe gives you one source of truth for ingredients, instructions, and macros.
- A planner-level `extras` concept avoids wasting a snack slot on something that is not really a meal.
- This keeps the planner UI clean while still making adrenal cocktails part of the plan.
- It removes the current split-brain design where count lives in settings but macros live in a hardcoded object.

---

## Current State

- The hardcoded adrenal cocktail lives in [`app/js/data/recipes.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/data/recipes.js).
- Planner math adds that hardcoded total directly in [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js).
- Auto-plan subtracts hardcoded adrenal calories/protein in [`app/js/auto-plan.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/auto-plan.js).
- Dashboard uses separate adrenal logging math in [`app/js/macro-dashboard.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/macro-dashboard.js).
- Shopping list currently only walks `dayPlan.slots` in [`app/js/shopping-list.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/shopping-list.js).

This means the app currently has a hardcoded adrenal-specific system spread across multiple modules.

---

## Target Product Behavior

### User-facing behavior

- The user can create or select a recipe to use as the adrenal cocktail.
- The user can configure:
  - which recipe is the adrenal cocktail
  - how many to add per day, default `2`
- In the planner, the user can click a button such as `Apply Adrenal Cocktails To Week`.
- That action adds the selected recipe to every day as a supplemental planned item.
- Those planned adrenal cocktails contribute to:
  - planner daily macros
  - weekly summary
  - auto-planner daily budget calculations
  - shopping list ingredients
  - dashboard totals
- They do not occupy regular meal slots.

### Non-goals for this phase

- No adherence tracking
- No “planned vs consumed” distinction
- No separate adrenal cocktail logging system
- No requirement to auto-apply to every newly created week yet

---

## Data Model Changes

### 1. Extend settings with adrenal recipe configuration

**Files:**
- Modify: [`app/js/store.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/store.js)

**Add to settings:**
- `adrenalRecipeId: number | null`
- `adrenalCountPerDay: number`

**Why:**
- The selected recipe and count are user preferences.
- This is the right replacement for the current `adrenalCocktailsPerDay` setting.

**Notes:**
- Migrate `adrenalCocktailsPerDay` forward into `adrenalCountPerDay` for compatibility.
- Keep defaults safe:
  - `adrenalRecipeId: null`
  - `adrenalCountPerDay: 2`

---

### 2. Extend the week plan shape with supplemental extras

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)
- Modify: any helpers that create empty plans in [`app/js/auto-plan.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/auto-plan.js) if duplicated

**New day shape:**

```js
days[key] = {
  date,
  phase,
  slots: [...],
  extras: []
}
```

**Recommended extra entry shape:**

```js
{
  kind: 'adrenal',
  recipeId: 123,
  count: 2
}
```

**Why:**
- `extras` gives you a general-purpose place for supplemental planned items.
- Using `kind: 'adrenal'` makes it easy to update or replace them without touching unrelated future extras.

**Migration strategy:**
- When loading older week plans that do not have `extras`, treat them as `extras: []`.

---

## UI Changes

### 3. Add adrenal cocktail controls to Settings

**Files:**
- Modify: [`app/js/settings.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/settings.js)

**New settings controls:**
- Recipe selector populated from recipes
- Count per day input

**Behavior:**
- Only show recipes appropriate for this use case, or show all recipes with a hint if you want to keep the implementation simple.
- If no adrenal recipe is selected, planner apply actions should be disabled or show an instructional toast.

**Recommended copy:**
- `Adrenal Cocktail Recipe`
- `Adrenal Cocktails Per Day`

**Why:**
- This makes the feature explicit and editable without hiding it in recipe data or planner internals.

---

### 4. Add planner actions to apply and remove adrenal cocktails

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)

**Add planner toolbar actions:**
- `Apply Adrenal Cocktails`
- `Remove Adrenal Cocktails`

**Behavior:**
- `Apply` should write one adrenal `extras` entry to each day using the selected recipe and configured count.
- If an adrenal extra already exists for a day, update it instead of duplicating it.
- `Remove` should remove only `kind: 'adrenal'` entries from each day.

**Why:**
- The user asked for a one-click week-level action like “add two adrenal cocktails a day to the plan.”
- Explicit apply/remove actions are simpler and safer than silently mutating all weeks.

---

### 5. Render adrenal extras in each planner day

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)
- Modify: [`app/css/styles.css`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/css/styles.css)

**Recommended UI:**
- Show a compact section below the normal meal slots, for example:
  - `Supplements`
  - `Adrenal Cocktail x2`
- Make the item clickable so it opens the same recipe detail modal.

**Do not:**
- Put adrenal cocktails into normal meal slots.
- Make them visually as large as normal planner cards.

**Why:**
- They should be visible in the plan because they affect totals.
- They should not visually compete with actual meal assignments.

---

## Logic Changes

### 6. Replace hardcoded adrenal macro math in planner with `extras` aggregation

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)

**Current problem:**
- `computeDayMacros()` adds hardcoded `adrenalCocktail.totalCalories` and `totalProtein`.

**New behavior:**
- Sum recipe macros from:
  - regular `slots`
  - `extras`
- For each extra:
  - resolve the recipe by `recipeId`
  - multiply by `count`

**Why:**
- Planner totals should come from the actual planned data, not a global special case.

---

### 7. Update auto-planner to budget around planned adrenal extras

**Files:**
- Modify: [`app/js/auto-plan.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/auto-plan.js)

**Current problem:**
- Auto-plan subtracts hardcoded adrenal calories/protein before filling meal slots.

**New behavior:**
- Read the day’s `extras` and include them in the “already planned” macro totals.
- If the feature is applied before auto-plan runs, the slot-filling algorithm automatically works around the configured adrenal recipe.

**Recommended behavior:**
- Do not let auto-plan itself create adrenal extras yet.
- Keep apply/remove as explicit user actions for phase 1.

**Why:**
- This keeps auto-plan simple and deterministic.
- It avoids hidden mutation based on settings alone.

---

### 8. Update shopping list generation to include extras

**Files:**
- Modify: [`app/js/shopping-list.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/shopping-list.js)

**Current problem:**
- Shopping list only collects recipes from `dayPlan.slots`.

**New behavior:**
- Include recipe IDs from both:
  - `dayPlan.slots`
  - `dayPlan.extras`
- Multiply ingredient amounts by `count` for extras.

**Why:**
- If the adrenal cocktail is a real recipe, it should affect what the user buys.

**Implementation note:**
- The current shopping list deduplicates recipe IDs and separately keeps a `recipeIdList`.
- For extras, you need quantity-aware aggregation rather than only unique recipe IDs.
- The cleaner solution is to aggregate “recipe instances” with a multiplier, not just IDs.

---

### 9. Update dashboard totals to include planned extras instead of the old adrenal log special case

**Files:**
- Modify: [`app/js/macro-dashboard.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/macro-dashboard.js)
- Modify: [`app/js/store.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/store.js) only if removing old adrenal log helpers now

**Current problem:**
- Dashboard uses a separate adrenal log and the hardcoded adrenal macro object.

**New behavior for this phase:**
- Dashboard should reflect the actual planned extras from the current week plan.
- Remove adrenal log-driven macro contribution from totals.

**Product decision:**
- Since you explicitly do not want adherence tracking, the dashboard should align with the plan rather than a consumed log.

**Why:**
- This removes a now-unnecessary parallel system.

---

## Recipe System Considerations

### 10. Define how a recipe becomes an adrenal cocktail candidate

**Files to consider:**
- [`app/js/settings.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/settings.js)
- Optional future tagging improvements elsewhere

**Options:**

**Option A: allow any recipe**
- Simplest to implement
- Risk: the user can accidentally select a full meal recipe

**Option B: restrict to snack recipes**
- Easy to implement if you trust `mealType`
- Still not semantically perfect

**Option C: add a dedicated tag like `adrenal-cocktail`**
- Best data model
- More setup work

**Recommendation for phase 1:**
- Allow any recipe, but sort snack recipes first or add helper text.
- If this becomes noisy later, add a dedicated tag filter.

---

## Plan Mutation Helpers

### 11. Add explicit helpers for adrenal extras

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)

**Suggested helpers:**
- `normalizeDayExtras(dayPlan)`
- `getAdrenalExtra(dayPlan)`
- `setAdrenalExtra(dayPlan, recipeId, count)`
- `removeAdrenalExtra(dayPlan)`
- `applyAdrenalToWeek(plan, recipeId, count)`
- `removeAdrenalFromWeek(plan)`

**Why:**
- This prevents adrenal-specific logic from being scattered across click handlers and render functions.

---

## Migration And Compatibility

### 12. Keep old saved plans working

**Files:**
- Modify: [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)
- Modify: [`app/js/auto-plan.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/auto-plan.js)
- Modify: [`app/js/shopping-list.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/shopping-list.js)
- Modify: [`app/js/macro-dashboard.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/macro-dashboard.js)

**Compatibility rules:**
- Missing `extras` means `[]`
- Missing adrenal settings means:
  - `adrenalRecipeId = null`
  - `adrenalCountPerDay = 2`
- Old plans should render unchanged until the user explicitly applies adrenal cocktails

---

## Removal Of Old Special-Case Code

### 13. Retire the hardcoded adrenal cocktail object

**Files:**
- Modify: [`app/js/data/recipes.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/data/recipes.js)
- Modify import sites in:
  - [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js)
  - [`app/js/auto-plan.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/auto-plan.js)
  - [`app/js/macro-dashboard.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/macro-dashboard.js)
  - [`app/js/app.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/app.js) if still referenced

**Why:**
- Once the recipe-based extras system is in place, the hardcoded object becomes a bug magnet.

**Recommended timing:**
- Remove it in the same implementation, not later.

---

## Verification Checklist

### Core workflow

1. Create or select a recipe to use as adrenal cocktail.
2. Save it in Settings as the adrenal recipe and set count to `2`.
3. Open Planner and click `Apply Adrenal Cocktails`.
4. Confirm each day now shows `Adrenal Cocktail x2` in the extras area.

### Planner math

5. Confirm daily planner macros increase by `2 * recipe macros`.
6. Confirm weekly summary reflects the added extras.

### Modal behavior

7. Click the adrenal cocktail extra in the planner.
8. Confirm the shared recipe detail modal opens with ingredients and instructions.

### Auto-plan behavior

9. Apply adrenal cocktails to a week, then run auto-plan.
10. Confirm meal slots are filled around the reduced available calorie/protein budget.

### Shopping list behavior

11. Generate the shopping list for a week with adrenal extras applied.
12. Confirm adrenal ingredients are included with the correct multiplied quantities.

### Dashboard behavior

13. Open the dashboard for a week with adrenal extras.
14. Confirm totals reflect planned adrenal extras without needing separate logging.

### Compatibility

15. Open an older saved week with no `extras`.
16. Confirm the app does not crash and renders as before.

---

## Recommended Order Of Work

1. Extend settings in [`app/js/store.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/store.js).
2. Add settings UI in [`app/js/settings.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/settings.js).
3. Extend plan day shape with `extras` in planner and any duplicated empty-plan creators.
4. Add planner apply/remove actions and extras rendering in [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js).
5. Update planner macro aggregation.
6. Update auto-plan to include `extras` in existing-day macro totals.
7. Update shopping list aggregation to include extras with multipliers.
8. Update dashboard totals to use planned extras rather than hardcoded adrenal logging.
9. Remove the hardcoded adrenal cocktail object and old special-case imports.
10. Run manual regression verification.

---

## Key Constraints

- Do not put adrenal cocktails into normal meal slots.
- Do not add adherence tracking or consumed-vs-planned state.
- Keep the change additive to the plan structure via `extras`.
- Reuse the existing recipe system and shared modal instead of creating a separate adrenal editor.

---

## Expected Outcome

After implementation, the adrenal cocktail becomes a real recipe selected in Settings and applied to a week through an explicit planner action. It appears in the plan as a compact supplemental item, contributes to macros and shopping lists like any other recipe, and removes the need for the current hardcoded adrenal-specific macro logic.
