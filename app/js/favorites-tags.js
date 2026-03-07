/**
 * Favorites & Tags Shared Utility Module
 *
 * Provides reusable UI components for favorite buttons, tag management,
 * tag filtering, and a centralized recipe filtering function used by
 * the recipe library and recipe picker modal.
 */

import * as store from './store.js';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Escapes a string for safe insertion into HTML, preventing XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// 1. renderFavoriteButton
// ---------------------------------------------------------------------------

/**
 * Returns an HTML string for a favorite heart toggle button.
 * @param {string} recipeId
 * @returns {string} HTML string
 */
export function renderFavoriteButton(recipeId) {
  const active = store.isFavorite(recipeId);
  return `<button class="favorite-btn ${active ? 'favorite--active' : ''}"
    data-action="toggle-favorite" data-recipe-id="${recipeId}"
    title="${active ? 'Remove from favorites' : 'Add to favorites'}">&#9829;</button>`;
}

// ---------------------------------------------------------------------------
// 2. attachFavoriteListeners
// ---------------------------------------------------------------------------

/**
 * Attaches click handlers to all [data-action="toggle-favorite"] buttons
 * found inside the given container.  On click the button state is toggled
 * and a `favorites-changed` custom event is dispatched on `document`.
 * @param {HTMLElement} container
 */
export function attachFavoriteListeners(container) {
  const buttons = container.querySelectorAll('[data-action="toggle-favorite"]');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const recipeId = btn.dataset.recipeId;
      const isFav = store.toggleFavorite(recipeId);

      btn.classList.toggle('favorite--active', isFav);
      btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

      document.dispatchEvent(
        new CustomEvent('favorites-changed', {
          detail: { recipeId, isFavorite: isFav }
        })
      );
    });
  });
}

// ---------------------------------------------------------------------------
// 3. renderTagList
// ---------------------------------------------------------------------------

/**
 * Returns an HTML string showing existing tags as removable pills plus an
 * inline add-tag input field.
 * @param {string} recipeId
 * @returns {string} HTML string
 */
export function renderTagList(recipeId) {
  const allTags = store.getRecipeTags();
  const tags = allTags[recipeId] || [];

  let html = '<div class="tag-list">';

  tags.forEach(tag => {
    html += `<span class="badge badge-tag tag-pill" data-recipe-id="${recipeId}" data-tag="${escapeHTML(tag)}">
      ${escapeHTML(tag)} <button class="tag-remove" data-action="remove-tag" data-recipe-id="${recipeId}" data-tag="${escapeHTML(tag)}">&times;</button>
    </span>`;
  });

  html += `<input type="text" class="tag-input" data-action="add-tag" data-recipe-id="${recipeId}"
    placeholder="Add tag..." style="width: 100px; padding: 2px 6px; font-size: 0.75rem; border: 1px solid var(--color-border); border-radius: 12px;">`;

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 4. attachTagListeners
// ---------------------------------------------------------------------------

/**
 * Attaches event listeners for adding and removing tags within the container
 * for a specific recipe.
 *
 * - **Add**: Enter key on the `.tag-input` matching the recipeId creates a
 *   new tag (trimmed, non-empty, non-duplicate).
 * - **Remove**: Click on a `.tag-remove` button matching the recipeId
 *   removes the associated tag.
 *
 * After any change, `store.setRecipeTags()` is called and the `onUpdate`
 * callback is invoked so the caller can re-render.
 *
 * @param {HTMLElement} container
 * @param {string} recipeId
 * @param {Function} onUpdate - callback invoked after tags change
 */
export function attachTagListeners(container, recipeId, onUpdate) {
  // Add tag on Enter
  const input = container.querySelector(`.tag-input[data-recipe-id="${recipeId}"]`);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;

        const allTags = store.getRecipeTags();
        const current = allTags[recipeId] || [];

        // Prevent duplicates
        if (current.includes(value)) {
          input.value = '';
          return;
        }

        current.push(value);
        store.setRecipeTags(recipeId, current);
        if (typeof onUpdate === 'function') onUpdate();
      }
    });
  }

  // Remove tag on click
  const removeBtns = container.querySelectorAll(`.tag-remove[data-recipe-id="${recipeId}"]`);
  removeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = btn.dataset.tag;

      const allTags = store.getRecipeTags();
      const current = allTags[recipeId] || [];
      const updated = current.filter(t => t !== tag);

      store.setRecipeTags(recipeId, updated);
      if (typeof onUpdate === 'function') onUpdate();
    });
  });
}

// ---------------------------------------------------------------------------
// 5. renderTagFilter
// ---------------------------------------------------------------------------

/**
 * Returns an HTML string for a tag filter bar showing all available tags as
 * toggleable pill buttons plus an optional "Clear" button.  Returns an empty
 * string when no tags exist.
 *
 * NOTE: The `onChange` parameter is accepted for API consistency but is NOT
 * used during HTML rendering.  The caller is responsible for attaching click
 * handlers to the rendered `.tag-filter-btn` elements.
 *
 * @param {string[]} selectedTags - currently active filter tags
 * @param {Function} [onChange]   - reserved for caller use
 * @returns {string} HTML string
 */
export function renderTagFilter(selectedTags = [], onChange) {
  const allTags = store.getAllTags();
  if (allTags.length === 0) return '';

  let html = '<div class="tag-filter flex flex-wrap gap-1">';
  html += '<span class="text-sm text-secondary">Tags:</span>';

  allTags.forEach(tag => {
    const active = selectedTags.includes(tag);
    html += `<button class="badge badge-tag tag-filter-btn ${active ? 'tag-filter-btn--active' : ''}"
      data-action="filter-tag" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`;
  });

  if (selectedTags.length > 0) {
    html += '<button class="btn btn-sm btn-secondary" data-action="clear-tag-filter">Clear</button>';
  }

  html += '</div>';
  return html;
}

// ---------------------------------------------------------------------------
// 6. getFilteredRecipes
// ---------------------------------------------------------------------------

/**
 * Centralized recipe filtering and sorting function shared by the recipe
 * library view and the recipe picker modal.
 *
 * @param {Object[]} allRecipes - full recipe array
 * @param {Object}   filters   - optional filter/sort criteria
 * @param {string}   [filters.search]        - text search on name or ingredient
 * @param {string}   [filters.cuisine]       - cuisine type (or 'all')
 * @param {string}   [filters.mainProtein]   - main protein (or 'all')
 * @param {number}   [filters.calorieMin]    - minimum calories
 * @param {number}   [filters.calorieMax]    - maximum calories
 * @param {number}   [filters.proteinMin]    - minimum protein (g)
 * @param {number}   [filters.proteinMax]    - maximum protein (g)
 * @param {number}   [filters.fiberMin]      - minimum fiber (g)
 * @param {number}   [filters.fiberMax]      - maximum fiber (g)
 * @param {string}   [filters.mealType]      - meal type (or 'all')
 * @param {boolean}  [filters.favoritesOnly] - show only favorited recipes
 * @param {string[]} [filters.tags]          - tags to match (AND logic)
 * @param {string}   [filters.sortBy]        - sort key
 * @returns {Object[]} filtered and sorted recipe array
 */
export function getFilteredRecipes(allRecipes, filters = {}) {
  let result = [...allRecipes];

  // Search filter: case-insensitive substring on recipe name OR any ingredient name
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.ingredients.some(i => i.name.toLowerCase().includes(q))
    );
  }

  // Cuisine filter
  if (filters.cuisine && filters.cuisine !== 'all') {
    result = result.filter(r => r.cuisine === filters.cuisine);
  }

  // Main protein filter
  if (filters.mainProtein && filters.mainProtein !== 'all') {
    result = result.filter(r => r.mainProtein === filters.mainProtein);
  }

  // Calorie range
  if (filters.calorieMin != null) {
    result = result.filter(r => r.calories >= filters.calorieMin);
  }
  if (filters.calorieMax != null) {
    result = result.filter(r => r.calories <= filters.calorieMax);
  }

  // Protein range
  if (filters.proteinMin != null) {
    result = result.filter(r => r.protein >= filters.proteinMin);
  }
  if (filters.proteinMax != null) {
    result = result.filter(r => r.protein <= filters.proteinMax);
  }

  // Fiber range
  if (filters.fiberMin != null) {
    result = result.filter(r => r.fiber >= filters.fiberMin);
  }
  if (filters.fiberMax != null) {
    result = result.filter(r => r.fiber <= filters.fiberMax);
  }

  // Meal type
  if (filters.mealType && filters.mealType !== 'all') {
    result = result.filter(r => r.mealType === filters.mealType);
  }

  // Favorites only
  if (filters.favoritesOnly) {
    const favs = store.getFavorites();
    result = result.filter(r => favs.includes(r.id));
  }

  // Tags filter (AND logic - recipe must have ALL selected tags)
  if (filters.tags && filters.tags.length > 0) {
    const recipeTags = store.getRecipeTags();
    result = result.filter(r => {
      const rTags = recipeTags[r.id] || [];
      return filters.tags.every(t => rTags.includes(t));
    });
  }

  // Sort
  switch (filters.sortBy) {
    case 'name-az':
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-za':
      result.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'cal-asc':
      result.sort((a, b) => a.calories - b.calories);
      break;
    case 'cal-desc':
      result.sort((a, b) => b.calories - a.calories);
      break;
    case 'protein-asc':
      result.sort((a, b) => a.protein - b.protein);
      break;
    case 'protein-desc':
      result.sort((a, b) => b.protein - a.protein);
      break;
    default:
      result.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

// ---------------------------------------------------------------------------
// 7. isFavorite
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper around `store.isFavorite()`.
 * @param {string} recipeId
 * @returns {boolean}
 */
export function isFavorite(recipeId) {
  return store.isFavorite(recipeId);
}
