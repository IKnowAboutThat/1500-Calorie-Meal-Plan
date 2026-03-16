# Recipe Search Filters: Fiber, Protein Content, Multi-Select Protein Source

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fiber content, protein content (grams), and multi-select protein source filters to the recipe library, with a configurable +/- margin for numeric filters.

**Architecture:** All filtering is client-side in `recipe-library.js`. Recipes are already loaded with `fiber` and `protein` (per-serving) and `mainProtein` fields. No backend changes needed. We add two numeric inputs (fiber, protein grams), convert the protein source dropdown to a multi-select pill UI, and add a margin setting input. The margin applies to both numeric filters as a +/- range.

**Tech Stack:** Vanilla JS, CSS (no framework, no build step)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/js/recipe-library.js` | Modify | Add new filter state fields, filtering logic, UI elements, event bindings, reset logic |
| `app/css/styles.css` | Modify | Styles for multi-select pill UI, numeric filter inputs, margin setting |

No new files needed. No backend changes needed.

**Note:** Line numbers reference the file's initial state. They will drift as earlier tasks add/remove lines — find code by context patterns, not exact line numbers.

---

## Chunk 1: Numeric Filters (Fiber & Protein Content)

### Task 1: Add Filter State Fields

**Files:**
- Modify: `app/js/recipe-library.js:60-68` (filterState)

- [ ] **Step 1: Add new fields to `filterState`**

In `app/js/recipe-library.js`, update the `filterState` object at line 60:

```javascript
let filterState = {
  search: '',
  cuisine: '',
  protein: '',           // protein source (will become array in Task 5)
  mealType: '',
  favoritesOnly: false,
  cookCountMax: '',
  sort: 'name-asc',
  fiberTarget: '',       // NEW: fiber grams target (string, '' = no filter)
  proteinTarget: '',     // NEW: protein grams target (string, '' = no filter)
  margin: 5,             // NEW: +/- margin for numeric filters (default 5g)
};
```

- [ ] **Step 2: Verify page still loads**

Open `app/index.html` in browser, navigate to `#recipes`. Existing filters should still work. No visual changes yet.

- [ ] **Step 3: Commit**

```bash
git add app/js/recipe-library.js
git commit -m "feat: add filterState fields for fiber, protein content, and margin"
```

---

### Task 2: Add Numeric Filtering Logic

**Files:**
- Modify: `app/js/recipe-library.js:74-144` (getFilteredRecipes)
- Modify: `app/js/recipe-library.js:146-154` (hasActiveFilters)

- [ ] **Step 1: Add fiber and protein content filter logic**

In `getFilteredRecipes()`, after the protein source filter block (line 94) and before the meal type filter (line 96), add:

```javascript
  // Fiber target filter (with margin)
  if (filterState.fiberTarget !== '') {
    const target = parseFloat(filterState.fiberTarget);
    if (!isNaN(target)) {
      const margin = filterState.margin;
      filtered = filtered.filter((r) => {
        const fiber = r.fiber ?? 0;
        return fiber >= target - margin && fiber <= target + margin;
      });
    }
  }

  // Protein content filter (with margin)
  if (filterState.proteinTarget !== '') {
    const target = parseFloat(filterState.proteinTarget);
    if (!isNaN(target)) {
      const margin = filterState.margin;
      filtered = filtered.filter((r) => {
        const protein = r.protein ?? 0;
        return protein >= target - margin && protein <= target + margin;
      });
    }
  }
```

- [ ] **Step 2: Update `hasActiveFilters()`**

Add the new filter checks to the `hasActiveFilters()` function (line 146):

```javascript
function hasActiveFilters() {
  return (
    filterState.search !== '' ||
    filterState.cuisine !== '' ||
    filterState.protein !== '' ||
    filterState.mealType !== '' ||
    filterState.favoritesOnly ||
    filterState.cookCountMax !== '' ||
    filterState.fiberTarget !== '' ||
    filterState.proteinTarget !== ''
  );
}
```

- [ ] **Step 3: Verify no errors**

Open browser, navigate to `#recipes`. Page should load normally. No visual changes yet (inputs not rendered).

- [ ] **Step 4: Commit**

```bash
git add app/js/recipe-library.js
git commit -m "feat: add fiber and protein content filtering logic with margin"
```

---

### Task 3: Add Numeric Filter UI

**Files:**
- Modify: `app/js/recipe-library.js:198-257` (buildFilterBarHTML)
- Modify: `app/css/styles.css` (filter-bar styles)

- [ ] **Step 1: Add numeric inputs and margin setting to filter bar HTML**

In `buildFilterBarHTML()`, after the protein source `<select>` block (line 222) and before the meal type buttons `<div>` (line 224), insert:

```javascript
      <div class="filter-numeric-group">
        <input type="number" id="filter-fiber" placeholder="Fiber (g)" min="0" step="1"
          value="${filterState.fiberTarget}" class="filter-numeric-input">
        <input type="number" id="filter-protein-content" placeholder="Protein (g)" min="0" step="1"
          value="${filterState.proteinTarget}" class="filter-numeric-input">
        <label class="filter-margin-label" title="Search range: target +/- this value">
          &plusmn;<input type="number" id="filter-margin" min="0" max="50" step="1"
            value="${filterState.margin}" class="filter-margin-input">g
        </label>
      </div>
```

- [ ] **Step 2: Add CSS styles**

In `app/css/styles.css`, after the existing `.filter-bar select` rule (around line 1114), add:

```css
.filter-numeric-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-numeric-input {
  width: 100px;
  min-width: 80px;
}

.filter-margin-label {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
  cursor: default;
}

.filter-margin-input {
  width: 48px;
  text-align: center;
  padding: 0.25rem;
}
```

- [ ] **Step 3: Verify layout**

Open browser, navigate to `#recipes`. You should see two new numeric inputs ("Fiber (g)" and "Protein (g)") and a margin input showing "+/- 5 g". They won't filter yet (no event bindings).

- [ ] **Step 4: Commit**

```bash
git add app/js/recipe-library.js app/css/styles.css
git commit -m "feat: add fiber, protein content, and margin filter UI"
```

---

### Task 4: Bind Numeric Filter Events & Reset

**Files:**
- Modify: `app/js/recipe-library.js:620-674` (event bindings section)
- Modify: `app/js/recipe-library.js:157-180` (resetFilters)

- [ ] **Step 1: Add event listeners for numeric inputs**

In the event binding section of `recipe-library.js`, after the protein select listener (line 648) and before the cook count listener (line 651), add:

```javascript
  // Fiber filter input
  const fiberInput = container.querySelector('#filter-fiber');
  if (fiberInput) {
    const debouncedFiber = debounce((value) => {
      filterState.fiberTarget = value;
      renderGrid(container);
    }, 300);
    fiberInput.addEventListener('input', (e) => {
      debouncedFiber(e.target.value);
    });
  }

  // Protein content filter input
  const proteinContentInput = container.querySelector('#filter-protein-content');
  if (proteinContentInput) {
    const debouncedProteinContent = debounce((value) => {
      filterState.proteinTarget = value;
      renderGrid(container);
    }, 300);
    proteinContentInput.addEventListener('input', (e) => {
      debouncedProteinContent(e.target.value);
    });
  }

  // Margin input
  const marginInput = container.querySelector('#filter-margin');
  if (marginInput) {
    marginInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      filterState.margin = isNaN(val) || val < 0 ? 5 : val;
      // Re-filter if either numeric filter is active
      if (filterState.fiberTarget !== '' || filterState.proteinTarget !== '') {
        renderGrid(container);
      }
    });
  }
```

- [ ] **Step 2: Update `resetFilters()` to clear new fields and DOM elements**

In `resetFilters()`, add the new fields to the reset object:

```javascript
function resetFilters(container) {
  filterState = {
    search: '',
    cuisine: '',
    protein: '',
    mealType: '',
    favoritesOnly: false,
    cookCountMax: '',
    sort: filterState.sort,
    fiberTarget: '',
    proteinTarget: '',
    margin: 5,
  };
```

And add DOM resets after the existing ones (after line 179):

```javascript
  const fiberInput = container.querySelector('#filter-fiber');
  if (fiberInput) fiberInput.value = '';

  const proteinContentInput = container.querySelector('#filter-protein-content');
  if (proteinContentInput) proteinContentInput.value = '';

  const marginInput = container.querySelector('#filter-margin');
  if (marginInput) marginInput.value = '5';
```

- [ ] **Step 3: Test the numeric filters end-to-end**

1. Open browser, navigate to `#recipes`
2. Type "14" in the Fiber input -> only recipes with fiber 9-19g should show
3. Change margin to 2 -> only recipes with fiber 12-16g should show
4. Type "30" in Protein input -> further narrows to recipes matching both ranges
5. Click "Clear Filters" -> all recipes return, inputs reset to empty (margin resets to 5)

- [ ] **Step 4: Commit**

```bash
git add app/js/recipe-library.js
git commit -m "feat: bind fiber and protein content filter events with reset"
```

---

## Chunk 2: Multi-Select Protein Source

### Task 5: Convert Protein Source to Multi-Select

**Files:**
- Modify: `app/js/recipe-library.js:60-68` (filterState)
- Modify: `app/js/recipe-library.js:91-94` (getFilteredRecipes protein filter)
- Modify: `app/js/recipe-library.js:146-154` (hasActiveFilters)
- Modify: `app/js/recipe-library.js:157-180` (resetFilters)
- Modify: `app/js/recipe-library.js:198-257` (buildFilterBarHTML)
- Modify: `app/js/recipe-library.js:620-674` (event bindings)
- Modify: `app/css/styles.css`

- [ ] **Step 1: Change `protein` in filterState from string to array**

```javascript
// In filterState (line ~62):
  protein: [],            // CHANGED: array of selected protein sources
```

- [ ] **Step 2: Update filtering logic**

Replace the protein filter block in `getFilteredRecipes()` (lines 91-94):

```javascript
  // Protein source filter (multi-select)
  if (filterState.protein.length > 0) {
    filtered = filtered.filter((r) => filterState.protein.includes(r.mainProtein));
  }
```

- [ ] **Step 3: Update `hasActiveFilters()`**

Change the protein check from `filterState.protein !== ''` to:

```javascript
    filterState.protein.length > 0 ||
```

- [ ] **Step 4: Update `resetFilters()`**

Change protein reset from `protein: ''` to:

```javascript
    protein: [],
```

Remove the old DOM reset for the protein select dropdown (lines 175-176: `const proteinSelect = ...` and `if (proteinSelect) proteinSelect.value = '';`). These will be replaced in step 7.

- [ ] **Step 5: Remove dead `proteinOptions` variable and replace dropdown**

In `buildFilterBarHTML()`, delete the `proteinOptions` variable (lines 206-208 — the `.map()` that generated `<option>` elements). Keep the `proteins` variable (line 200) — it's still needed for the multi-select checkboxes.

Then replace the protein source `<select>` block (lines 219-222):

```javascript
      <div class="filter-multiselect" id="protein-multiselect">
        <button class="filter-multiselect__toggle" id="protein-multiselect-toggle" type="button">
          ${filterState.protein.length === 0
            ? 'All Proteins'
            : filterState.protein.map(p => `<span class="filter-pill">${escapeHTML(capitalize(p))}<span class="filter-pill__remove" data-protein="${escapeHTML(p)}">&times;</span></span>`).join('')}
        </button>
        <div class="filter-multiselect__dropdown hidden" id="protein-multiselect-dropdown">
          ${proteins.map(p => `
            <label class="filter-multiselect__option">
              <input type="checkbox" value="${escapeHTML(p)}" ${filterState.protein.includes(p) ? 'checked' : ''}>
              ${escapeHTML(capitalize(p))}
            </label>
          `).join('')}
        </div>
      </div>
```

- [ ] **Step 6: Add multi-select CSS**

In `app/css/styles.css`, add after the margin input styles:

```css
/* Multi-select filter */
.filter-multiselect {
  position: relative;
  min-width: 140px;
}

.filter-multiselect__toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  min-height: 2.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.9rem;
  text-align: left;
}

.filter-multiselect__toggle:hover {
  border-color: var(--color-primary);
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.4rem;
  background: var(--color-primary);
  color: white;
  border-radius: 1rem;
  font-size: 0.8rem;
  line-height: 1.4;
}

.filter-pill__remove {
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
  opacity: 0.8;
}

.filter-pill__remove:hover {
  opacity: 1;
}

.filter-multiselect__dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-top: 2px;
}

.filter-multiselect__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.filter-multiselect__option:hover {
  background: var(--color-hover);
}

.filter-multiselect__option input[type="checkbox"] {
  width: auto;
  margin: 0;
}
```

- [ ] **Step 7: Add multi-select event bindings (with proper cleanup)**

Remove the old protein select event listener (lines 641-648).

First, add a module-level named function for the outside-click handler (near the top of the file, after the `handleModalKeydown` function). This follows the same pattern the codebase uses for `handleModalClick` and `handleModalKeydown`:

```javascript
/**
 * Close protein multi-select dropdown when clicking outside.
 * Named function so it can be removed on page navigation (prevents leaks).
 */
function handleDropdownOutsideClick(e) {
  if (!e.target.closest('#protein-multiselect')) {
    const dropdown = document.querySelector('#protein-multiselect-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }
}
```

Then in the event binding section, replace the old protein select listener with:

```javascript
  // Protein source multi-select
  const proteinToggle = container.querySelector('#protein-multiselect-toggle');
  const proteinDropdown = container.querySelector('#protein-multiselect-dropdown');

  if (proteinToggle && proteinDropdown) {
    // Toggle dropdown open/close
    proteinToggle.addEventListener('click', (e) => {
      // If clicking a pill remove button, handle removal instead
      const removeBtn = e.target.closest('.filter-pill__remove');
      if (removeBtn) {
        e.stopPropagation();
        const val = removeBtn.dataset.protein;
        filterState.protein = filterState.protein.filter(p => p !== val);
        rebuildProteinToggle(container);
        syncProteinCheckboxes(container);
        renderGrid(container);
        return;
      }
      proteinDropdown.classList.toggle('hidden');
    });

    // Handle checkbox changes inside dropdown
    proteinDropdown.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const val = e.target.value;
        if (e.target.checked) {
          if (!filterState.protein.includes(val)) {
            filterState.protein.push(val);
          }
        } else {
          filterState.protein = filterState.protein.filter(p => p !== val);
        }
        rebuildProteinToggle(container);
        renderGrid(container);
      }
    });

    // Close dropdown when clicking outside (uses named function for cleanup)
    document.addEventListener('click', handleDropdownOutsideClick);
  }
```

- [ ] **Step 8: Add cleanup in `renderRecipeLibrary()` and remove stale protein select code**

In `renderRecipeLibrary()` (around line 836), add the dropdown outside-click cleanup alongside the existing modal listener cleanup:

```javascript
export function renderRecipeLibrary(container) {
  // Remove any prior modal event listeners to avoid duplicates
  document.body.removeEventListener('click', handleModalClick);
  document.body.removeEventListener('keydown', handleModalKeydown);
  document.removeEventListener('click', handleDropdownOutsideClick);  // NEW
```

Also in `renderRecipeLibrary()`, **delete** the stale protein select restoration code (lines 872-875):

```javascript
  // DELETE these lines — #filter-protein no longer exists, and filterState.protein is now an array
  const proteinSelect = container.querySelector('#filter-protein');
  if (proteinSelect && filterState.protein) {
    proteinSelect.value = filterState.protein;
  }
```

- [ ] **Step 9: Add helper functions for multi-select**

Add these two helper functions near the other helpers (after `capitalize`, around line 54):

```javascript
/**
 * Rebuild the protein multi-select toggle button content.
 */
function rebuildProteinToggle(container) {
  const toggle = container.querySelector('#protein-multiselect-toggle');
  if (!toggle) return;
  if (filterState.protein.length === 0) {
    toggle.innerHTML = 'All Proteins';
  } else {
    toggle.innerHTML = filterState.protein
      .map(p => `<span class="filter-pill">${escapeHTML(capitalize(p))}<span class="filter-pill__remove" data-protein="${escapeHTML(p)}">&times;</span></span>`)
      .join('');
  }
}

/**
 * Sync checkbox states in the protein dropdown with filterState.
 */
function syncProteinCheckboxes(container) {
  const dropdown = container.querySelector('#protein-multiselect-dropdown');
  if (!dropdown) return;
  dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = filterState.protein.includes(cb.value);
  });
}
```

- [ ] **Step 10: Update resetFilters DOM clearing for protein**

In `resetFilters()`, replace the old protein select DOM reset with:

```javascript
  rebuildProteinToggle(container);
  syncProteinCheckboxes(container);
```

- [ ] **Step 11: Test multi-select end-to-end**

1. Open browser, navigate to `#recipes`
2. Click "All Proteins" button -> dropdown opens with checkboxes
3. Check "chicken" -> dropdown stays open, toggle shows "Chicken" pill, grid filters to chicken recipes
4. Check "beef" -> toggle shows both pills, grid shows chicken + beef recipes
5. Click the X on "Chicken" pill -> removed, only beef recipes show
6. Click outside the dropdown -> it closes
7. Click "Clear Filters" -> toggle resets to "All Proteins", all recipes show

- [ ] **Step 12: Commit**

```bash
git add app/js/recipe-library.js app/css/styles.css
git commit -m "feat: convert protein source filter to multi-select with pill UI"
```

---

### Task 6: Sort Options for Fiber

**Files:**
- Modify: `app/js/recipe-library.js:119-141` (sort switch)
- Modify: `app/js/recipe-library.js:240-249` (sort select HTML)

- [ ] **Step 1: Add fiber sort options to the sort dropdown HTML**

In `buildFilterBarHTML()`, add two new `<option>` elements after the protein sort options (line 246):

```html
        <option value="fiber-asc"${filterState.sort === 'fiber-asc' ? ' selected' : ''}>Fiber &#8593;</option>
        <option value="fiber-desc"${filterState.sort === 'fiber-desc' ? ' selected' : ''}>Fiber &#8595;</option>
```

- [ ] **Step 2: Add fiber sort cases to the sort switch**

In the sort switch in `getFilteredRecipes()`, add before the `default` case (line 138):

```javascript
      case 'fiber-asc':
        return (a.fiber ?? 0) - (b.fiber ?? 0);
      case 'fiber-desc':
        return (b.fiber ?? 0) - (a.fiber ?? 0);
```

- [ ] **Step 3: Verify sorting**

Open browser, select "Fiber ↑" from sort dropdown. Recipes should sort by fiber ascending. Select "Fiber ↓" for descending.

- [ ] **Step 4: Commit**

```bash
git add app/js/recipe-library.js
git commit -m "feat: add fiber ascending/descending sort options"
```

---

### Task 7: Final Integration Test

- [ ] **Step 1: Test all filters together**

1. Navigate to `#recipes`
2. Set fiber to "10", margin to "3" -> shows recipes with 7-13g fiber
3. Set protein content to "25" -> further narrows to recipes with 22-28g protein AND 7-13g fiber
4. Select "chicken" and "tofu" from protein source -> only chicken/tofu recipes in those ranges
5. Type "salad" in search -> further narrows by name/ingredient
6. Select "Meals" meal type -> snacks removed
7. Sort by "Fiber ↓" -> sorted by fiber descending
8. Verify results count updates correctly
9. Click "Clear Filters" -> everything resets, all recipes show, margin is 5
10. Verify each filter works independently after clearing

- [ ] **Step 2: Test edge cases**

1. Enter "0" for fiber with margin "0" -> shows only recipes with exactly 0g fiber
2. Enter very large number (e.g., "999") for protein -> shows 0 results
3. Leave fiber input empty, set protein to "20" -> only protein filter applies
4. Select all protein sources -> same as "All Proteins" (no filtering)
5. Set margin to "0" -> exact match only

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add app/js/recipe-library.js app/css/styles.css
git commit -m "fix: address issues found in integration testing"
```
