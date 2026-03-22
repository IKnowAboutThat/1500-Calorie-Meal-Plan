# Recipe Instructions In Shared Modal Implementation Plan

**Goal:** Show cooking instructions for each recipe in both the Recipes tab and the Planner tab by extending the existing shared recipe detail modal.

**Architecture:** Reuse the existing `openRecipeModal()` flow in the recipe library and planner. Normalize `instructions` once in the backend recipe payload, then render an Instructions section in the shared frontend modal.

**Tech Stack:** Flask + SQLite backend, vanilla JS SPA frontend, existing modal system in `app.js`, shared recipe cache in `app/js/recipe-cache.js`.

---

## Current State

- The recipe library already opens a shared detail modal from [`app/js/recipe-library.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-library.js).
- The planner already reuses that same modal when a recipe name is clicked in [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/meal-planner.js#L1022).
- Recipes already have an `instructions` field in the database and API write path.
- The main gap is that the shared detail modal does not currently render instructions.
- There is also a data-shape risk: `instructions` may still be a JSON string when returned from the backend.

---

## Implementation Strategy

### 1. Normalize `instructions` in the backend recipe model

**Files:**
- Modify: [`server/models/recipe.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/models/recipe.py)

**Why:**
- The backend stores `instructions` as text, often JSON-encoded.
- The frontend should not need to guess whether it received a string, JSON string, or array.
- Normalizing once in `_enrich_recipe()` keeps all consumers consistent, including the planner, recipe library, and any future clients.

**Implementation details:**
- In `_enrich_recipe()`, parse `recipe["instructions"]` before returning the recipe.
- Behavior rules:
  - If the value is a JSON array string, convert it to a Python list.
  - If it is `None` or empty, return `[]`.
  - If parsing fails, fall back to `[]` rather than leaking malformed data to the frontend.
  - If a legacy plain string exists that is not JSON, consider wrapping it as a one-item list only if you want to preserve older data; otherwise treat it as no structured instructions.

**Acceptance criteria:**
- `GET /api/recipes/` returns `instructions` as an array for every recipe.
- `GET /api/recipes/<id>` returns the same normalized shape.

---

### 2. Add a defensive frontend normalization fallback

**Files:**
- Modify: [`app/js/recipe-cache.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-cache.js)

**Why:**
- The backend should be the primary fix.
- The cache layer is still the right place for a small fallback so the UI remains stable during migration or if older API responses appear.

**Implementation details:**
- Add a small helper in `_normalize()` that guarantees `instructions` is always an array of strings and `description` is always a string or empty string.
- Suggested rules for `instructions`:
  - Array: keep it.
  - JSON string: parse it if possible.
  - Empty or invalid: use `[]`.
- Suggested rules for `description`:
  - String: keep it.
  - Null/undefined: use `''`.

**Acceptance criteria:**
- `getRecipes()` always returns recipe objects with `instructions: string[]` and `description: string`.
- The modal rendering code can assume stable types for both fields.

---

### 3. Render description and collapsible instructions in the shared recipe detail modal

**Files:**
- Modify: [`app/js/recipe-library.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-library.js)

**Why:**
- This is the one modal opened from both tabs.
- A single UI change here satisfies the feature in both the Recipes tab and the Planner tab.

**Implementation details:**

Extend `buildRecipeDetailHTML(recipe)` to add two new sections:

**A. Description intro** (between badges and macro bar):
- Render `recipe.description` as an italic paragraph below the badge row and above the macro bar.
- If `description` is empty or missing, omit the section entirely (do not show a placeholder).

**B. Collapsible instructions** (between ingredients table and tags):
- Render a clickable toggle button: `▶ Instructions (N steps)` showing the step count.
- Default state: **collapsed** (instructions hidden on modal open).
- Clicking the toggle expands/collapses an ordered list of steps.
- Each step is rendered with a numbered green circle indicator (var(--color-primary)) and the step text.
- Escape all step text with the existing `escapeHTML()`.
- Empty-state behavior:
  - If `instructions` is an empty array, show the toggle label as just “Instructions” (no step count) with a muted message: “No cooking instructions available for this recipe.”
  - This keeps the section visible so users know the field exists.

**UI notes:**
- Keep recipe cards compact; do not put full instructions directly into planner grid cards.
- Clicking the recipe should remain the entry point for full instructions.

**Acceptance criteria:**
- In the Recipes tab, clicking a recipe card shows description intro and collapsible instructions.
- In the Planner tab, clicking a planned recipe name shows the same description and instructions.
- Instructions default to collapsed and expand/collapse on click.
- The modal still supports scaling, favorites, and tags without regression.

---

### 4. Add modal styling for description and collapsible instructions

**Files:**
- Modify: [`app/css/styles.css`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/css/styles.css)

**Why:**
- The modal already has ingredient table styling, but description and instructions need their own styling to match the Sage Garden theme.

**Implementation details:**

Add styles near the existing `.recipe-detail__ingredients` section:

**A. Description styles:**
```css
.recipe-detail__description {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  font-style: italic;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  line-height: 1.6;
}
```

**B. Collapsible toggle:**
```css
.recipe-detail__instructions-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  background: none;
  border: none;
  padding: 0;
  margin-bottom: 0.75rem;
  width: 100%;
  text-align: left;
}

.recipe-detail__instructions-toggle .arrow {
  transition: transform 0.2s;
  font-size: 0.8rem;
}

.recipe-detail__instructions-toggle.open .arrow {
  transform: rotate(90deg);
}
```

**C. Numbered step list with green circle indicators:**
```css
.recipe-detail__instructions ol {
  list-style: none;
  counter-reset: step;
  padding: 0;
}

.recipe-detail__instructions li {
  counter-increment: step;
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  align-items: flex-start;
  font-size: 0.9rem;
  line-height: 1.5;
}

.recipe-detail__instructions li::before {
  content: counter(step);
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  background: var(--color-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 0.1rem;
}
```

**D. Empty state:**
```css
.recipe-detail__instructions-empty {
  color: var(--color-text-secondary);
  font-style: italic;
  font-size: 0.85rem;
  padding: 0.5rem 0;
}
```

**Acceptance criteria:**
- Step list uses green numbered circles matching the app's primary color.
- Collapse toggle arrow rotates smoothly on expand/collapse.
- Description renders as italic secondary text with a bottom border separator.
- Step lists remain readable on desktop and mobile.
- Long instructions do not break modal layout.
- Modal scrolling still works normally.

---

### 5. Verify add-recipe flow compatibility

**Files to inspect/verify:**
- [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)
- [`server/routes/recipes.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/recipes.py)

**Why:**
- The add-recipe preview already shows instructions.
- The save path already serializes instructions.
- This feature should not change that flow, but it should be verified after backend normalization changes.

**Verification points:**
- Newly added recipes still save with instructions intact.
- The same newly added recipe shows instructions in the shared detail modal after cache reload.

---

### 6. Add focused regression checks

**Suggested checks:**

1. Recipe tab modal — with description and instructions:
- Open a recipe that has both a description and instructions.
- Confirm description appears as italic text below badges and above macros.
- Confirm instructions toggle is visible and collapsed by default.
- Click toggle — confirm steps expand with numbered green circles.
- Click toggle again — confirm steps collapse.

2. Planner tab modal:
- Assign a recipe to a slot.
- Click the recipe name.
- Confirm the same description and collapsible instructions appear.

3. No-instructions recipe:
- Open a recipe with no steps.
- Confirm the toggle shows "Instructions" (no step count) and "No cooking instructions available" message.

4. No-description recipe:
- Open a recipe without a description.
- Confirm the description section is omitted entirely (no placeholder or empty space).

5. Scale controls:
- Open a recipe modal and change scale.
- Confirm ingredients and macros update as before.
- Confirm instructions remain visible and unchanged.

6. Favorites and tags:
- Toggle favorite and add/remove a tag from the modal.
- Confirm no modal interaction regressions.

---

## Recommended Order Of Work

1. Normalize `instructions` in [`server/models/recipe.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/models/recipe.py).
2. Add the frontend fallback in [`app/js/recipe-cache.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-cache.js).
3. Update the shared modal in [`app/js/recipe-library.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-library.js).
4. Add CSS in [`app/css/styles.css`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/css/styles.css).
5. Run manual verification from both tabs.

---

## Constraints

- Do not duplicate recipe-detail UI separately for Recipes and Planner.
- Do not expand instructions inline inside planner grid cards.
- Keep the change additive and local to the shared modal flow.
- Preserve existing modal behaviors: scaling, favorites, tags, and close interactions.

---

## Expected Outcome

After implementation, the shared recipe detail modal shows a description intro and collapsible cooking instructions regardless of whether the user opens a recipe from the Recipes tab or from the Planner tab. Instructions default to collapsed for a compact view and expand on click with numbered green circle step indicators. The data contract becomes more reliable because both `instructions` and `description` are normalized before reaching the frontend.

**Design reference:** See mockup at `.superpowers/brainstorm/32752-1773795425/instructions-mockup-v2.html` for the approved visual design.
