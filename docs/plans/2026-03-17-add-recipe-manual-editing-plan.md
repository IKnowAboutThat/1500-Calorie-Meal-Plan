# Add Recipe Manual Editing Implementation Plan

**Goal:** Turn the Add Recipe preview into a true recipe editor so the user can manually add, remove, and edit ingredients after AI parsing, preserve unresolved ingredients that USDA cannot match, and edit description and instructions before saving. Additionally, provide post-save recipe editing through both a quick-edit mode in the recipe detail modal and a full-page editor for structural changes.

**Architecture:** Keep AI parsing as the first draft generator, but treat the preview screen as a stateful editor backed by frontend draft state. The backend parse response should preserve both resolved and unresolved ingredients so the user can manually fix them before saving. Ingredient editing, instruction editing, and USDA resolution components are built as reusable modules shared between the add-recipe flow and the post-save edit-recipe flow.

**Tech Stack:** Flask API + SQLite backend, vanilla JS frontend, existing USDA lookup service, existing add-recipe page in `app/js/add-recipe.js`.

---

## Why This Change Is Needed

The current add-recipe flow breaks down in two places:

- If USDA lookup fails, the ingredient disappears from the editable ingredient list.
- Even for ingredients that do render, the current preview is not a real editor because `saveRecipe()` sends `state.parsedRecipe.ingredients` directly rather than rebuilding from edited rows.

There is also a similar limitation for instructions:

- Description is editable.
- Instructions are shown as static preview text, not editable fields.

This means the user cannot actually recover from imperfect AI parsing without rerunning the parse or editing outside the app.

---

## Target Product Behavior

After AI parse:

- All parsed ingredients remain visible, including unresolved ones.
- The user can:
  - edit ingredient name
  - edit amount
  - edit unit
  - remove an ingredient
  - add a new ingredient row
  - resolve an unresolved ingredient to a real ingredient record
- The user can:
  - edit description
  - edit instruction text
  - add instruction steps
  - remove instruction steps
- Save should only succeed when every ingredient row is resolvable to an `ingredient_id`, unless you explicitly decide to allow auto-creation of custom ingredient records during save.

After saving a recipe:

- The user can click "Edit" in the recipe detail modal for quick inline edits to name, description, cuisine, times, and other metadata fields.
- The user can click "Full Editor" to navigate to a dedicated `#edit-recipe/:id` page for structural changes: adding/removing ingredients, editing instructions step-by-step, resolving unmatched ingredients.
- Both editing surfaces use the same editing components as the add-recipe flow.
- Changes require an explicit "Save" button (no auto-save). "Cancel" discards unsaved changes.

---

## Recommended Product Strategy

### Phase 1

- Preserve unresolved ingredients in the preview.
- Make the preview a real editable draft.
- Add add/remove/edit controls for ingredients and instructions.
- Block save while any ingredient remains unresolved.

### Phase 2

- Add a guided “Resolve Ingredient” workflow.
- Allow searching existing ingredients.
- Optionally allow creating a custom ingredient with manual nutrition values.

This staged rollout gets the UX unstuck quickly without forcing you to solve custom ingredient nutrition authoring in the same change.

---

## Current State

### Frontend

**Files:**
- [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

Current behavior:

- Parse result is stored in `state.parsedRecipe`.
- Preview renders ingredient inputs and description input.
- Instructions are rendered as static `<ol>` content.
- Save reads a few top-level fields from DOM, but sends:
  - `instructions: recipe.instructions || []`
  - `ingredients: recipe.ingredients || []`

This means ingredient row edits and any future instruction edits are not persisted unless state is explicitly updated first.

### Backend

**Files:**
- [`server/routes/recipes.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/recipes.py)
- [`server/services/usda_lookup.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/services/usda_lookup.py)

Current behavior:

- Parse route calls Claude to get parsed ingredients.
- Each ingredient is expanded and matched through USDA.
- Ingredients that fail lookup go only into `lookup_errors`.
- Only resolved ingredients are returned in `ingredients`.

This forces the frontend to work with an already incomplete ingredient list.

---

## Implementation Strategy

### 1. Change parse response to preserve unresolved ingredients

**Files:**
- Modify: [`server/routes/recipes.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/recipes.py)

**Goal:**
- Return one unified ingredient draft array containing both resolved and unresolved items.

**Recommended response shape per ingredient:**

```json
{
  "name": "coconut yogurt",
  "amount": 50,
  "unit": "g",
  "section": null,
  "ingredient_id": 123,
  "resolved": true,
  "resolution_error": null,
  "calories": 30,
  "protein": 1.2,
  "fiber": 0,
  "calories_per_100g": 60,
  "protein_per_100g": 2.4,
  "fat_per_100g": 3,
  "carbs_per_100g": 5,
  "fiber_per_100g": 0
}
```

Unresolved example:

```json
{
  "name": "house spice blend",
  "amount": 8,
  "unit": "g",
  "section": null,
  "ingredient_id": null,
  "resolved": false,
  "resolution_error": "Could not find ingredient in USDA database"
}
```

**Why:**
- The frontend should not need to reconstruct dropped rows from `lookup_errors`.
- A unified ingredient array keeps the editing model straightforward.

**Implementation details:**
- For successful lookups, include the enriched ingredient row as today plus `resolved: true`.
- For failed lookups, include the original parsed ingredient row with:
  - `ingredient_id: null`
  - `resolved: false`
  - `resolution_error`
- Keep `lookup_errors` for display if useful, but make it secondary.

**Acceptance criteria:**
- Every parsed ingredient appears in the preview payload.
- Unmatched ingredients are preserved rather than discarded.

---

### 2. Refactor add-recipe state into an editable draft model

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Goal:**
- Replace “render parsed preview, then scrape a few fields on save” with a stateful draft editor.

**Recommended state shape:**

```js
state = {
  view: 'paste' | 'loading' | 'preview' | 'saving',
  parsedRecipe: null,
  draftRecipe: null,
  lookupErrors: [],
  imageData: null,
  imageType: null
}
```

Where `draftRecipe` contains:

```js
{
  name,
  description,
  servings,
  cuisine,
  meal_type,
  main_protein,
  prep_time_min,
  cook_time_min,
  phase,
  instructions: [],
  ingredients: []
}
```

**Why:**
- All preview edits should mutate one canonical draft object.
- Save should serialize from `draftRecipe`, not from stale parsed data.

**Implementation details:**
- After parse succeeds:
  - copy parse result into `state.draftRecipe`
- All preview controls should update `state.draftRecipe`
- Re-render preview from that state when needed

**Acceptance criteria:**
- Any edit the user makes in the preview survives re-render and is included in save payload.

---

### 3. Make description and top-level recipe fields fully draft-backed

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Goal:**
- Ensure existing editable top-level fields update draft state directly.

**Fields to bind to draft:**
- name
- description
- servings
- cuisine
- meal_type
- main_protein
- prep_time_min
- cook_time_min
- phase

**Why:**
- These already appear editable in the UI and should become first-class draft fields.

---

### 4. Replace static ingredient preview with a true editable ingredient editor

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**UI requirements:**
- Each ingredient row should support:
  - editable name
  - editable amount
  - editable unit
  - status display
  - remove button
- Add an `Add Ingredient` button below the table.

**Recommended row fields:**
- `name`
- `amount`
- `unit`
- `status`
- `actions`

**Status values:**
- `Resolved`
- `Needs match`

**Why:**
- This fixes the main workflow failure: user cannot recover from bad USDA matching.

**Behavior:**
- Removing a row deletes it from `draftRecipe.ingredients`
- Adding a row inserts a blank unresolved row:

```js
{
  name: '',
  amount: 0,
  unit: 'g',
  ingredient_id: null,
  resolved: false,
  resolution_error: null
}
```

**Important rule:**
- Editing the ingredient name should mark the row unresolved unless it is re-resolved.
- You should not silently keep an old `ingredient_id` attached to a changed ingredient name.

---

### 5. Add editable instructions UI

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Goal:**
- Let the user edit, add, and remove instruction steps before saving.

**Recommended UI:**
- Replace static ordered list with step editor rows:
  - step number
  - textarea or text input
  - remove button
- Add `Add Step` button below the list

**Recommended behavior:**
- Keep order based on array position.
- Optional later enhancement: move step up/down.

**Why:**
- AI-generated instructions often need cleanup or expansion.
- The user explicitly wants to add more instructions.

**Acceptance criteria:**
- User can edit existing steps.
- User can add new steps.
- User can remove unwanted steps.
- Saved recipe includes the edited instruction array.

---

### 6. Save from draft state, not stale parsed result

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Current problem:**
- Save uses `recipe.instructions || []` and `recipe.ingredients || []` from the parsed result.

**New behavior:**
- Save should serialize `state.draftRecipe`.

**Validation rules for phase 1:**
- Name is required
- At least one ingredient is required
- All ingredient rows must have:
  - non-empty name
  - positive amount
  - unit
  - `ingredient_id`

**Why require `ingredient_id` in phase 1:**
- Backend recipe creation currently requires valid ingredient IDs for all rows.
- This avoids partial-save ambiguity while still allowing full manual editing.

**Recommended user feedback:**
- If unresolved ingredients remain, show a blocking error like:
  - `Resolve or remove all unmatched ingredients before saving.`

---

### 7. Add ingredient resolution workflow

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)
- Modify: [`app/js/api.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/api.js)
- Modify: backend ingredient routes if needed

**Goal:**
- Let the user manually turn an unresolved draft row into a valid ingredient row with `ingredient_id`.

**Resolution flow (three-step fallback chain):**

When the user clicks “Resolve” on an unresolved ingredient row, open an inline panel or small modal with three options presented in order:

**Step A: Retry USDA with alternative search term**
- Show a text input pre-filled with the ingredient name.
- User edits it (e.g., “gf curry paste” → “curry paste”) and clicks “Search USDA”.
- Call the existing USDA lookup endpoint with the new search term.
- If results come back, show a list of matches with nutrition previews. User picks one.
- On selection: set `ingredient_id`, nutrition fields, mark `resolved: true`.

**Step B: Search existing ingredients in the local database**
- Show a text input with a “Search Local” button.
- Searches `/api/ingredients` for name matches already in the database.
- Show results with nutrition info. User picks one.
- On selection: same as above.

**Step C: Create custom ingredient with manual nutrition**
- If neither USDA retry nor local search finds a match, show a “Create Manually” option.
- Expand a form with fields:
  - ingredient name
  - calories/protein/fat/carbs/fiber per 100g
  - optional category
- On submit: call `POST /api/ingredients/` to create the record.
- Use returned `ingredient_id`, mark row resolved.

**Why this order:**
- USDA retry is the fastest path — the ingredient likely exists under a different name.
- Local DB search catches ingredients already resolved in previous recipes.
- Manual creation is the last resort for truly custom items.

**UX recommendation:**
- Show all three options in the panel at once (not a wizard), but visually lead with the USDA retry since it's the most common fix.
- The panel should be dismissible without resolving (user might want to just remove the row instead).

---

### 8. Add backend USDA retry endpoint

**Files:**
- Modify: [`server/routes/ingredients.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/ingredients.py)
- Uses: [`server/services/usda_lookup.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/services/usda_lookup.py)

**Goal:**
- Expose an endpoint that lets the frontend retry USDA lookup with a user-provided search term.

**Recommended new API:**
- `POST /api/ingredients/lookup`

**Request body:**

```json
{
  "search_term": "curry paste",
  "amount": 16,
  "unit": "g"
}
```

**Response (success):**

```json
{
  "found": true,
  "ingredient_id": 456,
  "name": "curry paste",
  "calories_per_100g": 94,
  "protein_per_100g": 2.1,
  "fat_per_100g": 3.5,
  "carbs_per_100g": 14,
  "fiber_per_100g": 1.2,
  "calories": 15,
  "protein": 0.3,
  "fiber": 0.2
}
```

**Response (not found):**

```json
{
  "found": false,
  "search_term": "curry paste",
  "error": "No USDA match found"
}
```

**Implementation details:**
- Reuse the existing `find_and_create_ingredient()` from `usda_lookup.py`.
- If the ingredient already exists in the local DB under that name, return it directly without hitting USDA.
- If found via USDA, create the ingredient record and return it.
- If not found, return `found: false` so the frontend can offer manual creation.

**Why:**
- This is the backend counterpart to Step A of the resolution flow.
- Reusing existing USDA lookup logic keeps the implementation simple.

---

### 9. Add backend support for manual ingredient creation

**Files:**
- Modify: [`server/models/ingredient.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/models/ingredient.py)
- Modify: [`server/routes/ingredients.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/ingredients.py)

**Goal:**
- Support true manual ingredient authoring from the add-recipe flow.

**Recommended new API:**
- `POST /api/ingredients/`

**Suggested request body:**

```json
{
  "name": "House Spice Blend",
  "calories_per_100g": 250,
  "protein_per_100g": 8,
  "fat_per_100g": 5,
  "carbs_per_100g": 40,
  "fiber_per_100g": 15,
  "category": "spice"
}
```

**Response:**
- Return created ingredient row with `id`

**Why:**
- This is the clean backend foundation for manual ingredient addition that still preserves recipe nutrition.

---

### 10. Recalculate preview nutrition from the editable draft

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Goal:**
- Keep totals accurate as the user edits ingredients.

**Behavior:**
- Recompute total and per-serving macros from resolved ingredient rows in `draftRecipe.ingredients`
- Unresolved rows should either:
  - contribute zero until resolved, or
  - show an “incomplete nutrition” warning

**Recommendation:**
- Show a warning if unresolved rows exist:
  - `Nutrition totals exclude 2 unresolved ingredients`

**Why:**
- This makes the preview honest and avoids false precision.

---

### 11. Improve warnings and user guidance

**Files:**
- Modify: [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js)

**Recommended UX improvements:**
- Replace the current generic lookup warnings card with per-row status in the ingredient editor
- Add a top-level warning summary when unresolved items exist
- Disable save when unresolved rows remain, with explanation

**Suggested copy:**
- `2 ingredients still need to be matched before this recipe can be saved.`

**Why:**
- The user should not need to infer why save is blocked or why nutrition looks incomplete.

---

### 12. Extract shared editing components

**Files:**
- Create: [`app/js/recipe-editor-components.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-editor-components.js)

**Goal:**
- Extract the ingredient editor, instruction editor, and resolution panel into reusable rendering functions so they can be shared between the add-recipe flow and the post-save edit-recipe flow.

**Exports:**

```js
// Ingredient editor table with add/remove/resolve controls
export function renderIngredientEditor(ingredients, options)

// Step-by-step instruction editor with add/remove/reorder
export function renderInstructionEditor(instructions, options)

// Resolution panel for unresolved ingredients (USDA retry, local search, manual create)
export function renderResolutionPanel(ingredient, options)

// Nutrition summary computed from ingredient list
export function renderNutritionSummary(ingredients, servings)

// Bind event handlers for all editor components within a container
export function attachEditorEvents(container, callbacks)
```

**Why:**
- The add-recipe preview and the edit-recipe page need identical editing capabilities.
- Extracting components avoids duplicating complex ingredient/instruction editing logic.
- Each function takes data + callbacks, returns HTML. The parent page owns state and persistence.

**Implementation details:**
- Move the ingredient table rendering from step 4, instruction editor from step 5, and resolution panel from step 7 into this module.
- Each render function is stateless — it takes the current data and returns HTML.
- The parent page (add-recipe or edit-recipe) manages draft state and calls re-render when data changes.
- `attachEditorEvents` takes a callbacks object like `{ onIngredientChange, onIngredientRemove, onIngredientAdd, onResolve, onInstructionChange, onInstructionRemove, onInstructionAdd }`.

---

### 13. Add inline edit mode to recipe detail modal

**Files:**
- Modify: [`app/js/recipe-library.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-library.js)

**Goal:**
- Add an "Edit" button to the existing recipe detail modal that switches metadata fields to editable inputs inline.

**Editable fields in modal edit mode:**
- name
- description (textarea)
- cuisine
- main_protein
- meal_type (select)
- phase (select)
- servings
- prep_time_min, cook_time_min, marinate_time_min

**Not editable in modal (too complex for modal space):**
- ingredients
- instructions

**UI behavior:**
- Default modal view: read-only (current behavior).
- Click "Edit": fields become editable inputs, "Edit" button becomes "Save" + "Cancel" buttons. A "Full Editor" link appears for ingredient/instruction editing.
- Click "Save": call `PUT /api/recipes/<id>` with changed fields, refresh modal, show success toast.
- Click "Cancel": revert to read-only view, discard changes.
- Click "Full Editor": close modal, navigate to `#edit-recipe/:id`.

**Why:**
- Quick metadata fixes (typo in name, wrong cuisine tag) should not require leaving the modal.
- Structural changes (ingredients, instructions) get the proper space of the full-page editor.

**Acceptance criteria:**
- User can edit and save metadata fields without leaving the modal.
- Changes persist to the backend and are reflected immediately.

---

### 14. Add full-page recipe editor

**Files:**
- Create: [`app/js/edit-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/edit-recipe.js)
- Modify: [`app/js/app.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/app.js) (add route for `#edit-recipe/:id`)
- Modify: [`app/js/api.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/api.js) (add `updateRecipeIngredients` if needed)

**Goal:**
- Full-page editor at `#edit-recipe/:id` for structural recipe changes: ingredients, instructions, and all metadata.

**Page layout:**
- Similar to the add-recipe preview layout but pre-populated from the existing recipe data loaded via `GET /api/recipes/<id>`.
- All metadata fields editable (same as modal but with more space).
- Ingredient editor from shared components (step 12): full add/remove/resolve capability.
- Instruction editor from shared components (step 12): step-by-step add/remove/reorder.
- Nutrition summary recalculated live as ingredients change.
- "Save" button and "Cancel" button (navigates back to `#recipes`).

**Draft state model:**
```js
{
  recipeId: number,
  name, description, servings, cuisine, meal_type, main_protein,
  prep_time_min, cook_time_min, marinate_time_min, phase,
  instructions: [],
  ingredients: []  // same shape as add-recipe draft ingredients
}
```

**Save behavior:**
- Same validation as add-recipe: all ingredients must be resolved.
- Call `PUT /api/recipes/<id>` for metadata fields.
- For ingredient changes: the backend needs to support replacing the full ingredient list for a recipe. This means:
  - Delete existing `recipe_ingredients` rows for this recipe.
  - Re-insert from the draft ingredient list.
  - This should be a single transaction.

**Backend changes needed:**
- Extend `PUT /api/recipes/<id>` to accept an optional `ingredients` array.
- When `ingredients` is present in the payload, replace recipe_ingredients rows.
- Each ingredient entry needs: `ingredient_id`, `amount`, `unit`, `sort_order`, `section`.

**Why:**
- The full-page editor gives proper space for the complex ingredient/instruction editing workflow.
- Reusing shared components from step 12 means the editing experience is identical to add-recipe.

**Acceptance criteria:**
- User can navigate to `#edit-recipe/:id` from the modal or directly.
- All recipe fields, ingredients, and instructions are editable.
- Ingredient resolution workflow (USDA retry, local search, manual create) works identically to add-recipe.
- Save persists all changes including ingredient list replacement.
- Cancel returns to recipe library without saving.

---

### 15. Extend backend PUT endpoint for full recipe updates

**Files:**
- Modify: [`server/routes/recipes.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/recipes.py)
- Modify: [`server/models/recipe.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/models/recipe.py)

**Goal:**
- Allow `PUT /api/recipes/<id>` to accept and replace the full ingredient list and instruction array.

**Extended request body (all fields optional):**

```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "instructions": ["Step 1", "Step 2"],
  "ingredients": [
    { "ingredient_id": 123, "amount": 150, "unit": "g", "sort_order": 0, "section": null },
    { "ingredient_id": 456, "amount": 30, "unit": "g", "sort_order": 1, "section": "Sauce" }
  ]
}
```

**Behavior when `ingredients` is present:**
- Begin transaction.
- Delete all existing `recipe_ingredients` rows for this recipe.
- Insert new rows from the provided array.
- Recalculate and update recipe-level macro totals.
- Commit transaction.

**Behavior when `ingredients` is absent:**
- Do not touch recipe_ingredients (backward compatible with current behavior).

**Why:**
- The edit-recipe page needs to persist structural ingredient changes.
- Keeping it optional means the modal quick-edit (metadata only) still works with a simpler payload.

---

## Verification Checklist

### Draft editing

1. Parse a recipe with all ingredients resolved.
2. Edit ingredient name, amount, and unit.
3. Edit description.
4. Edit instruction text and add a new step.
5. Save and confirm all changes persist.

### Unresolved ingredient preservation

6. Parse a recipe with one USDA-missing ingredient.
7. Confirm the ingredient still appears in the editor with `Needs match`.
8. Remove it and confirm save can proceed.

### Manual ingredient add/remove

9. Add a blank ingredient row manually.
10. Confirm it appears in the draft and can be removed.

### Resolution flow

11. Resolve an unresolved ingredient to an existing ingredient.
12. Confirm nutrition updates and save is allowed.

### Save validation

13. Leave one ingredient unresolved.
14. Confirm save is blocked with a clear message.

### Custom ingredient creation

15. Create a custom ingredient manually via the resolution panel.
16. Confirm it is saved, attached to the recipe, and contributes to totals.

### USDA retry

17. For an unresolved ingredient, type an alternative name and click "Search USDA".
18. Confirm USDA results appear and selecting one resolves the ingredient.
19. If USDA retry fails, confirm local search and manual creation are still available.

### Modal inline editing

20. Open recipe detail modal, click "Edit".
21. Change name, description, and cuisine. Click "Save".
22. Confirm changes persist and modal returns to read-only view.
23. Click "Cancel" during edit and confirm no changes are saved.

### Full-page editor

24. Click "Full Editor" from the modal. Confirm navigation to `#edit-recipe/:id`.
25. Edit ingredient amounts, add a new ingredient, remove one.
26. Edit instruction steps, add a new step, remove one.
27. Click "Save" and confirm all changes persist to the backend.
28. Re-open the recipe and verify edited ingredients, instructions, and metadata are correct.
29. Click "Cancel" and confirm no changes are saved.

### Ingredient list replacement

30. Edit a recipe's ingredients via the full-page editor.
31. Save and confirm `recipe_ingredients` rows are correctly replaced (no duplicates, correct amounts).
32. Confirm recipe macro totals are recalculated from the new ingredient list.

---

## Recommended Order Of Work

1. Change parse response in [`server/routes/recipes.py`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/server/routes/recipes.py) to preserve unresolved ingredients.
2. Add USDA retry endpoint `POST /api/ingredients/lookup` in backend.
3. Add manual ingredient creation endpoint `POST /api/ingredients/` in backend.
4. Refactor add-recipe page in [`app/js/add-recipe.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/add-recipe.js) to use `draftRecipe`.
5. Build ingredient editor, instruction editor, and resolution panel directly in add-recipe.
6. Make instructions editable with add/remove controls.
7. Save from `draftRecipe` with unresolved validation.
8. Add full resolution workflow (USDA retry → local search → manual creation).
9. Add nutrition recalculation and warning polish.
10. Extract shared editing components into [`app/js/recipe-editor-components.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-editor-components.js).
11. Add inline edit mode to recipe detail modal in [`app/js/recipe-library.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/app/js/recipe-library.js).
12. Extend backend `PUT /api/recipes/<id>` to support ingredient list replacement.
13. Build full-page editor at `#edit-recipe/:id` using shared components.
14. Manual regression verification across all flows.

---

## Key Constraints

- Do not silently drop unresolved ingredients after parse.
- Do not trust DOM inputs as the source of truth; use draft state.
- Do not allow edited ingredient names to keep stale `ingredient_id` mappings.
- Keep the first version pragmatic: editable draft plus resolution flow is more important than perfect inline nutrition UX.
- Editing components must be shared between add-recipe and edit-recipe — do not duplicate ingredient/instruction editor logic.
- Modal edit mode is for metadata only. Ingredient and instruction editing requires the full-page editor.
- Removing an ingredient from a recipe only unlinks it from the recipe_ingredients junction table. The ingredient record stays in the database for other recipes to use.
- All saves require an explicit "Save" button click. No auto-save.

---

## Expected Outcome

After implementation, the Add Recipe flow becomes resilient to imperfect AI parsing. Missing USDA matches no longer disappear, the user can retry USDA with alternative search terms, manually add/remove ingredients, and edit instructions. Save behavior reflects what the user actually edited rather than the original parse result.

Additionally, saved recipes become fully editable. Quick metadata changes happen inline in the recipe detail modal. Structural changes (ingredients, instructions) happen in a full-page editor that shares the same editing components as the add-recipe flow. The resolution workflow (USDA retry → local search → manual creation) is available in both add and edit flows.
