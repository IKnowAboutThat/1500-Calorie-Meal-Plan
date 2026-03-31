/**
 * inventory.js - Inventory dashboard with tabbed views.
 *
 * Replaces the simple pantry page with a full inventory tracking system.
 * Three tabs: In Stock (by storage location), Expiring Soon, Always Stocked.
 */

import { ingredientCategories } from './data/recipes.js';
import { getRecipes } from './recipe-cache.js';
import * as store from './store.js';

async function getApp() {
  return await import('./app.js');
}

// ============================================================
// Helpers
// ============================================================

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Calculate days until expiry. Returns null if no expiry date.
 */
function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  return Math.ceil((expiry - now) / 86400000);
}

/**
 * Return CSS class for expiry badge.
 */
function expiryClass(daysLeft) {
  if (daysLeft === null) return 'expiry-none';
  if (daysLeft < 0) return 'expiry-expired';
  if (daysLeft <= 1) return 'expiry-red';
  if (daysLeft <= 4) return 'expiry-yellow';
  return 'expiry-green';
}

/**
 * Format days until expiry as human-readable text.
 */
function expiryLabel(daysLeft) {
  if (daysLeft === null) return 'No expiry';
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return 'Expires tomorrow';
  return `${daysLeft} days left`;
}

// ============================================================
// Module state
// ============================================================

let currentTab = 'in-stock';
let searchQuery = '';
let currentContainer = null;
let inventoryItems = [];
let pantryItems = [];

// ============================================================
// Data loading
// ============================================================

async function loadData() {
  try {
    inventoryItems = await store.getInventoryItems();
  } catch {
    inventoryItems = [];
  }
  pantryItems = store.getPantryItems();
}

// ============================================================
// Render
// ============================================================

export async function renderInventory(container) {
  currentContainer = container;
  await loadData();
  container.innerHTML = buildPage();
  attachEvents(container);
}

function buildPage() {
  const expiringCount = inventoryItems.filter(item => {
    const days = daysUntilExpiry(item.expiry_date);
    return days !== null && days <= 3;
  }).length;

  return `
    <h2 style="margin-bottom: 1rem;">Inventory</h2>

    <div class="flex gap-1" style="margin-bottom: 1rem;">
      <button class="btn btn-sm ${currentTab === 'in-stock' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="in-stock">
        In Stock
      </button>
      <button class="btn btn-sm ${currentTab === 'expiring' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="expiring">
        Expiring Soon ${expiringCount > 0 ? `<span class="badge" style="background: var(--color-danger, #c0392b); color: #fff; margin-left: 0.25rem;">${expiringCount}</span>` : ''}
      </button>
      <button class="btn btn-sm ${currentTab === 'always-stocked' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="always-stocked">
        Always Stocked
      </button>
    </div>

    <div class="card">
      <div class="flex gap-1 mb-1">
        <input type="search" id="inventory-search" placeholder="Search inventory..." style="flex: 1;" value="${escapeHTML(searchQuery)}">
        <button class="btn btn-sm btn-primary" data-action="add-item">+ Add Item</button>
      </div>
      <div id="inventory-list">
        ${buildTabContent()}
      </div>
    </div>
  `;
}

function buildTabContent() {
  switch (currentTab) {
    case 'in-stock': return buildInStockTab();
    case 'expiring': return buildExpiringTab();
    case 'always-stocked': return buildAlwaysStockedTab();
    default: return '';
  }
}

function buildInStockTab() {
  let items = inventoryItems;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => (i.ingredient_name || '').toLowerCase().includes(q));
  }

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>No items in inventory.</p>
        <p class="text-sm">Items are added when you check off shopping list items or add them manually.</p>
      </div>
    `;
  }

  // Group by storage_type
  const groups = { fridge: [], freezer: [], pantry: [] };
  for (const item of items) {
    const storage = item.storage_type || 'fridge';
    if (!groups[storage]) groups[storage] = [];
    groups[storage].push(item);
  }

  const storageLabels = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' };
  let html = '';

  for (const [storage, storageItems] of Object.entries(groups)) {
    if (storageItems.length === 0) continue;
    storageItems.sort((a, b) => (a.ingredient_name || '').localeCompare(b.ingredient_name || ''));

    html += `
      <div class="shopping-category">
        <h3>${storageLabels[storage] || storage} <span class="badge badge-tag">${storageItems.length}</span></h3>
        ${storageItems.map(buildInventoryItemHTML).join('')}
      </div>
    `;
  }

  return html;
}

function buildExpiringTab() {
  const expiring = inventoryItems
    .map(item => ({ ...item, _daysLeft: daysUntilExpiry(item.expiry_date) }))
    .filter(item => item._daysLeft !== null && item._daysLeft <= 3)
    .sort((a, b) => a._daysLeft - b._daysLeft);

  if (expiring.length === 0) {
    return `
      <div class="empty-state">
        <p>Nothing expiring soon.</p>
      </div>
    `;
  }

  return expiring.map(item => buildInventoryItemHTML(item)).join('');
}

function buildAlwaysStockedTab() {
  let items = pantryItems.filter(i => i.alwaysStocked);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => (i.ingredientName || '').toLowerCase().includes(q));
  }

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>No always-stocked items.</p>
        <p class="text-sm">These are pantry staples you always have on hand (salt, pepper, cooking oil, etc.)</p>
      </div>
    `;
  }

  return items.map(item => `
    <div class="pantry-item" data-pantry-id="${escapeHTML(item.id)}">
      <span class="pantry-item__name">${escapeHTML(item.ingredientName)}</span>
      <span class="pantry-item__qty">${escapeHTML(String(item.quantity || ''))}${escapeHTML(item.unit || '')}</span>
      <span class="badge badge-tag" style="background: var(--color-primary); color: #ffffff;">Always Stocked</span>
    </div>
  `).join('');
}

function buildInventoryItemHTML(item) {
  const daysLeft = item._daysLeft !== undefined ? item._daysLeft : daysUntilExpiry(item.expiry_date);
  const expClass = expiryClass(daysLeft);
  const expLabel = expiryLabel(daysLeft);
  const stateBadge = item.state && item.state !== 'raw'
    ? `<span class="badge badge-tag">${escapeHTML(item.state)}</span>`
    : '';

  return `
    <div class="pantry-item" data-inv-id="${item.id}">
      <span class="pantry-item__name">${escapeHTML(item.ingredient_name || '')}</span>
      <span class="pantry-item__qty">${item.quantity} ${escapeHTML(item.unit || 'g')}</span>
      ${stateBadge}
      <span class="badge ${expClass}">${expLabel}</span>
      <button class="btn btn-sm btn-secondary" data-action="edit-inv" data-id="${item.id}">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete-inv" data-id="${item.id}">&times;</button>
    </div>
  `;
}

// ============================================================
// Events
// ============================================================

function attachEvents(container) {
  container.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-action="set-tab"]');
    if (tabBtn) {
      currentTab = tabBtn.dataset.tab;
      renderInventory(container);
      return;
    }

    const addBtn = e.target.closest('[data-action="add-item"]');
    if (addBtn) {
      openAddItemModal();
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-inv"]');
    if (editBtn) {
      openEditModal(parseInt(editBtn.dataset.id, 10));
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete-inv"]');
    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      await store.deleteFromInventory(id);
      const { showToast } = await getApp();
      showToast('Item removed from inventory', 'info');
      await loadData();
      const listEl = container.querySelector('#inventory-list');
      if (listEl) listEl.innerHTML = buildTabContent();
      return;
    }
  });

  // Search
  const searchInput = container.querySelector('#inventory-search');
  if (searchInput) {
    const debouncedSearch = debounce((value) => {
      searchQuery = value;
      const listEl = container.querySelector('#inventory-list');
      if (listEl) listEl.innerHTML = buildTabContent();
    }, 250);
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
  }
}

async function openAddItemModal() {
  const { openModal } = await getApp();
  const { getIngredients } = await import('./api.js');
  const ingredients = await getIngredients();

  const options = ingredients
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => `<option value="${i.id}">${escapeHTML(i.name)}</option>`)
    .join('');

  const modalContent = document.getElementById('modal-content');
  openModal('');
  modalContent.innerHTML = `
    <h2>Add to Inventory</h2>
    <div class="form-group">
      <label>Ingredient</label>
      <select id="inv-ingredient">${options}</select>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>Quantity</label>
        <input type="number" id="inv-quantity" value="1" min="0" step="0.1">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Unit</label>
        <select id="inv-unit">
          <option value="g">g</option>
          <option value="oz">oz</option>
          <option value="lbs">lbs</option>
          <option value="count">count</option>
          <option value="cans">cans</option>
          <option value="cups">cups</option>
          <option value="ml">ml</option>
        </select>
      </div>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>State</label>
        <select id="inv-state">
          <option value="raw">Raw</option>
          <option value="cooked">Cooked</option>
          <option value="unopened">Unopened</option>
          <option value="opened">Opened</option>
          <option value="frozen">Frozen</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Storage</label>
        <select id="inv-storage">
          <option value="fridge">Fridge</option>
          <option value="freezer">Freezer</option>
          <option value="pantry">Pantry</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Expiry Date (optional)</label>
      <input type="date" id="inv-expiry">
    </div>
    <button class="btn btn-primary" id="inv-save">Add to Inventory</button>
  `;

  modalContent.querySelector('#inv-save').addEventListener('click', async () => {
    const data = {
      ingredient_id: parseInt(modalContent.querySelector('#inv-ingredient').value, 10),
      quantity: parseFloat(modalContent.querySelector('#inv-quantity').value) || 1,
      unit: modalContent.querySelector('#inv-unit').value,
      state: modalContent.querySelector('#inv-state').value,
      storage_type: modalContent.querySelector('#inv-storage').value,
      date_acquired: new Date().toISOString().slice(0, 10),
      expiry_date: modalContent.querySelector('#inv-expiry').value || null,
    };

    await store.addToInventory(data);
    const { closeModal, showToast } = await getApp();
    closeModal();
    showToast('Added to inventory', 'success');
    if (currentContainer) renderInventory(currentContainer);
  });
}

async function openEditModal(itemId) {
  const item = inventoryItems.find(i => i.id === itemId);
  if (!item) return;

  const { openModal } = await getApp();
  const modalContent = document.getElementById('modal-content');
  openModal('');

  modalContent.innerHTML = `
    <h2>Edit: ${escapeHTML(item.ingredient_name || '')}</h2>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>Quantity</label>
        <input type="number" id="inv-edit-qty" value="${item.quantity}" min="0" step="0.1">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Unit</label>
        <select id="inv-edit-unit">
          ${['g', 'oz', 'lbs', 'count', 'cans', 'cups', 'ml'].map(u =>
            `<option value="${u}"${u === item.unit ? ' selected' : ''}>${u}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>State</label>
        <select id="inv-edit-state">
          ${['raw', 'cooked', 'unopened', 'opened', 'frozen'].map(s =>
            `<option value="${s}"${s === item.state ? ' selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Storage</label>
        <select id="inv-edit-storage">
          ${['fridge', 'freezer', 'pantry'].map(s =>
            `<option value="${s}"${s === item.storage_type ? ' selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Expiry Date</label>
      <input type="date" id="inv-edit-expiry" value="${item.expiry_date || ''}">
    </div>
    <button class="btn btn-primary" id="inv-edit-save">Save Changes</button>
  `;

  modalContent.querySelector('#inv-edit-save').addEventListener('click', async () => {
    const updates = {
      quantity: parseFloat(modalContent.querySelector('#inv-edit-qty').value) || 0,
      unit: modalContent.querySelector('#inv-edit-unit').value,
      state: modalContent.querySelector('#inv-edit-state').value,
      storage_type: modalContent.querySelector('#inv-edit-storage').value,
      expiry_date: modalContent.querySelector('#inv-edit-expiry').value || null,
    };

    await store.updateInventory(itemId, updates);
    const { closeModal, showToast } = await getApp();
    closeModal();
    showToast('Inventory updated', 'success');
    if (currentContainer) renderInventory(currentContainer);
  });
}
