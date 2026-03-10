/**
 * shopping-list.js - Shopping list generator module for the Meal Planning app.
 *
 * Aggregates ingredients from a selected week plan, groups by category,
 * subtracts pantry items, and renders an interactive, checkable shopping list
 * with copy-to-clipboard, print, and clear-checked functionality.
 *
 * Exports a single render function consumed by the app router.
 */

import { ingredientCategories } from './data/recipes.js';
import { getRecipes } from './recipe-cache.js';
import * as store from './store.js';

// ---------------------------------------------------------------------------
// Dynamic import for app utilities (avoids circular deps)
// ---------------------------------------------------------------------------

async function getApp() {
  return await import('./app.js');
}

// ---------------------------------------------------------------------------
// ISO Week Utilities (local copies to avoid circular dependencies)
// ---------------------------------------------------------------------------

/**
 * Compute the ISO 8601 week ID for a given date, e.g. "2026-W10".
 */
function getISOWeekId(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Parse a week ID and return 7 Date objects (Mon-Sun).
 */
function getWeekDates(weekId) {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return dates;
}

/**
 * Format a Date as a short string, e.g. "Mon 3/6".
 */
function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Format a Date as a month-day label, e.g. "Mar 6".
 */
function formatMonthDay(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Preferred display order for categories. */
const CATEGORY_ORDER = [
  'Proteins',
  'Legumes',
  'Produce',
  'Grains',
  'Sauces & Condiments',
  'Pantry / Spices',
  'Other',
];

// ---------------------------------------------------------------------------
// Recipe lookup
// ---------------------------------------------------------------------------

const recipesById = new Map();
for (const r of getRecipes()) {
  recipesById.set(r.id, r);
}

function getRecipeById(id) {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return recipesById.get(numId) || null;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let currentWeekId = getISOWeekId(new Date());
let mode = 'full-week'; // 'full-week' | 'select-days'
let selectedDays = new Set(DAY_KEYS); // all days selected by default
let subtractPantry = true;
let generatedList = null; // { categories: Map<string, item[]>, recipeCount, totalBefore, totalAfter }
let expandedSources = new Set(); // ingredient keys with visible source list
let currentContainer = null;

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Primary export. Renders the shopping list page into the given container.
 * @param {HTMLElement} container
 */
export async function renderShoppingList(container) {
  currentContainer = container;

  // Reset generated list on fresh render
  generatedList = null;
  expandedSources = new Set();

  // Default to current week
  const allWeekIds = await store.getAllWeekPlanIds();
  if (allWeekIds.length > 0 && !allWeekIds.includes(currentWeekId)) {
    // If current week has no plan, default to the most recent planned week
    currentWeekId = allWeekIds[allWeekIds.length - 1];
  }

  container.innerHTML = await buildPageHTML();
  attachEventListeners(container);
}

// ---------------------------------------------------------------------------
// Full page HTML builder
// ---------------------------------------------------------------------------

async function buildPageHTML() {
  const allWeekIds = await store.getAllWeekPlanIds();

  return `
    <h2 style="margin-bottom: 1rem;">Shopping List</h2>

    <div class="card">
      ${buildModeSelector()}
      ${buildDaySelector()}
      ${buildWeekSelector(allWeekIds)}
      ${buildPantryToggle()}
      ${buildGenerateButton(allWeekIds)}
    </div>

    <div id="shopping-list-output">
      ${generatedList ? buildShoppingListOutput() : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Sub-renderers: Controls
// ---------------------------------------------------------------------------

function buildModeSelector() {
  const fullActive = mode === 'full-week';
  return `
    <div style="margin-bottom: 1rem;">
      <label class="text-sm fw-bold" style="margin-bottom: 0.5rem; display: block;">Select Days</label>
      <div class="flex gap-1">
        <button class="btn btn-sm ${fullActive ? 'btn-primary' : 'btn-secondary'}" data-action="set-mode" data-mode="full-week">Full Week</button>
        <button class="btn btn-sm ${!fullActive ? 'btn-primary' : 'btn-secondary'}" data-action="set-mode" data-mode="select-days">Select Days</button>
      </div>
    </div>
  `;
}

function buildDaySelector() {
  if (mode !== 'select-days') return '';

  const dates = getWeekDates(currentWeekId);
  if (dates.length === 0) return '';

  const checkboxes = DAY_KEYS.map((key, idx) => {
    const checked = selectedDays.has(key) ? 'checked' : '';
    const dateLabel = formatDate(dates[idx]);
    return `
      <label style="display: inline-flex; align-items: center; gap: 0.375rem; margin-right: 0.75rem; cursor: pointer; font-size: 0.875rem;">
        <input type="checkbox" data-action="toggle-day" data-day="${key}" ${checked}>
        ${dateLabel}
      </label>
    `;
  }).join('');

  return `
    <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--color-bg-subtle, #efece6); border-radius: var(--radius);">
      <div class="flex flex-wrap gap-1">
        ${checkboxes}
      </div>
    </div>
  `;
}

function buildWeekSelector(allWeekIds) {
  if (allWeekIds.length === 0) {
    return `
      <div style="margin-bottom: 1rem;">
        <label class="text-sm fw-bold" style="margin-bottom: 0.25rem; display: block;">Week</label>
        <span class="text-sm text-secondary">No week plans available</span>
      </div>
    `;
  }

  const options = allWeekIds.map(wid => {
    const dates = getWeekDates(wid);
    const rangeLabel = dates.length >= 7
      ? `${formatMonthDay(dates[0])} - ${formatMonthDay(dates[6])}`
      : wid;
    const selected = wid === currentWeekId ? ' selected' : '';
    return `<option value="${wid}"${selected}>${wid} (${rangeLabel})</option>`;
  }).join('');

  return `
    <div style="margin-bottom: 1rem;">
      <label class="text-sm fw-bold" style="margin-bottom: 0.25rem; display: block;">Week</label>
      <select id="shopping-week-select" style="width: auto; min-width: 240px;">
        ${options}
      </select>
    </div>
  `;
}

function buildPantryToggle() {
  return `
    <div style="margin-bottom: 1rem;">
      <label style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem; font-weight: 600;">
        <input type="checkbox" id="pantry-subtract-toggle" ${subtractPantry ? 'checked' : ''}>
        Subtract pantry items
      </label>
    </div>
  `;
}

function buildGenerateButton(allWeekIds) {
  const disabled = allWeekIds.length === 0 ? ' disabled' : '';
  return `
    <button class="btn btn-primary" id="generate-shopping-list"${disabled}>Generate Shopping List</button>
  `;
}

// ---------------------------------------------------------------------------
// Sub-renderers: Shopping List Output
// ---------------------------------------------------------------------------

function buildShoppingListOutput() {
  if (!generatedList) return '';

  const { categories, recipeCount, totalBefore, totalAfter } = generatedList;

  if (recipeCount === 0) {
    return `
      <div class="empty-state">
        <p>No meals planned for this week.</p>
        <p class="text-sm">Visit the <a href="#planner">Planner</a> to add recipes.</p>
      </div>
    `;
  }

  if (totalAfter === 0 && subtractPantry) {
    return `
      <div class="card" style="margin-top: 1rem;">
        <div class="empty-state">
          <p>All ingredients are covered by your pantry.</p>
          <p class="text-sm">Nothing to buy this week!</p>
        </div>
        ${buildSummaryStats(recipeCount, totalBefore, totalAfter)}
      </div>
    `;
  }

  // Build category sections
  const categoryHTML = buildCategorySections(categories);

  return `
    <div style="margin-top: 1rem;">
      ${buildActionButtons()}
      <div class="shopping-list" id="shopping-list-items">
        ${categoryHTML}
      </div>
      ${buildSummaryStats(recipeCount, totalBefore, totalAfter)}
    </div>
  `;
}

function buildActionButtons() {
  return `
    <div class="flex gap-1 flex-wrap" style="margin-bottom: 1rem;">
      <button class="btn btn-sm btn-secondary" data-action="copy-to-clipboard" title="Copy list as plain text">Copy to Clipboard</button>
      <button class="btn btn-sm btn-secondary" data-action="print-list" title="Print the shopping list">Print List</button>
      <button class="btn btn-sm btn-secondary" data-action="clear-checked" title="Uncheck all items">Clear Checked</button>
    </div>
  `;
}

function buildCategorySections(categories) {
  const checkedItems = store.getShoppingChecked(currentWeekId);
  let html = '';

  // Sort categories by defined order
  const sortedCategories = [...categories.entries()].sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a[0]);
    const idxB = CATEGORY_ORDER.indexOf(b[0]);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  for (const [categoryName, items] of sortedCategories) {
    if (items.length === 0) continue;

    const itemsHTML = items.map(item => {
      const ingredientKey = item.normalizedName;
      const isChecked = checkedItems.includes(ingredientKey);
      const checkedClass = isChecked ? ' shopping-item--checked' : '';
      const checkedAttr = isChecked ? ' checked' : '';
      const displayName = capitalizeIngredient(item.normalizedName);
      const qtyLabel = formatQuantity(item.totalAmount, item.unit, item.normalizedName);
      const isExpanded = expandedSources.has(ingredientKey);

      let sourcesHTML = '';
      if (isExpanded && item.recipes.length > 0) {
        const sourceList = item.recipes.map(r => escapeHtml(r)).join(', ');
        sourcesHTML = `
          <div class="text-sm text-secondary" style="padding: 0.25rem 0 0.25rem 2rem; font-style: italic;">
            Used in: ${sourceList}
          </div>
        `;
      }

      return `
        <div class="shopping-item${checkedClass}" data-ingredient="${escapeHtml(ingredientKey)}">
          <input type="checkbox" class="shopping-item__checkbox" data-action="toggle-check" data-ingredient="${escapeHtml(ingredientKey)}"${checkedAttr}>
          <span class="shopping-item__name">${escapeHtml(displayName)}</span>
          <span class="shopping-item__quantity">${escapeHtml(qtyLabel)}</span>
          <button class="btn btn-sm btn-icon" data-action="show-sources" data-ingredient="${escapeHtml(ingredientKey)}" title="Show recipes">i</button>
        </div>
        ${sourcesHTML}
      `;
    }).join('');

    html += `
      <div class="shopping-category">
        <h3>${escapeHtml(categoryName)}</h3>
        ${itemsHTML}
      </div>
    `;
  }

  return html;
}

function buildSummaryStats(recipeCount, totalBefore, totalAfter) {
  return `
    <div class="card" style="margin-top: 1rem;">
      <div class="dashboard-stats" style="margin-bottom: 0;">
        <div class="stat-card">
          <div class="stat-card__value">${recipeCount}</div>
          <div class="stat-card__label">Recipes Included</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${totalBefore}</div>
          <div class="stat-card__label">Total Unique Ingredients</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${totalAfter}</div>
          <div class="stat-card__label">Items After Pantry</div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Ingredient aggregation logic
// ---------------------------------------------------------------------------

/**
 * Aggregate ingredients from the selected week plan and days,
 * apply pantry subtraction if enabled, and group by category.
 */
async function generateShoppingListData() {
  const plan = await store.getWeekPlan(currentWeekId);

  if (!plan || !plan.days) {
    return { categories: new Map(), recipeCount: 0, totalBefore: 0, totalAfter: 0 };
  }

  // Determine which days to include
  const daysToInclude = mode === 'full-week' ? DAY_KEYS : [...selectedDays];

  // Collect all recipe IDs from selected days
  const recipeIds = new Set();
  const recipeIdList = [];

  for (const dayKey of daysToInclude) {
    const dayPlan = plan.days[dayKey];
    if (!dayPlan || !dayPlan.slots) continue;

    for (const slot of dayPlan.slots) {
      if (slot.recipeId) {
        recipeIds.add(slot.recipeId);
        recipeIdList.push(slot.recipeId);
      }
    }
  }

  if (recipeIds.size === 0) {
    return { categories: new Map(), recipeCount: 0, totalBefore: 0, totalAfter: 0 };
  }

  // Build ingredient aggregation map
  // Key: normalized name (lowercase, trimmed)
  // Value: { totalAmount, unit, recipes: Set<string> }
  const ingredientMap = new Map();

  for (const rid of recipeIdList) {
    const recipe = getRecipeById(rid);
    if (!recipe || !recipe.ingredients) continue;

    for (const ing of recipe.ingredients) {
      const key = ing.name.toLowerCase().trim();
      if (ingredientMap.has(key)) {
        const existing = ingredientMap.get(key);
        existing.totalAmount += ing.amount;
        existing.recipes.add(recipe.name);
      } else {
        ingredientMap.set(key, {
          totalAmount: ing.amount,
          unit: ing.unit,
          recipes: new Set([recipe.name]),
        });
      }
    }
  }

  const totalBefore = ingredientMap.size;

  // Apply pantry subtraction
  if (subtractPantry) {
    const pantryItems = store.getPantryItems();

    for (const pantryItem of pantryItems) {
      const pantryKey = (pantryItem.ingredientName || '').toLowerCase().trim();
      if (!pantryKey) continue;

      if (ingredientMap.has(pantryKey)) {
        if (pantryItem.alwaysStocked) {
          // Always stocked items are removed entirely
          ingredientMap.delete(pantryKey);
        } else if (pantryItem.quantity && pantryItem.quantity > 0) {
          const entry = ingredientMap.get(pantryKey);
          const needed = Math.max(0, entry.totalAmount - pantryItem.quantity);
          if (needed === 0) {
            ingredientMap.delete(pantryKey);
          } else {
            entry.totalAmount = needed;
          }
        }
      }
    }
  }

  const totalAfter = ingredientMap.size;

  // Group by category
  const categories = new Map();

  for (const [key, data] of ingredientMap) {
    const category = ingredientCategories[key] || 'Other';

    if (!categories.has(category)) {
      categories.set(category, []);
    }

    categories.get(category).push({
      normalizedName: key,
      totalAmount: data.totalAmount,
      unit: data.unit,
      recipes: [...data.recipes].sort(),
    });
  }

  // Sort ingredients within each category alphabetically
  for (const [, items] of categories) {
    items.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
  }

  return {
    categories,
    recipeCount: recipeIds.size,
    totalBefore,
    totalAfter,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Capitalize first letter of each word in an ingredient name.
 */
function capitalizeIngredient(name) {
  return name.replace(/(^|\s|[(-])(\w)/g, (match, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });
}

// ---------------------------------------------------------------------------
// Grocery unit conversions – grams → practical shopping amounts
// ---------------------------------------------------------------------------

/** Convert a decimal to a human-friendly unicode fraction string. */
function toFraction(value) {
  if (value <= 0) return '0';
  const whole = Math.floor(value);
  const frac = value - whole;
  const FRACS = [
    [0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'],
    [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'],
    [0.75, '¾'], [0.875, '⅞'], [1, ''],
  ];
  let best = FRACS[0];
  let minD = 2;
  for (const f of FRACS) {
    const d = Math.abs(frac - f[0]);
    if (d < minD) { minD = d; best = f; }
  }
  if (best[0] >= 1) return `${whole + 1}`;
  if (best[1] === '') {
    if (whole > 0) return `${whole}`;
    return '⅛'; // minimum visible fraction
  }
  return whole > 0 ? `${whole}${best[1]}` : best[1];
}

/**
 * Mapping: lowercase ingredient name → grocery conversion info.
 *   unit    – singular display label
 *   grams   – grams per 1 of that unit
 *   plural  – optional plural label (used when qty > 1)
 *   roundUp – if true, Math.ceil the result (for count-based items)
 */
const GROCERY_CONVERSIONS = {
  // ── Proteins ──────────────────────────────────────────────────────────────
  'chicken breast':             { unit: 'lb', grams: 454 },
  'chicken breast, cooked':     { unit: 'lb', grams: 454 },
  'ground turkey, 93% lean':    { unit: 'lb', grams: 454 },
  'turkey breast, roasted':     { unit: 'lb', grams: 454 },
  'turkey breast, sliced':      { unit: 'lb', grams: 454 },
  'salmon fillet':              { unit: 'fillet (6 oz)', grams: 170, plural: 'fillets (6 oz)', roundUp: true },
  'shrimp, cooked':             { unit: 'lb', grams: 454 },
  'canned tuna in water':       { unit: 'can (5 oz)', grams: 142, plural: 'cans (5 oz)', roundUp: true },
  'egg whites':                 { unit: 'egg', grams: 33, plural: 'eggs', roundUp: true },
  'whole egg (1)':              { unit: 'egg', grams: 50, plural: 'eggs', roundUp: true },
  'whole eggs (approx 1.5)':    { unit: 'egg', grams: 50, plural: 'eggs', roundUp: true },
  'whole eggs (approx 2)':      { unit: 'egg', grams: 50, plural: 'eggs', roundUp: true },
  'whole eggs (approx 2.5)':    { unit: 'egg', grams: 50, plural: 'eggs', roundUp: true },

  // ── Produce (sold by count) ───────────────────────────────────────────────
  'avocado':                    { unit: 'avocado', grams: 150, plural: 'avocados', roundUp: true },
  'sweet potato':               { unit: 'sweet potato', grams: 150, plural: 'sweet potatoes', roundUp: true },
  'bell pepper':                { unit: 'pepper', grams: 150, plural: 'peppers', roundUp: true },
  'bell pepper, roasted':       { unit: 'pepper', grams: 150, plural: 'peppers', roundUp: true },
  'bell pepper shells (2 peppers, roasted + eaten)': { unit: 'pepper', grams: 150, plural: 'peppers', roundUp: true },
  'onion':                      { unit: 'onion', grams: 150, plural: 'onions', roundUp: true },
  'cucumber':                   { unit: 'cucumber', grams: 300, plural: 'cucumbers', roundUp: true },
  'eggplant, roasted':          { unit: 'eggplant', grams: 300, plural: 'eggplants', roundUp: true },
  'zucchini':                   { unit: 'zucchini', grams: 200, plural: 'zucchini', roundUp: true },
  'zucchini, roasted':          { unit: 'zucchini', grams: 200, plural: 'zucchini', roundUp: true },
  'zucchini noodles':           { unit: 'zucchini', grams: 200, plural: 'zucchini', roundUp: true },
  'fresh mango':                { unit: 'mango', grams: 200, plural: 'mangos', roundUp: true },
  'celery':                     { unit: 'stalk', grams: 40, plural: 'stalks', roundUp: true },

  // ── Produce (sold by weight / bag) ────────────────────────────────────────
  'broccoli':                   { unit: 'lb', grams: 454 },
  'broccoli, roasted':          { unit: 'lb', grams: 454 },
  'baby spinach':               { unit: 'oz', grams: 28 },
  'romaine lettuce':            { unit: 'head', grams: 300, plural: 'heads', roundUp: true },
  'butter lettuce':             { unit: 'head', grams: 150, plural: 'heads', roundUp: true },
  'endive':                     { unit: 'head', grams: 150, plural: 'heads', roundUp: true },
  'bok choy':                   { unit: 'bunch', grams: 300, plural: 'bunches', roundUp: true },
  'asparagus':                  { unit: 'bunch', grams: 450, plural: 'bunches', roundUp: true },
  'snap peas':                  { unit: 'oz', grams: 28 },
  'mushrooms':                  { unit: 'oz', grams: 28 },
  'shredded cabbage':           { unit: 'cup', grams: 90, plural: 'cups' },
  'shredded carrot':            { unit: 'cup', grams: 110, plural: 'cups' },
  'cauliflower rice':           { unit: 'bag (12 oz)', grams: 340, plural: 'bags (12 oz)', roundUp: true },
  'diced tomato':               { unit: 'can (14.5 oz)', grams: 411, plural: 'cans (14.5 oz)', roundUp: true },

  // ── Legumes ───────────────────────────────────────────────────────────────
  'black beans, cooked':        { unit: 'can (15 oz)', grams: 260, plural: 'cans (15 oz)', roundUp: true },
  'chickpeas, cooked':          { unit: 'can (15 oz)', grams: 260, plural: 'cans (15 oz)', roundUp: true },
  'green lentils, cooked':      { unit: 'cup', grams: 200, plural: 'cups' },
  'red lentils, cooked':        { unit: 'cup', grams: 200, plural: 'cups' },
  'edamame, shelled':           { unit: 'cup', grams: 155, plural: 'cups' },

  // ── Grains ────────────────────────────────────────────────────────────────
  'quinoa, cooked':             { unit: 'cup', grams: 185, plural: 'cups' },
  'brown rice, cooked':         { unit: 'cup', grams: 195, plural: 'cups' },

  // ── Oils ──────────────────────────────────────────────────────────────────
  'olive oil':                  { unit: 'tbsp', grams: 14 },
  'sesame oil':                 { unit: 'tsp', grams: 5 },

  // ── Citrus juice → whole fruit count ──────────────────────────────────────
  'lime juice':                 { unit: 'lime', grams: 30, plural: 'limes', roundUp: true },
  'lemon juice':                { unit: 'lemon', grams: 45, plural: 'lemons', roundUp: true },

  // ── Liquids / Vinegar ─────────────────────────────────────────────────────
  'coconut aminos':             { unit: 'tbsp', grams: 15 },
  'rice vinegar':               { unit: 'tbsp', grams: 15 },

  // ── Pastes & Sauces ───────────────────────────────────────────────────────
  'gf miso paste':              { unit: 'tbsp', grams: 18 },
  'tahini':                     { unit: 'tbsp', grams: 15 },
  'hummus (gf)':                { unit: 'tbsp', grams: 15 },
  'tomato paste':               { unit: 'tbsp', grams: 16 },
  'tomato paste (gf)':          { unit: 'tbsp', grams: 16 },
  'dijon mustard (gf)':         { unit: 'tsp', grams: 5 },
  'gf bbq sauce':               { unit: 'tbsp', grams: 17 },
  'gf salsa verde':             { unit: 'tbsp', grams: 16 },
  'gf salsa roja':              { unit: 'tbsp', grams: 16 },
  'hot sauce':                  { unit: 'tsp', grams: 5 },
  'gf cocktail sauce':          { unit: 'tbsp', grams: 17 },
  'gf curry paste':             { unit: 'tbsp', grams: 16 },
  'gf thai chili paste':        { unit: 'tsp', grams: 5 },
  'gf tikka masala paste':      { unit: 'tbsp', grams: 16 },
  'gf tikka paste':             { unit: 'tbsp', grams: 16 },
  'gf fish sauce':              { unit: 'tsp', grams: 5 },
  'harissa paste (gf)':         { unit: 'tbsp', grams: 15 },
  'aji amarillo paste (gf)':    { unit: 'tbsp', grams: 15 },
  'gochujang (gf)':             { unit: 'tbsp', grams: 17 },
  'guacamole':                  { unit: 'tbsp', grams: 15 },
  'gf tamarind paste + chili + garlic + scallion': { unit: 'tbsp', grams: 15 },
  'kalamata olives':            { unit: 'olive', grams: 4, plural: 'olives', roundUp: true },
  'chimichurri sauce (gf)':     { unit: 'tbsp', grams: 15 },
  'chimichurri sauce (gf): parsley, cilantro, olive oil, garlic, vinegar': { unit: 'tbsp', grams: 15 },
  'coconut yogurt (unsweetened) + dill + garlic \u2014 dairy-free tzatziki': { unit: 'tbsp', grams: 15 },
  'coconut yogurt + dill + garlic \u2014 dairy-free tzatziki': { unit: 'tbsp', grams: 15 },

  // ── Spice blends ──────────────────────────────────────────────────────────
  'baharat spice blend (gf)':   { unit: 'tsp', grams: 3 },
  'shawarma spices (gf)':       { unit: 'tsp', grams: 3 },
  'pickled ginger, scallion':   { unit: 'tbsp', grams: 10 },
};

/**
 * Format a quantity for display using grocery-friendly units.
 * Falls back to tbsp for small compound-spice amounts, or grams for unknowns.
 */
function formatQuantity(amount, unit, ingredientName) {
  const key = (ingredientName || '').toLowerCase().trim();
  const conv = GROCERY_CONVERSIONS[key];

  if (conv) {
    const converted = amount / conv.grams;

    if (conv.roundUp) {
      const rounded = Math.ceil(converted);
      const label = rounded === 1 ? conv.unit : (conv.plural || conv.unit);
      return `${rounded} ${label}`;
    }

    const fracStr = toFraction(converted);
    const label = converted > 1.06 && conv.plural ? conv.plural : conv.unit;
    return `${fracStr} ${label}`;
  }

  // Fallback: compound spice / herb blends → tbsp
  if (key.includes(',') && amount <= 50) {
    const tbsp = amount / 15;
    return tbsp <= 1 ? '1 tbsp' : `${toFraction(tbsp)} tbsp`;
  }

  // Default: keep original grams
  const rounded = amount % 1 === 0 ? amount : Math.round(amount * 10) / 10;
  return `${rounded}${unit}`;
}

/**
 * Generate a plain-text version of the shopping list for clipboard / print.
 */
function generatePlainText() {
  if (!generatedList || !generatedList.categories) return '';

  const checkedItems = store.getShoppingChecked(currentWeekId);
  const lines = [];

  const sortedCategories = [...generatedList.categories.entries()].sort((a, b) => {
    const idxA = CATEGORY_ORDER.indexOf(a[0]);
    const idxB = CATEGORY_ORDER.indexOf(b[0]);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  for (const [categoryName, items] of sortedCategories) {
    if (items.length === 0) continue;

    lines.push(categoryName.toUpperCase());

    for (const item of items) {
      const isChecked = checkedItems.includes(item.normalizedName);
      const checkMark = isChecked ? '\u2611' : '\u2610';
      const displayName = capitalizeIngredient(item.normalizedName);
      const qtyLabel = formatQuantity(item.totalAmount, item.unit, item.normalizedName);
      lines.push(`${checkMark} ${displayName} - ${qtyLabel}`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

function attachEventListeners(container) {
  container.addEventListener('click', handleClick);
  container.addEventListener('change', handleChange);
}

async function handleClick(e) {
  const target = e.target;

  // Mode selector
  const modeBtn = target.closest('[data-action="set-mode"]');
  if (modeBtn) {
    const newMode = modeBtn.dataset.mode;
    if (newMode !== mode) {
      mode = newMode;
      if (mode === 'full-week') {
        selectedDays = new Set(DAY_KEYS);
      }
      rerender();
    }
    return;
  }

  // Generate button
  if (target.closest('#generate-shopping-list')) {
    generatedList = await generateShoppingListData();
    rerenderOutput();
    return;
  }

  // Copy to clipboard
  if (target.closest('[data-action="copy-to-clipboard"]')) {
    const text = generatePlainText();
    try {
      await navigator.clipboard.writeText(text);
      const app = await getApp();
      app.showToast('Shopping list copied to clipboard!', 'success');
    } catch {
      // Fallback: select + copy
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      const app = await getApp();
      app.showToast('Shopping list copied to clipboard!', 'success');
    }
    return;
  }

  // Print list
  if (target.closest('[data-action="print-list"]')) {
    window.print();
    return;
  }

  // Clear checked
  if (target.closest('[data-action="clear-checked"]')) {
    store.saveShoppingChecked(currentWeekId, []);
    rerenderOutput();
    const app = await getApp();
    app.showToast('All items unchecked', 'info');
    return;
  }

  // Show sources (toggle)
  const sourceBtn = target.closest('[data-action="show-sources"]');
  if (sourceBtn) {
    const ingredientKey = sourceBtn.dataset.ingredient;
    if (expandedSources.has(ingredientKey)) {
      expandedSources.delete(ingredientKey);
    } else {
      expandedSources.add(ingredientKey);
    }
    rerenderOutput();
    return;
  }
}

function handleChange(e) {
  const target = e.target;

  // Day checkbox toggle
  if (target.dataset.action === 'toggle-day') {
    const dayKey = target.dataset.day;
    if (target.checked) {
      selectedDays.add(dayKey);
    } else {
      selectedDays.delete(dayKey);
    }
    return;
  }

  // Week selector
  if (target.id === 'shopping-week-select') {
    currentWeekId = target.value;
    // Reset generated list when week changes
    generatedList = null;
    expandedSources = new Set();
    rerender();
    return;
  }

  // Pantry subtraction toggle
  if (target.id === 'pantry-subtract-toggle') {
    subtractPantry = target.checked;
    return;
  }

  // Shopping item checkbox toggle
  if (target.dataset.action === 'toggle-check') {
    const ingredientKey = target.dataset.ingredient;
    const checked = store.getShoppingChecked(currentWeekId);

    if (target.checked) {
      if (!checked.includes(ingredientKey)) {
        checked.push(ingredientKey);
      }
    } else {
      const idx = checked.indexOf(ingredientKey);
      if (idx !== -1) {
        checked.splice(idx, 1);
      }
    }

    store.saveShoppingChecked(currentWeekId, checked);

    // Update visual state without full re-render for smoother UX
    const itemEl = target.closest('.shopping-item');
    if (itemEl) {
      itemEl.classList.toggle('shopping-item--checked', target.checked);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Re-render helpers
// ---------------------------------------------------------------------------

/**
 * Full re-render of the entire page into the container.
 */
async function rerender() {
  if (!currentContainer) return;
  currentContainer.innerHTML = await buildPageHTML();
  attachEventListeners(currentContainer);
}

/**
 * Re-render only the output section (the generated list).
 */
function rerenderOutput() {
  if (!currentContainer) return;
  const outputEl = currentContainer.querySelector('#shopping-list-output');
  if (outputEl) {
    outputEl.innerHTML = generatedList ? buildShoppingListOutput() : '';
  }
}
