/**
 * pantry.js - Food inventory / pantry tracking module.
 *
 * Renders a searchable, categorised pantry list with add, edit, delete,
 * and clear-all functionality. Items are persisted via the store module.
 */

import { recipes, ingredientCategories } from './data/recipes.js';
import * as store from './store.js';

// Dynamic import to avoid circular deps with app.js
async function getApp() {
  return await import('./app.js');
}

// ============================================================
// Helpers
// ============================================================

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
 * Extract all unique ingredient names from the recipes array, sorted.
 */
function getAllIngredientNames() {
  const nameSet = new Set();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      nameSet.add(ing.name);
    }
  }
  return Array.from(nameSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Look up the category for an ingredient name using the ingredientCategories map.
 * Falls back to "Other" when no match is found.
 */
function getCategory(ingredientName) {
  const key = ingredientName.toLowerCase();
  return ingredientCategories[key] || 'Other';
}

/**
 * Show a toast notification via app.js, with a fallback.
 */
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
  }, 3000);
}

/**
 * Show a toast with an undo action. Returns a promise that resolves with
 * true if the user clicked Undo, false if the timeout expired.
 */
function showUndoToast(message, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let resolved = false;

    const container = document.getElementById('toast-container') ||
      (() => {
        const c = document.createElement('div');
        c.className = 'toast-container';
        c.id = 'toast-container';
        document.body.appendChild(c);
        return c;
      })();

    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;

    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.style.cssText = 'background: none; border: 1px solid currentColor; color: inherit; padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; white-space: nowrap;';

    toast.appendChild(msgSpan);
    toast.appendChild(undoBtn);
    container.appendChild(toast);

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        toast.remove();
        resolve(false);
      }
    }, timeoutMs);

    undoBtn.addEventListener('click', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        toast.remove();
        resolve(true);
      }
    });
  });
}

// ============================================================
// Module-level state
// ============================================================

let searchQuery = '';
let currentContainer = null;

// Track pending deletions so they can be cancelled
const pendingDeletions = new Map(); // id -> timeoutId

// ============================================================
// Build HTML
// ============================================================

/**
 * Build the datalist options for all unique ingredient names.
 */
function buildIngredientDatalist() {
  const names = getAllIngredientNames();
  return names
    .map((name) => `<option value="${escapeHTML(name)}">`)
    .join('');
}

/**
 * Build the Add Item form card.
 */
function buildAddItemForm() {
  return `
    <div class="card">
      <h2>Add Pantry Item</h2>
      <div class="flex gap-1 flex-wrap" style="align-items: flex-end;">
        <div class="form-group" style="flex: 2; min-width: 200px; margin-bottom: 0;">
          <label>Ingredient</label>
          <input type="text" id="pantry-ingredient" placeholder="e.g., Chicken breast" list="ingredient-suggestions">
          <datalist id="ingredient-suggestions">
            ${buildIngredientDatalist()}
          </datalist>
        </div>
        <div class="form-group" style="flex: 0; min-width: 80px; margin-bottom: 0;">
          <label>Qty</label>
          <input type="number" id="pantry-qty" value="1" min="0" step="1">
        </div>
        <div class="form-group" style="flex: 0; min-width: 80px; margin-bottom: 0;">
          <label>Unit</label>
          <select id="pantry-unit">
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="oz">oz</option>
            <option value="lbs">lbs</option>
            <option value="cups">cups</option>
            <option value="cans">cans</option>
            <option value="bottles">bottles</option>
            <option value="jars">jars</option>
            <option value="bunches">bunches</option>
            <option value="each">each</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="flex gap-1" style="align-items: center; cursor: pointer;">
            <input type="checkbox" id="pantry-always-stocked"> Always Stocked
          </label>
        </div>
        <button class="btn btn-primary" id="add-pantry-item">Add</button>
      </div>
    </div>
  `;
}

/**
 * Build a single pantry item row (display mode).
 */
function buildPantryItemHTML(item) {
  const alwaysStockedBadge = item.alwaysStocked
    ? `<span class="badge badge-tag" style="background: var(--color-primary-light); color: white;" data-always-stocked>Always Stocked</span>`
    : '';

  return `
    <div class="pantry-item" data-item-id="${escapeHTML(item.id)}">
      <span class="pantry-item__name">${escapeHTML(item.ingredientName)}</span>
      <span class="pantry-item__qty">${escapeHTML(String(item.quantity))}${escapeHTML(item.unit)}</span>
      ${alwaysStockedBadge}
      <button class="btn btn-sm btn-secondary" data-action="edit-item" data-id="${escapeHTML(item.id)}">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete-item" data-id="${escapeHTML(item.id)}">&times;</button>
    </div>
  `;
}

/**
 * Build inline edit form for a pantry item.
 */
function buildPantryItemEditHTML(item) {
  const unitOptions = ['g', 'ml', 'oz', 'lbs', 'cups', 'cans', 'bottles', 'jars', 'bunches', 'each'];
  const unitSelect = unitOptions
    .map((u) => `<option value="${u}"${u === item.unit ? ' selected' : ''}>${u}</option>`)
    .join('');

  return `
    <div class="pantry-item" data-item-id="${escapeHTML(item.id)}" data-editing="true">
      <span class="pantry-item__name">${escapeHTML(item.ingredientName)}</span>
      <input type="number" class="pantry-item__quantity" data-field="quantity" value="${item.quantity}" min="0" step="1" style="width: 80px;">
      <select data-field="unit" style="padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.875rem;">
        ${unitSelect}
      </select>
      <label class="flex gap-1" style="align-items: center; cursor: pointer; font-size: 0.875rem;">
        <input type="checkbox" data-field="alwaysStocked" ${item.alwaysStocked ? 'checked' : ''}> Always Stocked
      </label>
      <button class="btn btn-sm btn-primary" data-action="save-edit" data-id="${escapeHTML(item.id)}">Save</button>
      <button class="btn btn-sm btn-secondary" data-action="cancel-edit" data-id="${escapeHTML(item.id)}">Cancel</button>
    </div>
  `;
}

/**
 * Group pantry items by category and build the full list HTML.
 */
function buildPantryListHTML(items) {
  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>Your pantry is empty.</p>
        <p class="text-sm">Add items above to track what you have on hand.</p>
      </div>
    `;
  }

  // Filter by search query
  let filtered = items;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = items.filter((item) =>
      item.ingredientName.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    return `
      <div class="empty-state">
        <p>No items match "${escapeHTML(searchQuery)}".</p>
        <p class="text-sm">Try a different search term.</p>
      </div>
    `;
  }

  // Group by category
  const groups = {};
  for (const item of filtered) {
    const cat = item.category || 'Other';
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(item);
  }

  // Sort categories alphabetically, but put "Other" last
  const sortedCategories = Object.keys(groups).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const cat of sortedCategories) {
    const catItems = groups[cat];
    // Sort items within category alphabetically
    catItems.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

    html += `
      <div class="shopping-category">
        <h3>${escapeHTML(cat)} <span class="badge badge-tag">${catItems.length} item${catItems.length !== 1 ? 's' : ''}</span></h3>
        ${catItems.map(buildPantryItemHTML).join('')}
      </div>
    `;
  }

  return html;
}

// ============================================================
// Render
// ============================================================

/**
 * Render just the pantry list section (preserving the add form and search bar).
 */
function renderPantryList() {
  const listEl = currentContainer
    ? currentContainer.querySelector('#pantry-list')
    : null;
  if (!listEl) return;

  const items = store.getPantryItems();
  listEl.innerHTML = buildPantryListHTML(items);

  // Update total count in heading
  const countEl = currentContainer
    ? currentContainer.querySelector('#pantry-total-count')
    : null;
  if (countEl) {
    countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Primary export. Renders the complete pantry page into the given container.
 *
 * @param {HTMLElement} container - The #app-content element.
 */
export function renderPantry(container) {
  currentContainer = container;
  const items = store.getPantryItems();
  const totalCount = items.length;

  container.innerHTML = `
    ${buildAddItemForm()}

    <div class="card">
      <h2>Your Pantry <span id="pantry-total-count" class="badge badge-tag">${totalCount} item${totalCount !== 1 ? 's' : ''}</span></h2>
      <div class="flex gap-1 mb-1">
        <input type="search" id="pantry-search" placeholder="Search pantry..." style="flex: 1;" value="${escapeHTML(searchQuery)}">
        <button class="btn btn-danger btn-sm" id="clear-all-pantry">Clear All</button>
      </div>
      <div id="pantry-list">
        ${buildPantryListHTML(items)}
      </div>
    </div>
  `;

  attachEvents(container);
}

// ============================================================
// Event handling
// ============================================================

function attachEvents(container) {
  // --- Add item button ---
  const addBtn = container.querySelector('#add-pantry-item');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      handleAddItem(container);
    });
  }

  // --- Enter key on ingredient input adds item ---
  const ingredientInput = container.querySelector('#pantry-ingredient');
  if (ingredientInput) {
    ingredientInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddItem(container);
      }
    });
  }

  // --- Search input (debounced) ---
  const searchInput = container.querySelector('#pantry-search');
  if (searchInput) {
    const debouncedSearch = debounce((value) => {
      searchQuery = value;
      renderPantryList();
    }, 250);

    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  // --- Clear All button ---
  const clearAllBtn = container.querySelector('#clear-all-pantry');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      const items = store.getPantryItems();
      if (items.length === 0) {
        showToast('Pantry is already empty', 'info');
        return;
      }

      const confirmed = confirm(
        `Are you sure you want to remove all ${items.length} items from your pantry?`
      );
      if (!confirmed) return;

      // Cancel any pending deletions
      for (const [, timeoutId] of pendingDeletions) {
        clearTimeout(timeoutId);
      }
      pendingDeletions.clear();

      store.savePantryItems([]);
      renderPantryList();
      showToast('Pantry cleared', 'info');
    });
  }

  // --- Event delegation on the pantry list ---
  const pantryList = container.querySelector('#pantry-list');
  if (pantryList) {
    pantryList.addEventListener('click', (e) => {
      const target = e.target;
      const actionEl = target.closest('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action;
      const id = actionEl.dataset.id;

      switch (action) {
        case 'edit-item':
          handleEditItem(id);
          break;
        case 'delete-item':
          handleDeleteItem(id);
          break;
        case 'save-edit':
          handleSaveEdit(id);
          break;
        case 'cancel-edit':
          handleCancelEdit(id);
          break;
      }
    });
  }
}

// ============================================================
// Action handlers
// ============================================================

/**
 * Read form inputs, validate, add item to store, clear form, re-render.
 */
function handleAddItem(container) {
  const nameInput = container.querySelector('#pantry-ingredient');
  const qtyInput = container.querySelector('#pantry-qty');
  const unitSelect = container.querySelector('#pantry-unit');
  const alwaysStockedCheckbox = container.querySelector('#pantry-always-stocked');

  const ingredientName = nameInput ? nameInput.value.trim() : '';
  if (!ingredientName) {
    showToast('Please enter an ingredient name', 'error');
    if (nameInput) nameInput.focus();
    return;
  }

  const quantity = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
  const unit = unitSelect ? unitSelect.value : 'each';
  const alwaysStocked = alwaysStockedCheckbox ? alwaysStockedCheckbox.checked : false;
  const category = getCategory(ingredientName);

  store.addPantryItem({
    ingredientName,
    quantity,
    unit,
    alwaysStocked,
    category,
  });

  // Clear form
  if (nameInput) {
    nameInput.value = '';
    nameInput.focus();
  }
  if (qtyInput) qtyInput.value = '1';
  if (unitSelect) unitSelect.value = 'g';
  if (alwaysStockedCheckbox) alwaysStockedCheckbox.checked = false;

  showToast(`Added "${ingredientName}" to pantry`, 'success');
  renderPantryList();
}

/**
 * Replace a pantry item row with inline edit fields.
 */
function handleEditItem(id) {
  const items = store.getPantryItems();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  const itemEl = currentContainer
    ? currentContainer.querySelector(`.pantry-item[data-item-id="${CSS.escape(id)}"]`)
    : null;
  if (!itemEl) return;

  itemEl.outerHTML = buildPantryItemEditHTML(item);
}

/**
 * Save edits from the inline edit form.
 */
function handleSaveEdit(id) {
  const itemEl = currentContainer
    ? currentContainer.querySelector(`.pantry-item[data-item-id="${CSS.escape(id)}"]`)
    : null;
  if (!itemEl) return;

  const qtyInput = itemEl.querySelector('[data-field="quantity"]');
  const unitSelect = itemEl.querySelector('[data-field="unit"]');
  const alwaysStockedCheckbox = itemEl.querySelector('[data-field="alwaysStocked"]');

  const quantity = qtyInput ? parseFloat(qtyInput.value) || 0 : 0;
  const unit = unitSelect ? unitSelect.value : 'each';
  const alwaysStocked = alwaysStockedCheckbox ? alwaysStockedCheckbox.checked : false;

  store.updatePantryItem(id, { quantity, unit, alwaysStocked });

  showToast('Item updated', 'success');
  renderPantryList();
}

/**
 * Cancel inline editing and re-render the list.
 */
function handleCancelEdit(id) {
  // Re-render the list to restore the original display
  renderPantryList();
}

/**
 * Delete an item with an undo window.
 * Removes from DOM immediately, waits 5 seconds before persisting the delete.
 * If user clicks Undo in the toast, cancel the deletion and re-render.
 */
async function handleDeleteItem(id) {
  const items = store.getPantryItems();
  const item = items.find((i) => i.id === id);
  if (!item) return;

  // Remove from DOM immediately
  const itemEl = currentContainer
    ? currentContainer.querySelector(`.pantry-item[data-item-id="${CSS.escape(id)}"]`)
    : null;
  if (itemEl) {
    itemEl.style.transition = 'opacity 0.2s ease, max-height 0.2s ease';
    itemEl.style.opacity = '0';
    setTimeout(() => {
      if (itemEl.parentNode) {
        itemEl.remove();
      }

      // Check if the parent category group is now empty and remove it
      if (currentContainer) {
        const categoryGroups = currentContainer.querySelectorAll('.shopping-category');
        for (const group of categoryGroups) {
          if (group.querySelectorAll('.pantry-item').length === 0) {
            group.remove();
          }
        }
      }
    }, 200);
  }

  // Cancel any existing pending deletion for this item
  if (pendingDeletions.has(id)) {
    clearTimeout(pendingDeletions.get(id));
    pendingDeletions.delete(id);
  }

  // Set up deletion timeout
  const timeoutId = setTimeout(() => {
    pendingDeletions.delete(id);
    store.removePantryItem(id);

    // Update total count
    const countEl = currentContainer
      ? currentContainer.querySelector('#pantry-total-count')
      : null;
    if (countEl) {
      const remaining = store.getPantryItems();
      countEl.textContent = `${remaining.length} item${remaining.length !== 1 ? 's' : ''}`;
    }
  }, 5000);

  pendingDeletions.set(id, timeoutId);

  // Show undo toast
  const undone = await showUndoToast(`"${item.ingredientName}" removed. Undo?`, 5000);

  if (undone) {
    // Cancel the deletion
    if (pendingDeletions.has(id)) {
      clearTimeout(pendingDeletions.get(id));
      pendingDeletions.delete(id);
    }
    showToast(`"${item.ingredientName}" restored`, 'success');
    renderPantryList();
  }
}
