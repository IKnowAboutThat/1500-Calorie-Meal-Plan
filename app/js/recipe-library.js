/**
 * recipe-library.js - Recipe browsing, filtering, and detail modal module.
 *
 * Renders a searchable, filterable recipe grid with detail modals,
 * favorite toggling, and user tag management.
 */

import { getRecipes } from './recipe-cache.js';
import * as store from './store.js';

// Dynamic import to avoid circular deps with app.js
async function getApp() {
  return await import('./app.js');
}

// ============================================================
// Helpers
// ============================================================

/**
 * Extract sorted unique values for a given key across all recipes.
 */
function uniqueValues(key) {
  const set = new Set(getRecipes().map((r) => r[key]));
  return Array.from(set).sort();
}

/**
 * Simple debounce utility.
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Escape HTML entities to prevent XSS in user-provided content.
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
// Filter state
// ============================================================

let filterState = {
  search: '',
  cuisine: '',
  protein: '',
  mealType: '',       // '' = all, 'meal', 'snack'
  favoritesOnly: false,
  cookCountMax: '',   // '' = no filter, '0' = never cooked, '3'/'5'/'10' = less than N
  sort: 'name-asc',
};

// ============================================================
// Filtering & sorting logic
// ============================================================

function getFilteredRecipes() {
  let filtered = [...getRecipes()];

  // Search filter: match recipe name or any ingredient name
  if (filterState.search) {
    const q = filterState.search.toLowerCase();
    filtered = filtered.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      return r.ingredients.some((ing) => ing.name.toLowerCase().includes(q));
    });
  }

  // Cuisine filter
  if (filterState.cuisine) {
    filtered = filtered.filter((r) => r.cuisine === filterState.cuisine);
  }

  // Protein filter
  if (filterState.protein) {
    filtered = filtered.filter((r) => r.mainProtein === filterState.protein);
  }

  // Meal type filter
  if (filterState.mealType) {
    filtered = filtered.filter((r) => r.mealType === filterState.mealType);
  }

  // Favorites filter
  if (filterState.favoritesOnly) {
    const favorites = store.getFavorites();
    filtered = filtered.filter((r) => favorites.includes(r.id));
  }

  // Cook count filter
  if (filterState.cookCountMax !== '') {
    const maxCount = parseInt(filterState.cookCountMax, 10);
    const counts = store.getCookCounts();
    if (maxCount === 0) {
      filtered = filtered.filter((r) => !(counts[r.id]));
    } else {
      filtered = filtered.filter((r) => (counts[r.id] || 0) < maxCount);
    }
  }

  // Sort
  const cookCounts = store.getCookCounts();
  filtered.sort((a, b) => {
    switch (filterState.sort) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'cal-asc':
        return a.calories - b.calories;
      case 'cal-desc':
        return b.calories - a.calories;
      case 'protein-asc':
        return a.protein - b.protein;
      case 'protein-desc':
        return b.protein - a.protein;
      case 'cook-desc':
        return (cookCounts[b.id] || 0) - (cookCounts[a.id] || 0);
      case 'cook-asc':
        return (cookCounts[a.id] || 0) - (cookCounts[b.id] || 0);
      default:
        return 0;
    }
  });

  return filtered;
}

function hasActiveFilters() {
  return (
    filterState.search !== '' ||
    filterState.cuisine !== '' ||
    filterState.protein !== '' ||
    filterState.mealType !== '' ||
    filterState.favoritesOnly ||
    filterState.cookCountMax !== ''
  );
}

function resetFilters(container) {
  filterState = {
    search: '',
    cuisine: '',
    protein: '',
    mealType: '',
    favoritesOnly: false,
    cookCountMax: '',
    sort: filterState.sort,  // preserve sort preference
  };

  // Reset DOM controls
  const searchInput = container.querySelector('#recipe-search');
  if (searchInput) searchInput.value = '';

  const cuisineSelect = container.querySelector('#filter-cuisine');
  if (cuisineSelect) cuisineSelect.value = '';

  const proteinSelect = container.querySelector('#filter-protein');
  if (proteinSelect) proteinSelect.value = '';

  const cookCountSelect = container.querySelector('#filter-cook-count');
  if (cookCountSelect) cookCountSelect.value = '';

  // Reset meal type buttons
  container.querySelectorAll('[data-meal-type]').forEach((btn) => {
    btn.classList.toggle('btn-primary', btn.dataset.mealType === '');
    btn.classList.toggle('btn-secondary', btn.dataset.mealType !== '');
  });

  // Reset favorites button
  const favBtn = container.querySelector('#filter-favorites');
  if (favBtn) favBtn.classList.remove('favorite--active');

  renderGrid(container);
}

// ============================================================
// Render: Filter Bar
// ============================================================

function buildFilterBarHTML() {
  const cuisines = uniqueValues('cuisine');
  const proteins = uniqueValues('mainProtein');

  const cuisineOptions = cuisines
    .map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`)
    .join('');

  const proteinOptions = proteins
    .map((p) => `<option value="${escapeHTML(p)}">${escapeHTML(capitalize(p))}</option>`)
    .join('');

  return `
    <div class="filter-bar">
      <input type="search" id="recipe-search" placeholder="Search recipes..." value="${escapeHTML(filterState.search)}">

      <select id="filter-cuisine">
        <option value="">All Cuisines</option>
        ${cuisineOptions}
      </select>

      <select id="filter-protein">
        <option value="">All Proteins</option>
        ${proteinOptions}
      </select>

      <div class="flex gap-1">
        <button class="btn ${filterState.mealType === '' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-meal-type="">All</button>
        <button class="btn ${filterState.mealType === 'meal' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-meal-type="meal">Meals</button>
        <button class="btn ${filterState.mealType === 'snack' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-meal-type="snack">Snacks</button>
      </div>

      <button class="favorite-btn ${filterState.favoritesOnly ? 'favorite--active' : ''}" id="filter-favorites" title="Show favorites only" style="font-size:1.4rem;">&#9829;</button>

      <select id="filter-cook-count" title="Filter by cook count">
        <option value="">All Cook Counts</option>
        <option value="0"${filterState.cookCountMax === '0' ? ' selected' : ''}>Never Cooked</option>
        <option value="3"${filterState.cookCountMax === '3' ? ' selected' : ''}>&lt; 3 times</option>
        <option value="5"${filterState.cookCountMax === '5' ? ' selected' : ''}>&lt; 5 times</option>
        <option value="10"${filterState.cookCountMax === '10' ? ' selected' : ''}>&lt; 10 times</option>
      </select>

      <select id="filter-sort">
        <option value="name-asc"${filterState.sort === 'name-asc' ? ' selected' : ''}>Name A-Z</option>
        <option value="name-desc"${filterState.sort === 'name-desc' ? ' selected' : ''}>Name Z-A</option>
        <option value="cal-asc"${filterState.sort === 'cal-asc' ? ' selected' : ''}>Calories &#8593;</option>
        <option value="cal-desc"${filterState.sort === 'cal-desc' ? ' selected' : ''}>Calories &#8595;</option>
        <option value="protein-asc"${filterState.sort === 'protein-asc' ? ' selected' : ''}>Protein &#8593;</option>
        <option value="protein-desc"${filterState.sort === 'protein-desc' ? ' selected' : ''}>Protein &#8595;</option>
        <option value="cook-desc"${filterState.sort === 'cook-desc' ? ' selected' : ''}>Most Cooked</option>
        <option value="cook-asc"${filterState.sort === 'cook-asc' ? ' selected' : ''}>Least Cooked</option>
      </select>
    </div>

    <div class="flex-between mb-1" style="align-items:center;">
      <span id="results-count" class="text-sm text-secondary"></span>
      <button class="btn btn-secondary btn-sm ${hasActiveFilters() ? '' : 'hidden'}" id="clear-filters">Clear Filters</button>
    </div>
  `;
}

// ============================================================
// Render: Recipe Cards
// ============================================================

function buildRecipeCardHTML(recipe) {
  const isFav = store.isFavorite(recipe.id);
  const cookCount = store.getCookCount(recipe.id);

  let cookBadgeHTML = '';
  if (cookCount > 0) {
    let tierClass;
    if (cookCount <= 2) tierClass = 'badge-cook-tier1';
    else if (cookCount <= 5) tierClass = 'badge-cook-tier2';
    else if (cookCount <= 10) tierClass = 'badge-cook-tier3';
    else tierClass = 'badge-cook-tier4';
    cookBadgeHTML = `<span class="badge badge-cook ${tierClass}" title="Cooked ${cookCount} time${cookCount !== 1 ? 's' : ''}">${cookCount}</span>`;
  }

  return `
    <div class="recipe-card" data-recipe-id="${escapeHTML(recipe.id)}">
      <div class="recipe-card__header" style="display:flex;justify-content:space-between;align-items:flex-start;">
        <h3 class="recipe-card__name">${escapeHTML(recipe.name)}</h3>
        <button class="favorite-btn ${isFav ? 'favorite--active' : ''}" data-action="toggle-favorite" data-recipe-id="${escapeHTML(recipe.id)}">&#9829;</button>
      </div>
      <div class="recipe-card__badges">
        <span class="badge badge-cuisine">${escapeHTML(recipe.cuisine)}</span>
        <span class="badge badge-tag">${escapeHTML(recipe.mainProtein)}</span>
      </div>
      <div class="recipe-card__macros">
        <span class="badge badge-cal">${recipe.calories} cal</span>
        <span class="badge badge-protein">${recipe.protein}g P</span>
        <span class="badge badge-fiber">${recipe.fiber}g F</span>
      </div>
      ${cookBadgeHTML}
    </div>
  `;
}

function renderGrid(container) {
  const filtered = getFilteredRecipes();
  const gridEl = container.querySelector('#recipe-grid');
  const countEl = container.querySelector('#results-count');
  const clearBtn = container.querySelector('#clear-filters');

  if (gridEl) {
    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>No recipes match your filters.</p>
          <p class="text-sm">Try adjusting your search or clearing filters.</p>
        </div>
      `;
    } else {
      gridEl.innerHTML = filtered.map(buildRecipeCardHTML).join('');
    }
  }

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${getRecipes().length} recipes`;
  }

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !hasActiveFilters());
  }
}

// ============================================================
// Render: Recipe Detail Modal
// ============================================================

function buildRecipeDetailHTML(recipe) {
  const isFav = store.isFavorite(recipe.id);
  const recipeTags = store.getRecipeTags();
  const tags = recipeTags[recipe.id] || [];

  const totalCal = recipe.ingredients.reduce((sum, i) => sum + (i.calories || 0), 0);
  const totalProtein = recipe.ingredients.reduce((sum, i) => sum + (i.protein || 0), 0);
  const totalFiber = recipe.ingredients.reduce((sum, i) => sum + (i.fiber || 0), 0);

  // Calorie contribution bars per ingredient
  const ingredientRows = recipe.ingredients
    .map((ing) => {
      const calPct = totalCal > 0 ? ((ing.calories || 0) / totalCal * 100) : 0;
      const proPct = totalProtein > 0 ? ((ing.protein || 0) / totalProtein * 100) : 0;
      return `
      <tr>
        <td>
          <div>${escapeHTML(ing.name)}</div>
          <div class="recipe-detail__cal-bar" style="margin-top:0.25rem;">
            <div class="recipe-detail__cal-bar-fill" style="width:${calPct.toFixed(1)}%;"></div>
          </div>
        </td>
        <td style="white-space:nowrap;">${ing.amount}${ing.unit}</td>
        <td>${(ing.calories || 0).toFixed(0)}</td>
        <td>${(ing.protein || 0).toFixed(1)}g</td>
        <td>${(ing.fiber || 0).toFixed(1)}g</td>
      </tr>`;
    })
    .join('');

  // Protein source breakdown — group by ingredient category
  const proteinSources = recipe.ingredients
    .filter(i => (i.protein || 0) > 1)
    .sort((a, b) => (b.protein || 0) - (a.protein || 0))
    .map(i => {
      const pct = totalProtein > 0 ? ((i.protein || 0) / totalProtein * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
          <span style="flex:1;font-size:0.85rem;">${escapeHTML(i.name)}</span>
          <span style="font-size:0.8rem;color:var(--color-text-secondary);min-width:3.5rem;text-align:right;">${(i.protein || 0).toFixed(1)}g</span>
          <div style="width:60px;height:6px;background:var(--color-border-light);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct.toFixed(1)}%;background:var(--color-macro-protein);border-radius:3px;"></div>
          </div>
          <span style="font-size:0.75rem;color:var(--color-text-secondary);min-width:2.5rem;text-align:right;">${pct.toFixed(0)}%</span>
        </div>`;
    })
    .join('');

  // Calorie density per ingredient (cal per gram)
  const densityItems = recipe.ingredients
    .filter(i => (i.amount || 0) > 0)
    .map(i => ({ ...i, density: (i.calories || 0) / i.amount }))
    .sort((a, b) => b.density - a.density)
    .slice(0, 5)
    .map(i => `
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.2rem 0;">
        <span>${escapeHTML(i.name)}</span>
        <span style="color:var(--color-text-secondary);">${i.density.toFixed(1)} cal/g</span>
      </div>`)
    .join('');

  const tagPills = tags
    .map(
      (tag) => `
      <span class="badge badge-tag" style="display:inline-flex;align-items:center;gap:0.25rem;">
        ${escapeHTML(tag)}
        <button class="tag-remove" data-tag="${escapeHTML(tag)}" data-recipe-id="${escapeHTML(recipe.id)}" style="background:none;border:none;cursor:pointer;font-size:0.9rem;color:var(--color-text-secondary);padding:0;line-height:1;">&times;</button>
      </span>`
    )
    .join('');

  const phaseBadgeClass = recipe.phase === 'luteal' ? 'badge-phase-luteal' : 'badge-phase-standard';

  // Percentage of daily targets (1500 cal, 135g protein, 35g fiber)
  const calPctDaily = (totalCal / 1500 * 100).toFixed(0);
  const proPctDaily = (totalProtein / 135 * 100).toFixed(0);
  const fibPctDaily = (totalFiber / 35 * 100).toFixed(0);

  return `
    <div class="recipe-detail" data-detail-recipe-id="${escapeHTML(recipe.id)}">
      <button class="modal-close" data-action="close-modal">&times;</button>

      <div class="recipe-detail__header">
        <h2>${escapeHTML(recipe.name)}</h2>
        <div class="flex gap-1 flex-wrap" style="margin-top:0.5rem;">
          <span class="badge badge-cuisine">${escapeHTML(recipe.cuisine)}</span>
          <span class="badge badge-tag">${escapeHTML(capitalize(recipe.mainProtein))}</span>
          <span class="badge badge-tag">${escapeHTML(capitalize(recipe.mealType))}</span>
          <span class="badge ${phaseBadgeClass}">${escapeHTML(capitalize(recipe.phase))}</span>
        </div>
      </div>

      <div class="recipe-detail__macros">
        <div class="recipe-detail__macro-item">
          <div class="recipe-detail__macro-value" style="color:var(--color-macro-cal);">${totalCal.toFixed(0)}</div>
          <div class="recipe-detail__macro-label">Calories</div>
          <div class="recipe-detail__macro-daily">${calPctDaily}% daily</div>
          <div class="recipe-detail__daily-bar"><div class="recipe-detail__daily-bar-fill recipe-detail__daily-bar-fill--cal" style="width:${Math.min(parseFloat(calPctDaily), 100)}%;"></div></div>
        </div>
        <div class="recipe-detail__macro-item">
          <div class="recipe-detail__macro-value" style="color:var(--color-macro-protein);">${totalProtein.toFixed(1)}g</div>
          <div class="recipe-detail__macro-label">Protein</div>
          <div class="recipe-detail__macro-daily">${proPctDaily}% daily</div>
          <div class="recipe-detail__daily-bar"><div class="recipe-detail__daily-bar-fill recipe-detail__daily-bar-fill--pro" style="width:${Math.min(parseFloat(proPctDaily), 100)}%;"></div></div>
        </div>
        <div class="recipe-detail__macro-item">
          <div class="recipe-detail__macro-value" style="color:var(--color-macro-fiber);">${totalFiber.toFixed(1)}g</div>
          <div class="recipe-detail__macro-label">Fiber</div>
          <div class="recipe-detail__macro-daily">${fibPctDaily}% daily</div>
          <div class="recipe-detail__daily-bar"><div class="recipe-detail__daily-bar-fill recipe-detail__daily-bar-fill--fib" style="width:${Math.min(parseFloat(fibPctDaily), 100)}%;"></div></div>
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <button class="favorite-btn ${isFav ? 'favorite--active' : ''}" data-action="toggle-favorite-detail" data-recipe-id="${escapeHTML(recipe.id)}" style="font-size:1.4rem;">
          &#9829; ${isFav ? 'Favorited' : 'Add to Favorites'}
        </button>
      </div>

      <div class="recipe-detail__ingredients">
        <h3>Ingredients</h3>
        <div id="scale-controls-${escapeHTML(recipe.id)}"></div>
        <div id="scaled-ingredients-${escapeHTML(recipe.id)}">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Amount</th>
                <th>Cal</th>
                <th>Protein</th>
                <th>Fiber</th>
              </tr>
            </thead>
            <tbody>
              ${ingredientRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;">
                <td>Total</td>
                <td></td>
                <td>${totalCal.toFixed(0)}</td>
                <td>${totalProtein.toFixed(1)}g</td>
                <td>${totalFiber.toFixed(1)}g</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="recipe-detail__nutrition-panels" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div class="card" style="padding:1rem;">
          <h4 style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--color-text-secondary);">Protein Sources</h4>
          ${proteinSources || '<span class="text-sm text-secondary">No significant protein sources</span>'}
        </div>
        <div class="card" style="padding:1rem;">
          <h4 style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--color-text-secondary);">Calorie Density (top 5)</h4>
          ${densityItems || '<span class="text-sm text-secondary">No data</span>'}
        </div>
      </div>

      <div class="recipe-detail__tags" data-tags-section="${escapeHTML(recipe.id)}">
        <h3>Tags</h3>
        <div class="flex flex-wrap gap-1 mb-1" id="tag-pills-${escapeHTML(recipe.id)}">
          ${tagPills || '<span class="text-sm text-secondary">No tags yet</span>'}
        </div>
        <div class="flex gap-1" style="align-items:center;">
          <input type="text" id="tag-input-${escapeHTML(recipe.id)}" placeholder="Add a tag..." style="width:auto;flex:1;max-width:200px;">
          <span class="text-sm text-secondary">Press Enter to add</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Re-render just the tag pills section inside an open modal.
 */
function rerenderTagPills(recipeId) {
  const pillsContainer = document.querySelector(`#tag-pills-${CSS.escape(recipeId)}`);
  if (!pillsContainer) return;

  const recipeTags = store.getRecipeTags();
  const tags = recipeTags[recipeId] || [];

  if (tags.length === 0) {
    pillsContainer.innerHTML = '<span class="text-sm text-secondary">No tags yet</span>';
    return;
  }

  pillsContainer.innerHTML = tags
    .map(
      (tag) => `
      <span class="badge badge-tag" style="display:inline-flex;align-items:center;gap:0.25rem;">
        ${escapeHTML(tag)}
        <button class="tag-remove" data-tag="${escapeHTML(tag)}" data-recipe-id="${escapeHTML(recipeId)}" style="background:none;border:none;cursor:pointer;font-size:0.9rem;color:var(--color-text-secondary);padding:0;line-height:1;">&times;</button>
      </span>`
    )
    .join('');
}

// ============================================================
// Modal open/close helpers
// ============================================================

export async function openRecipeModal(recipeId) {
  const numId = typeof recipeId === 'string' ? parseInt(recipeId, 10) : recipeId;
  const recipe = getRecipes().find((r) => r.id === numId || r.id === recipeId);
  if (!recipe) return;

  const html = buildRecipeDetailHTML(recipe);

  try {
    const app = await getApp();
    if (app.openModal) {
      app.openModal(html);
    } else {
      // Fallback: create modal overlay manually
      showModalFallback(html);
    }
  } catch {
    // app.js not available yet; use fallback
    showModalFallback(html);
  }

  // Initialize recipe scaling controls
  initScaleControls(recipe);
}

/**
 * Dynamically import recipe-scaling.js and wire up the scale controls
 * for an open recipe detail modal.
 */
async function initScaleControls(recipe) {
  try {
    const { renderScaleControls, renderScaledIngredientTable, attachScaleListeners, scaleRecipe } =
      await import('./recipe-scaling.js');

    const controlsContainer = document.getElementById(`scale-controls-${recipe.id}`);
    const ingredientsContainer = document.getElementById(`scaled-ingredients-${recipe.id}`);
    if (!controlsContainer || !ingredientsContainer) return;

    let currentScale = 1;

    // Render initial scale controls
    controlsContainer.innerHTML = renderScaleControls(recipe.id, currentScale);

    // Callback when scale changes
    function onScaleChange(newScale) {
      currentScale = newScale;

      // Re-render the scale controls to update active preset
      controlsContainer.innerHTML = renderScaleControls(recipe.id, currentScale);

      // Re-render ingredient table with scaled values
      ingredientsContainer.innerHTML = renderScaledIngredientTable(recipe, currentScale);

      // Update the macro summary display in the modal header
      const scaled = scaleRecipe(recipe, currentScale);
      const detailEl = document.querySelector(`[data-detail-recipe-id="${recipe.id}"]`);
      if (detailEl) {
        const macroItems = detailEl.querySelectorAll('.recipe-detail__macro-value');
        if (macroItems.length >= 3) {
          macroItems[0].textContent = scaled.calories;
          macroItems[1].textContent = scaled.protein + 'g';
          macroItems[2].textContent = scaled.fiber + 'g';
        }
      }

      // Re-attach listeners since we replaced the controls HTML
      attachScaleListeners(controlsContainer.parentElement, recipe.id, currentScale, onScaleChange);
    }

    // Attach initial listeners
    attachScaleListeners(controlsContainer.parentElement, recipe.id, currentScale, onScaleChange);
  } catch (err) {
    console.warn('Recipe scaling module not available:', err);
  }
}

function showModalFallback(contentHTML) {
  // Remove any existing modal
  closeModalFallback();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'recipe-modal-overlay';
  overlay.innerHTML = `<div class="modal-content">${contentHTML}</div>`;

  // Close on overlay click (not content click)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModalFallback();
    }
  });

  document.body.appendChild(overlay);
}

function closeModalFallback() {
  const overlay = document.getElementById('recipe-modal-overlay');
  if (overlay) {
    overlay.remove();
  }
}

async function showToast(message, type = 'success') {
  try {
    const app = await getApp();
    if (app.showToast) {
      app.showToast(message, type);
      return;
    }
  } catch {
    // app.js not available
  }

  // Fallback toast
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    if (container.children.length === 0) {
      container.remove();
    }
  }, 2500);
}

// ============================================================
// Event handling
// ============================================================

function attachEvents(container) {
  // Debounced search
  const searchInput = container.querySelector('#recipe-search');
  if (searchInput) {
    const debouncedSearch = debounce((value) => {
      filterState.search = value;
      renderGrid(container);
    }, 300);

    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  // Cuisine select
  const cuisineSelect = container.querySelector('#filter-cuisine');
  if (cuisineSelect) {
    cuisineSelect.addEventListener('change', (e) => {
      filterState.cuisine = e.target.value;
      renderGrid(container);
    });
  }

  // Protein select
  const proteinSelect = container.querySelector('#filter-protein');
  if (proteinSelect) {
    proteinSelect.addEventListener('change', (e) => {
      filterState.protein = e.target.value;
      renderGrid(container);
    });
  }

  // Cook count filter select
  const cookCountSelect = container.querySelector('#filter-cook-count');
  if (cookCountSelect) {
    cookCountSelect.addEventListener('change', (e) => {
      filterState.cookCountMax = e.target.value;
      renderGrid(container);
    });
  }

  // Sort select
  const sortSelect = container.querySelector('#filter-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      filterState.sort = e.target.value;
      renderGrid(container);
    });
  }

  // Clear filters button
  const clearBtn = container.querySelector('#clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      resetFilters(container);
    });
  }

  // Event delegation on the container for:
  // - Meal type buttons
  // - Favorites toggle filter
  // - Favorite heart buttons on cards
  // - Recipe card clicks (open modal)
  container.addEventListener('click', async (e) => {
    const target = e.target;

    // Meal type filter buttons
    const mealTypeBtn = target.closest('[data-meal-type]');
    if (mealTypeBtn && container.contains(mealTypeBtn)) {
      filterState.mealType = mealTypeBtn.dataset.mealType;
      container.querySelectorAll('[data-meal-type]').forEach((btn) => {
        btn.classList.toggle('btn-primary', btn.dataset.mealType === filterState.mealType);
        btn.classList.toggle('btn-secondary', btn.dataset.mealType !== filterState.mealType);
      });
      renderGrid(container);
      return;
    }

    // Favorites filter toggle
    if (target.id === 'filter-favorites' || target.closest('#filter-favorites')) {
      filterState.favoritesOnly = !filterState.favoritesOnly;
      const favBtn = container.querySelector('#filter-favorites');
      if (favBtn) {
        favBtn.classList.toggle('favorite--active', filterState.favoritesOnly);
      }
      renderGrid(container);
      return;
    }

    // Favorite toggle on card
    const favAction = target.closest('[data-action="toggle-favorite"]');
    if (favAction) {
      e.stopPropagation();
      const recipeId = favAction.dataset.recipeId;
      const isNowFav = store.toggleFavorite(recipeId);
      favAction.classList.toggle('favorite--active', isNowFav);

      const recipeName = getRecipes().find((r) => r.id === recipeId)?.name || 'Recipe';
      showToast(isNowFav ? `${recipeName} added to favorites` : `${recipeName} removed from favorites`);

      // If favorites-only filter is active and we unfavorited, re-render grid
      if (filterState.favoritesOnly && !isNowFav) {
        renderGrid(container);
      }
      return;
    }

    // Recipe card click -> open modal
    const card = target.closest('.recipe-card');
    if (card && container.contains(card)) {
      const recipeId = card.dataset.recipeId;
      if (recipeId) {
        openRecipeModal(recipeId);
      }
      return;
    }
  });

  // Event delegation on document.body for modal interactions
  // (modal is appended to body, outside container)
  document.body.addEventListener('click', handleModalClick);
  document.body.addEventListener('keydown', handleModalKeydown);
}

function handleModalClick(e) {
  const target = e.target;

  // Close modal button
  const closeBtn = target.closest('[data-action="close-modal"]');
  if (closeBtn) {
    closeModalFallback();
    // Also try app.js closeModal
    getApp().then((app) => {
      if (app.closeModal) app.closeModal();
    }).catch(() => {});
    return;
  }

  // Favorite toggle in detail modal
  const favDetailBtn = target.closest('[data-action="toggle-favorite-detail"]');
  if (favDetailBtn) {
    const recipeId = favDetailBtn.dataset.recipeId;
    const isNowFav = store.toggleFavorite(recipeId);
    favDetailBtn.classList.toggle('favorite--active', isNowFav);
    favDetailBtn.innerHTML = `&#9829; ${isNowFav ? 'Favorited' : 'Add to Favorites'}`;

    const recipeName = getRecipes().find((r) => r.id === recipeId)?.name || 'Recipe';
    showToast(isNowFav ? `${recipeName} added to favorites` : `${recipeName} removed from favorites`);

    // Also update the card heart in the grid if visible
    const gridHeart = document.querySelector(`.recipe-card [data-action="toggle-favorite"][data-recipe-id="${CSS.escape(recipeId)}"]`);
    if (gridHeart) {
      gridHeart.classList.toggle('favorite--active', isNowFav);
    }
    return;
  }

  // Tag remove button
  const tagRemoveBtn = target.closest('.tag-remove');
  if (tagRemoveBtn) {
    const recipeId = tagRemoveBtn.dataset.recipeId;
    const tagToRemove = tagRemoveBtn.dataset.tag;
    const recipeTags = store.getRecipeTags();
    const currentTags = recipeTags[recipeId] || [];
    const updatedTags = currentTags.filter((t) => t !== tagToRemove);
    store.setRecipeTags(recipeId, updatedTags);
    rerenderTagPills(recipeId);
    showToast(`Tag "${tagToRemove}" removed`);
    return;
  }
}

function handleModalKeydown(e) {
  // Add tag on Enter in tag input
  if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('tag-input-')) {
    e.preventDefault();
    const recipeId = e.target.id.replace('tag-input-', '');
    const newTag = e.target.value.trim().toLowerCase();
    if (!newTag) return;

    const recipeTags = store.getRecipeTags();
    const currentTags = recipeTags[recipeId] || [];

    // Prevent duplicates
    if (currentTags.includes(newTag)) {
      showToast(`Tag "${newTag}" already exists`, 'info');
      e.target.value = '';
      return;
    }

    currentTags.push(newTag);
    store.setRecipeTags(recipeId, currentTags);
    e.target.value = '';
    rerenderTagPills(recipeId);
    showToast(`Tag "${newTag}" added`);
  }

  // Close modal on Escape
  if (e.key === 'Escape') {
    const overlay = document.getElementById('recipe-modal-overlay');
    if (overlay) {
      closeModalFallback();
    }
    getApp().then((app) => {
      if (app.closeModal) app.closeModal();
    }).catch(() => {});
  }
}

// ============================================================
// Main render entry point
// ============================================================

/**
 * Render the complete recipe library page into the given container element.
 *
 * @param {HTMLElement} container - The #app-content element.
 */
export function renderRecipeLibrary(container) {
  // Remove any prior modal event listeners to avoid duplicates
  document.body.removeEventListener('click', handleModalClick);
  document.body.removeEventListener('keydown', handleModalKeydown);

  const filterBarHTML = buildFilterBarHTML();
  const filtered = getFilteredRecipes();
  const cardsHTML = filtered.length > 0
    ? filtered.map(buildRecipeCardHTML).join('')
    : `<div class="empty-state" style="grid-column: 1 / -1;">
         <p>No recipes match your filters.</p>
         <p class="text-sm">Try adjusting your search or clearing filters.</p>
       </div>`;

  container.innerHTML = `
    <div class="page-transition">
      <h2 style="margin-bottom:1rem;">Recipe Library</h2>
      ${filterBarHTML}
      <div class="grid-3" id="recipe-grid">
        ${cardsHTML}
      </div>
    </div>
  `;

  // Update results count
  const countEl = container.querySelector('#results-count');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${getRecipes().length} recipes`;
  }

  // Restore selected values on filter dropdowns (for re-renders)
  const cuisineSelect = container.querySelector('#filter-cuisine');
  if (cuisineSelect && filterState.cuisine) {
    cuisineSelect.value = filterState.cuisine;
  }

  const proteinSelect = container.querySelector('#filter-protein');
  if (proteinSelect && filterState.protein) {
    proteinSelect.value = filterState.protein;
  }

  attachEvents(container);
}
