/**
 * meal-planner.js - Weekly meal planning grid with recipe assignment,
 * macro tracking, and week navigation.
 *
 * Exports a single render function consumed by the app router.
 */

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
 * Return the week ID for the week after the given one.
 */
function getNextWeekId(weekId) {
  const dates = getWeekDates(weekId);
  if (!dates.length) return weekId;
  const nextMonday = new Date(dates[0]);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return getISOWeekId(nextMonday);
}

/**
 * Return the week ID for the week before the given one.
 */
function getPrevWeekId(weekId) {
  const dates = getWeekDates(weekId);
  if (!dates.length) return weekId;
  const prevMonday = new Date(dates[0]);
  prevMonday.setDate(prevMonday.getDate() - 7);
  return getISOWeekId(prevMonday);
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
// Day key helpers
// ---------------------------------------------------------------------------

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---------------------------------------------------------------------------
// Phase detection helper
// ---------------------------------------------------------------------------

/**
 * Determine the phase for a specific calendar date based on stored cycle config.
 * Falls back to "standard" when no cycle start date is configured.
 */
function getPhaseForDate(date) {
  const config = store.getPhaseConfig();
  if (!config.cycleStartDate) return 'standard';

  const cycleStart = new Date(config.cycleStartDate + 'T00:00:00');
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((target - cycleStart) / 86400000);
  const cycleLen = config.cycleLength || 30;
  let dayOfCycle = ((diffDays % cycleLen) + cycleLen) % cycleLen;
  // dayOfCycle is 0-based; getDayPhase expects 1-based
  dayOfCycle = dayOfCycle + 1;
  return store.getDayPhase(dayOfCycle);
}

// ---------------------------------------------------------------------------
// Recipe lookup
// ---------------------------------------------------------------------------

/** Map recipe ID to its full data object. */
const recipesById = new Map();
for (const r of getRecipes()) {
  recipesById.set(r.id, r);
}

function getRecipeById(id) {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return recipesById.get(numId) || null;
}

// ---------------------------------------------------------------------------
// Plan creation / loading
// ---------------------------------------------------------------------------

/**
 * Create an empty week plan structure for the given weekId.
 */
function createEmptyPlan(weekId) {
  const dates = getWeekDates(weekId);
  const days = {};
  DAY_KEYS.forEach((key, idx) => {
    const date = dates[idx];
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const phase = getPhaseForDate(date);
    const mealSlots = store.getMealSlots(phase);
    days[key] = {
      date: dateStr,
      phase,
      slots: mealSlots.map(s => ({ slotName: s.name, recipeId: null })),
      extras: [],
    };
  });
  return { weekId, days };
}

// ---------------------------------------------------------------------------
// Extras helpers
// ---------------------------------------------------------------------------

function normalizeDayExtras(dayPlan) {
  if (!dayPlan.extras) dayPlan.extras = [];
  return dayPlan;
}

function getAdrenalExtra(dayPlan) {
  normalizeDayExtras(dayPlan);
  return dayPlan.extras.find(e => e.kind === 'adrenal') || null;
}

function setAdrenalExtra(dayPlan, recipeId, count) {
  normalizeDayExtras(dayPlan);
  const existing = dayPlan.extras.findIndex(e => e.kind === 'adrenal');
  if (existing !== -1) {
    dayPlan.extras[existing] = { kind: 'adrenal', recipeId, count };
  } else {
    dayPlan.extras.push({ kind: 'adrenal', recipeId, count });
  }
}

function removeAdrenalExtra(dayPlan) {
  normalizeDayExtras(dayPlan);
  dayPlan.extras = dayPlan.extras.filter(e => e.kind !== 'adrenal');
}

function applyAdrenalToWeek(plan, recipeId, count) {
  for (const key of DAY_KEYS) {
    setAdrenalExtra(plan.days[key], recipeId, count);
  }
}

function removeAdrenalFromWeek(plan) {
  for (const key of DAY_KEYS) {
    removeAdrenalExtra(plan.days[key]);
  }
}

/**
 * Load plan from server or create a fresh empty one.
 */
async function loadOrCreatePlan(weekId) {
  const existing = await store.getWeekPlan(weekId);
  if (existing) return existing;
  const plan = createEmptyPlan(weekId);
  await store.saveWeekPlan(weekId, plan);
  return plan;
}

// ---------------------------------------------------------------------------
// Macro math helpers
// ---------------------------------------------------------------------------

/**
 * Compute daily macro totals for a given day in the plan.
 * Adrenal cocktails are always added.
 */
function computeDayMacros(dayPlan) {
  let calories = 0;
  let protein = 0;
  let fiber = 0;

  for (const slot of dayPlan.slots) {
    if (slot.recipeId) {
      const recipe = getRecipeById(slot.recipeId);
      if (recipe) {
        calories += recipe.calories;
        protein += recipe.protein;
        fiber += recipe.fiber;
      }
    }
  }

  // Add extras (adrenal cocktails, etc.)
  for (const extra of (dayPlan.extras || [])) {
    const extraRecipe = getRecipeById(extra.recipeId);
    if (extraRecipe) {
      const count = extra.count || 1;
      calories += extraRecipe.calories * count;
      protein += extraRecipe.protein * count;
      fiber += extraRecipe.fiber * count;
    }
  }

  return { calories, protein, fiber };
}

/**
 * Get the CSS status class for a macro value relative to a target.
 */
function getMacroStatus(type, value) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;

  if (type === 'calories') {
    const diff = Math.abs(value - targets.calories);
    if (diff <= 50) return 'macro-status--good';
    if (diff <= 100) return 'macro-status--warn';
    return 'macro-status--bad';
  }
  if (type === 'protein') {
    const diff = Math.abs(value - targets.protein);
    if (diff <= 10) return 'macro-status--good';
    if (diff <= 20) return 'macro-status--warn';
    return 'macro-status--bad';
  }
  if (type === 'fiber') {
    if (value >= targets.fiberMin && value <= targets.fiberMax) return 'macro-status--good';
    if (value >= 25 && value <= 45) return 'macro-status--warn';
    return 'macro-status--bad';
  }
  return '';
}

/**
 * Determine whether a day is "on target" (all three macros in good range).
 */
function isDayOnTarget(macros) {
  return getMacroStatus('calories', macros.calories) === 'macro-status--good' &&
         getMacroStatus('protein', macros.protein) === 'macro-status--good' &&
         getMacroStatus('fiber', macros.fiber) === 'macro-status--good';
}

/**
 * Compute a percentage for a macro progress bar (capped at 120%).
 */
function macroPercent(type, value) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;
  let target;
  if (type === 'calories') target = targets.calories;
  else if (type === 'protein') target = targets.protein;
  else if (type === 'fiber') target = (targets.fiberMin + targets.fiberMax) / 2;
  else target = 100;
  return Math.min((value / target) * 100, 120);
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmtNum(n, decimals = 0) {
  if (decimals === 0) return Math.round(n).toLocaleString();
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/** Module-level state */
let currentWeekId = getISOWeekId(new Date());
let currentContainer = null;

/** Drag state — transient, never persisted */
let dragState = null; // { fromDayKey, fromSlotName, recipeId, cooked }

/**
 * Primary export. Renders the full meal planner UI into the given container.
 * Fetches plan from server on initial load, then uses localStorage for speed.
 */
export async function renderMealPlanner(container) {
  currentContainer = container;
  const plan = await loadOrCreatePlan(currentWeekId);
  const dates = getWeekDates(currentWeekId);

  container.innerHTML = `
    ${renderWeekNav(currentWeekId, dates)}
    <div class="planner-grid">
      ${DAY_KEYS.map((key, idx) => renderDay(key, idx, plan, dates[idx])).join('')}
    </div>
    ${renderWeeklySummary(plan)}
  `;

  attachEventListeners(container);
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

/**
 * Render the week navigation bar.
 */
function renderWeekNav(weekId, dates) {
  const monday = dates[0];
  const sunday = dates[6];
  const label = `Week of ${formatMonthDay(monday)} - ${formatMonthDay(sunday)}, ${sunday.getFullYear()}`;
  const todayWeekId = getISOWeekId(new Date());
  const isCurrent = weekId === todayWeekId;

  return `
    <div class="week-nav">
      <button class="btn btn-sm btn-secondary" data-action="prev-week" aria-label="Previous week">&larr;</button>
      <div style="text-align: center;">
        <div class="week-nav__label">${label}</div>
        <div class="text-sm text-secondary">${weekId}</div>
      </div>
      <button class="btn btn-sm btn-secondary" data-action="next-week" aria-label="Next week">&rarr;</button>
      ${isCurrent ? '' : `<button class="btn btn-sm btn-secondary" data-action="today-week">Today</button>`}
    </div>
    <div class="planner-toolbar" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; justify-content: flex-end;">
      <button class="btn btn-sm btn-primary" data-action="auto-plan">Auto Plan</button>
      <button class="btn btn-sm btn-secondary" data-action="templates">Templates</button>
      <button class="btn btn-sm btn-secondary" data-action="apply-adrenal">Apply Adrenal Cocktails</button>
      <button class="btn btn-sm btn-secondary" data-action="remove-adrenal">Remove Adrenal Cocktails</button>
    </div>
  `;
}

/**
 * Render a single day row.
 */
function renderDay(dayKey, dayIndex, plan, date) {
  const dayPlan = plan.days[dayKey];
  const phaseBadgeClass = dayPlan.phase === 'luteal' ? 'badge-phase-luteal' : 'badge-phase-standard';
  const phaseLabel = dayPlan.phase === 'luteal' ? 'Luteal' : 'Standard';
  const macros = computeDayMacros(dayPlan);

  return `
    <div class="planner-day card" data-day-key="${dayKey}">
      <div class="planner-day__label">
        <strong>${DAY_NAMES[dayIndex]}</strong>
        <span class="text-sm text-secondary">${formatMonthDay(date)}</span>
        <span class="badge ${phaseBadgeClass}">${phaseLabel}</span>
      </div>
      <div class="planner-day__slots">
        ${dayPlan.slots.map(slot => renderSlot(dayKey, slot)).join('')}
      </div>
      ${renderDayExtras(dayPlan)}
      <div class="planner-day__macros">
        ${renderDayMacros(macros)}
      </div>
    </div>
  `;
}

/**
 * Render a single meal slot (empty or filled).
 */
function renderSlot(dayKey, slot) {
  const recipe = slot.recipeId ? getRecipeById(slot.recipeId) : null;

  if (!recipe) {
    return `
      <div class="planner-slot planner-slot--empty" data-day="${dayKey}" data-slot="${slot.slotName}" data-action="pick-recipe">
        <span class="text-secondary">${slot.slotName}</span>
        <button class="btn btn-sm btn-secondary">+</button>
      </div>
    `;
  }

  const isCooked = slot.cooked;

  return `
    <div class="planner-slot planner-slot--filled${isCooked ? ' planner-slot--cooked' : ''}" data-day="${dayKey}" data-slot="${slot.slotName}">
      <div class="planner-slot__header">
        <span class="text-sm text-secondary">${slot.slotName}</span>
        <div style="display:flex;gap:0.25rem;">
          <button class="btn btn-sm btn-icon${isCooked ? ' planner-slot__cooked-btn--active' : ''}" data-action="mark-cooked" data-day="${dayKey}" data-slot="${slot.slotName}" data-recipe-id="${recipe.id}" title="${isCooked ? 'Already cooked' : 'Mark as cooked'}">&#x2713;</button>
          <button class="btn btn-sm btn-icon" data-action="swap-recipe" data-day="${dayKey}" data-slot="${slot.slotName}" title="Change recipe">&#x21bb;</button>
          <button class="btn btn-sm btn-icon" data-action="remove-recipe" data-day="${dayKey}" data-slot="${slot.slotName}" title="Remove">&times;</button>
        </div>
      </div>
      <div class="planner-slot__recipe-card" draggable="true" data-drag-day="${dayKey}" data-drag-slot="${slot.slotName}" data-drag-recipe-id="${recipe.id}" data-drag-cooked="${isCooked ? '1' : ''}">
        <strong class="planner-slot__name" data-action="view-recipe" data-recipe-id="${recipe.id}" style="cursor:pointer;" title="View recipe details">${recipe.name}</strong>
        <div class="planner-slot__macros">
          <span class="badge badge-cal">${fmtNum(recipe.calories)} cal</span>
          <span class="badge badge-protein">${fmtNum(recipe.protein, 1)}g P</span>
          <span class="badge badge-fiber">${fmtNum(recipe.fiber, 1)}g F</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the extras section for a day (adrenal cocktails, etc.).
 */
function renderDayExtras(dayPlan) {
  const extras = dayPlan.extras || [];
  if (extras.length === 0) return '';

  const items = extras.map(extra => {
    if (extra.kind === 'adrenal') {
      const recipe = getRecipeById(extra.recipeId);
      if (!recipe) return '';
      const count = extra.count || 1;
      const totalCal = Math.round(recipe.calories * count);
      const totalPro = (recipe.protein * count).toFixed(1);
      return `
        <div class="planner-day__extras-item" data-action="view-recipe" data-recipe-id="${recipe.id}" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; cursor: pointer; border-radius: var(--radius); transition: background-color var(--transition);" onmouseover="this.style.backgroundColor='rgba(74,124,89,0.1)'" onmouseout="this.style.backgroundColor=''">
          <span style="font-size: 0.8rem; color: var(--color-text-secondary);">${recipe.name} &times;${count}</span>
          <span class="badge badge-cal" style="font-size: 0.7rem; padding: 0.1rem 0.35rem;">${totalCal} cal</span>
          <span class="badge badge-protein" style="font-size: 0.7rem; padding: 0.1rem 0.35rem;">${totalPro}g P</span>
        </div>
      `;
    }
    return '';
  }).filter(Boolean).join('');

  if (!items) return '';

  return `
    <div class="planner-day__extras" style="padding: 0.25rem 0; border-top: 1px dashed var(--color-border); margin-top: 0.25rem;">
      <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); padding: 0.125rem 0.5rem; font-weight: 600;">Supplements</div>
      ${items}
    </div>
  `;
}

/**
 * Render macro totals + progress bars for a day.
 */
function renderDayMacros(macros) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;
  const calStatus = getMacroStatus('calories', macros.calories);
  const proStatus = getMacroStatus('protein', macros.protein);
  const fibStatus = getMacroStatus('fiber', macros.fiber);
  const calPct = macroPercent('calories', macros.calories);
  const proPct = macroPercent('protein', macros.protein);
  const fibPct = macroPercent('fiber', macros.fiber);

  return `
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.25rem;">
        <span class="macro-status ${calStatus}"></span>
        <span class="text-sm" style="min-width: 42px; font-weight: 600;">${fmtNum(macros.calories)}</span>
        <span class="text-sm text-secondary">/ ${fmtNum(targets.calories)} cal</span>
      </div>
      <div style="height: 4px; background: var(--color-border); border-radius: var(--radius-full); overflow: hidden;">
        <div style="height: 100%; width: ${calPct}%; background: linear-gradient(90deg, #c27044, #e8956a); border-radius: var(--radius-full); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 6px rgba(194,112,68,0.3);"></div>
      </div>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.25rem;">
        <span class="macro-status ${proStatus}"></span>
        <span class="text-sm" style="min-width: 42px; font-weight: 600;">${fmtNum(macros.protein, 0)}g</span>
        <span class="text-sm text-secondary">/ ${fmtNum(targets.protein)}g P</span>
      </div>
      <div style="height: 4px; background: var(--color-border); border-radius: var(--radius-full); overflow: hidden;">
        <div style="height: 100%; width: ${proPct}%; background: linear-gradient(90deg, #3d7c8c, #5ca8b8); border-radius: var(--radius-full); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 6px rgba(61,124,140,0.3);"></div>
      </div>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.25rem;">
        <span class="macro-status ${fibStatus}"></span>
        <span class="text-sm" style="min-width: 42px; font-weight: 600;">${fmtNum(macros.fiber, 0)}g</span>
        <span class="text-sm text-secondary">/ ${targets.fiberMin}-${targets.fiberMax}g F</span>
      </div>
      <div style="height: 4px; background: var(--color-border); border-radius: var(--radius-full); overflow: hidden;">
        <div style="height: 100%; width: ${fibPct}%; background: linear-gradient(90deg, #7c6fae, #a498d1); border-radius: var(--radius-full); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 6px rgba(124,111,174,0.3);"></div>
      </div>
    </div>
  `;
}

/**
 * Render the weekly summary card.
 */
function renderWeeklySummary(plan) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;
  let totalCal = 0;
  let totalProtein = 0;
  let totalFiber = 0;
  let daysOnTarget = 0;
  let daysWithFood = 0;

  for (const key of DAY_KEYS) {
    const dayPlan = plan.days[key];
    const macros = computeDayMacros(dayPlan);
    const hasRecipes = dayPlan.slots.some(s => s.recipeId);

    totalCal += macros.calories;
    totalProtein += macros.protein;
    totalFiber += macros.fiber;

    if (hasRecipes) {
      daysWithFood++;
      if (isDayOnTarget(macros)) {
        daysOnTarget++;
      }
    }
  }

  const divisor = daysWithFood || 1;
  const avgCal = Math.round(totalCal / divisor);
  const avgProtein = Math.round(totalProtein / divisor);
  const avgFiber = Math.round(totalFiber / divisor);

  return `
    <div class="card" style="margin-top: 1rem;">
      <h3>Weekly Summary</h3>
      <div class="dashboard-stats">
        <div class="stat-card">
          <div class="stat-card__value">${avgCal.toLocaleString()}</div>
          <div class="stat-card__label">Avg Daily Cal</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${avgProtein}g</div>
          <div class="stat-card__label">Avg Daily Protein</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${avgFiber}g</div>
          <div class="stat-card__label">Avg Daily Fiber</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${daysOnTarget}/${daysWithFood || 7}</div>
          <div class="stat-card__label">Days On Target</div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Recipe Picker Modal
// ---------------------------------------------------------------------------

/**
 * Open the recipe picker modal for a specific day + slot.
 */
async function openRecipePicker(dayKey, slotName) {
  const { openModal, closeModal } = await getApp();

  const modalId = 'recipe-picker-modal';

  const modalHTML = `
    <div id="${modalId}">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h2 style="margin: 0;">Choose Recipe</h2>
        <button class="modal-close" data-action="close-modal">&times;</button>
      </div>
      <p class="text-sm text-secondary" style="margin-top: 0;">
        Assigning to <strong>${slotName}</strong> on <strong>${DAY_NAMES[DAY_KEYS.indexOf(dayKey)]}</strong>
      </p>
      <input type="text" id="recipe-picker-search" class="input" placeholder="Search recipes..." style="width: 100%; margin-bottom: 0.75rem;" />
      <div id="recipe-picker-filters" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
        <button class="btn btn-sm btn-secondary recipe-filter-btn recipe-filter-btn--active" data-filter="all">All</button>
        <button class="btn btn-sm btn-secondary recipe-filter-btn" data-filter="meal">Meals</button>
        <button class="btn btn-sm btn-secondary recipe-filter-btn" data-filter="snack">Snacks</button>
        <button class="btn btn-sm btn-secondary recipe-filter-btn" data-filter="favorites">Favorites</button>
      </div>
      <div id="recipe-picker-list" style="max-height: 50vh; overflow-y: auto;">
        ${renderRecipeList(getRecipes(),'all', '')}
      </div>
    </div>
  `;

  openModal(modalHTML);

  // Attach interactive listeners within the modal
  const modalEl = document.getElementById(modalId);
  if (!modalEl) return;

  const searchInput = document.getElementById('recipe-picker-search');
  const listEl = document.getElementById('recipe-picker-list');
  const filtersEl = document.getElementById('recipe-picker-filters');

  let activeFilter = 'all';

  // Search handler
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value;
      listEl.innerHTML = renderRecipeList(getRecipes(),activeFilter, query);
    });
    // Focus the search input
    searchInput.focus();
  }

  // Filter buttons
  if (filtersEl) {
    filtersEl.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.recipe-filter-btn');
      if (!filterBtn) return;
      activeFilter = filterBtn.dataset.filter;
      // Update active button styling
      filtersEl.querySelectorAll('.recipe-filter-btn').forEach(b => {
        b.classList.toggle('recipe-filter-btn--active', b.dataset.filter === activeFilter);
        b.classList.toggle('btn-primary', b.dataset.filter === activeFilter);
        b.classList.toggle('btn-secondary', b.dataset.filter !== activeFilter);
      });
      const query = searchInput ? searchInput.value : '';
      listEl.innerHTML = renderRecipeList(getRecipes(),activeFilter, query);
    });
  }

  // Recipe selection
  if (listEl) {
    listEl.addEventListener('click', async (e) => {
      const item = e.target.closest('[data-recipe-id]');
      if (!item) return;
      const recipeId = item.dataset.recipeId;
      closeModal();
      await assignRecipe(dayKey, slotName, recipeId);
    });
  }

  // Close button inside modal
  modalEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-modal"]')) {
      closeModal();
    }
  });
}

/**
 * Render the filterable list of recipes for the picker modal.
 */
function renderRecipeList(allRecipes, filter, searchQuery) {
  let filtered = [...allRecipes];
  const query = (searchQuery || '').trim().toLowerCase();

  // Apply type filter
  if (filter === 'meal') {
    filtered = filtered.filter(r => r.mealType === 'meal');
  } else if (filter === 'snack') {
    filtered = filtered.filter(r => r.mealType === 'snack');
  } else if (filter === 'favorites') {
    const favIds = store.getFavorites();
    filtered = filtered.filter(r => favIds.includes(r.id));
  }

  // Apply search query
  if (query) {
    filtered = filtered.filter(r => {
      return r.name.toLowerCase().includes(query) ||
             (r.cuisine && r.cuisine.toLowerCase().includes(query)) ||
             (r.mainProtein && r.mainProtein.toLowerCase().includes(query));
    });
  }

  if (filtered.length === 0) {
    return `<div class="empty-state"><p>No recipes found</p></div>`;
  }

  return filtered.map(r => {
    const isFav = store.isFavorite(r.id);
    return `
      <div class="recipe-picker-item" data-recipe-id="${r.id}" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        margin-bottom: 0.5rem;
        cursor: pointer;
        transition: background-color var(--transition);
      " onmouseover="this.style.backgroundColor='rgba(74,124,89,0.15)'" onmouseout="this.style.backgroundColor=''">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 0.95rem;">${r.name}</strong>
            ${isFav ? '<span style="color: var(--color-accent);" title="Favorite">&#9829;</span>' : ''}
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.375rem; flex-wrap: wrap;">
            <span class="badge badge-cal">${r.calories} cal</span>
            <span class="badge badge-protein">${fmtNum(r.protein, 1)}g P</span>
            <span class="badge badge-fiber">${fmtNum(r.fiber, 1)}g F</span>
            ${r.cuisine ? `<span class="badge" style="background: var(--color-bg-subtle); color: var(--color-primary-dark); border: 1px solid var(--color-border); border-radius: var(--radius-full);">${r.cuisine}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------------------------------------------------------------------------
// Plan mutation helpers
// ---------------------------------------------------------------------------

/**
 * Assign a recipe to a day + slot, persist, and re-render.
 */
async function assignRecipe(dayKey, slotName, recipeId) {
  const numericId = typeof recipeId === 'string' ? parseInt(recipeId, 10) : recipeId;
  const plan = await loadOrCreatePlan(currentWeekId);
  const dayPlan = plan.days[dayKey];
  if (!dayPlan) return;

  const slot = dayPlan.slots.find(s => s.slotName === slotName);
  if (slot) {
    slot.recipeId = numericId;
  }

  await store.saveWeekPlan(currentWeekId, plan);

  if (currentContainer) {
    await renderMealPlanner(currentContainer);
  }

  const recipe = getRecipeById(recipeId);
  const app = await getApp();
  if (recipe) {
    app.showToast(`Added "${recipe.name}" to ${slotName}`, 'success');
  }
}

/**
 * Remove a recipe from a day + slot, persist, and re-render.
 */
async function removeRecipe(dayKey, slotName) {
  const plan = await loadOrCreatePlan(currentWeekId);
  const dayPlan = plan.days[dayKey];
  if (!dayPlan) return;

  const slot = dayPlan.slots.find(s => s.slotName === slotName);
  if (slot) {
    slot.recipeId = null;
  }

  await store.saveWeekPlan(currentWeekId, plan);

  if (currentContainer) {
    await renderMealPlanner(currentContainer);
  }

  const app = await getApp();
  app.showToast(`Removed recipe from ${slotName}`, 'info');
}

/**
 * Move a recipe from one slot to another, or swap two recipes if the
 * target slot is already filled. Persists and re-renders.
 */
async function moveOrSwapRecipe(fromDayKey, fromSlotName, toDayKey, toSlotName) {
  // No-op: dropped on self
  if (fromDayKey === toDayKey && fromSlotName === toSlotName) return;

  const plan = await loadOrCreatePlan(currentWeekId);

  const srcDay = plan.days[fromDayKey];
  if (!srcDay) throw new Error(`moveOrSwapRecipe: invalid source day "${fromDayKey}"`);
  const srcSlot = srcDay.slots.find(s => s.slotName === fromSlotName);
  if (!srcSlot) throw new Error(`moveOrSwapRecipe: invalid source slot "${fromSlotName}" on day "${fromDayKey}"`);
  if (!srcSlot.recipeId) throw new Error(`moveOrSwapRecipe: source slot "${fromSlotName}" on "${fromDayKey}" has no recipe`);

  const dstDay = plan.days[toDayKey];
  if (!dstDay) throw new Error(`moveOrSwapRecipe: invalid destination day "${toDayKey}"`);
  const dstSlot = dstDay.slots.find(s => s.slotName === toSlotName);
  if (!dstSlot) throw new Error(`moveOrSwapRecipe: invalid destination slot "${toSlotName}" on day "${toDayKey}"`);

  const srcRecipeId = srcSlot.recipeId;
  const srcCooked = srcSlot.cooked || false;
  const dstRecipeId = dstSlot.recipeId;
  const dstCooked = dstSlot.cooked || false;
  const isSwap = !!dstRecipeId;

  // Perform swap or move
  dstSlot.recipeId = srcRecipeId;
  dstSlot.cooked = srcCooked;

  if (isSwap) {
    srcSlot.recipeId = dstRecipeId;
    srcSlot.cooked = dstCooked;
  } else {
    srcSlot.recipeId = null;
    srcSlot.cooked = false;
  }

  await store.saveWeekPlan(currentWeekId, plan);

  if (currentContainer) {
    await renderMealPlanner(currentContainer);
  }

  const app = await getApp();
  const srcRecipe = getRecipeById(srcRecipeId);
  const srcName = srcRecipe ? srcRecipe.name : 'Recipe';

  if (isSwap) {
    const dstRecipe = getRecipeById(dstRecipeId);
    const dstName = dstRecipe ? dstRecipe.name : 'Recipe';
    app.showToast(`Swapped "${srcName}" ↔ "${dstName}"`, 'success');
  } else {
    app.showToast(`Moved "${srcName}" to ${toSlotName}`, 'success');
  }
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

/** Named handlers so we can remove before re-adding (prevents stacking). */
let _clickHandler = null;
let _dragstartHandler = null;
let _dragendHandler = null;
let _dragoverHandler = null;
let _dragleaveHandler = null;
let _dropHandler = null;

/**
 * Resolve the nearest slot root element from an event target.
 * Throws if no slot root is found.
 */
function resolveSlotRoot(el) {
  const slotEl = el.closest('.planner-slot');
  if (!slotEl) throw new Error('resolveSlotRoot: no .planner-slot ancestor found');
  const day = slotEl.dataset.day;
  const slot = slotEl.dataset.slot;
  if (!day || !slot) throw new Error(`resolveSlotRoot: missing data-day or data-slot on slot element`);
  return { el: slotEl, day, slot };
}

/**
 * Attach all click and interaction handlers to the container using
 * event delegation for efficient, leak-free listening.
 */
function attachEventListeners(container) {
  // --- Remove stale handlers ---
  if (_clickHandler) container.removeEventListener('click', _clickHandler);
  if (_dragstartHandler) container.removeEventListener('dragstart', _dragstartHandler);
  if (_dragendHandler) container.removeEventListener('dragend', _dragendHandler);
  if (_dragoverHandler) container.removeEventListener('dragover', _dragoverHandler);
  if (_dragleaveHandler) container.removeEventListener('dragleave', _dragleaveHandler);
  if (_dropHandler) container.removeEventListener('drop', _dropHandler);

  // --- Drag event handlers ---

  _dragstartHandler = (e) => {
    const card = e.target.closest('.planner-slot__recipe-card');
    if (!card) return;

    dragState = {
      fromDayKey: card.dataset.dragDay,
      fromSlotName: card.dataset.dragSlot,
      recipeId: card.dataset.dragRecipeId,
      cooked: card.dataset.dragCooked === '1',
    };

    card.classList.add('planner-slot__recipe-card--dragging');

    // Set drag data (required for Firefox)
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  _dragendHandler = (e) => {
    // Clear dragging class from any card
    const dragging = container.querySelector('.planner-slot__recipe-card--dragging');
    if (dragging) dragging.classList.remove('planner-slot__recipe-card--dragging');

    // Clear all drop-over highlights
    container.querySelectorAll('.planner-slot--drop-over').forEach(el => {
      el.classList.remove('planner-slot--drop-over');
    });

    dragState = null;
  };

  _dragoverHandler = (e) => {
    if (!dragState) return;

    const slotEl = e.target.closest('.planner-slot');
    if (!slotEl) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Add visual highlight if not already present
    if (!slotEl.classList.contains('planner-slot--drop-over')) {
      // Clear previous highlights first
      container.querySelectorAll('.planner-slot--drop-over').forEach(el => {
        el.classList.remove('planner-slot--drop-over');
      });
      slotEl.classList.add('planner-slot--drop-over');
    }
  };

  _dragleaveHandler = (e) => {
    const slotEl = e.target.closest('.planner-slot');
    if (!slotEl) return;

    // Only remove highlight if we're actually leaving the slot (not entering a child)
    const relatedSlot = e.relatedTarget ? e.relatedTarget.closest('.planner-slot') : null;
    if (relatedSlot !== slotEl) {
      slotEl.classList.remove('planner-slot--drop-over');
    }
  };

  _dropHandler = async (e) => {
    e.preventDefault();
    if (!dragState) throw new Error('drop handler fired but dragState is null');

    const slotEl = e.target.closest('.planner-slot');
    if (!slotEl) throw new Error('drop handler: could not find target .planner-slot');

    const toDayKey = slotEl.dataset.day;
    const toSlotName = slotEl.dataset.slot;
    if (!toDayKey || !toSlotName) throw new Error(`drop handler: target slot missing data-day="${toDayKey}" or data-slot="${toSlotName}"`);

    // Clear visual state
    container.querySelectorAll('.planner-slot--drop-over').forEach(el => {
      el.classList.remove('planner-slot--drop-over');
    });

    const { fromDayKey, fromSlotName } = dragState;
    dragState = null;

    await moveOrSwapRecipe(fromDayKey, fromSlotName, toDayKey, toSlotName);
  };

  container.addEventListener('dragstart', _dragstartHandler);
  container.addEventListener('dragend', _dragendHandler);
  container.addEventListener('dragover', _dragoverHandler);
  container.addEventListener('dragleave', _dragleaveHandler);
  container.addEventListener('drop', _dropHandler);

  _clickHandler = async (e) => {
    const target = e.target;

    // ---- Week navigation ----
    if (target.closest('[data-action="prev-week"]')) {
      currentWeekId = getPrevWeekId(currentWeekId);
      await renderMealPlanner(container);
      return;
    }

    if (target.closest('[data-action="next-week"]')) {
      currentWeekId = getNextWeekId(currentWeekId);
      await renderMealPlanner(container);
      return;
    }

    if (target.closest('[data-action="today-week"]')) {
      currentWeekId = getISOWeekId(new Date());
      await renderMealPlanner(container);
      return;
    }

    // ---- Auto Plan ----
    if (target.closest('[data-action="auto-plan"]')) {
      const { openModal, closeModal } = await getApp();
      const { renderAutoPlanner } = await import('./auto-plan.js');
      const modalContent = document.getElementById('modal-content');
      openModal('');
      renderAutoPlanner(modalContent, currentWeekId, async () => {
        await renderMealPlanner(container);
      });
      return;
    }

    // ---- Templates ----
    if (target.closest('[data-action="templates"]')) {
      const { openModal, closeModal } = await getApp();
      const { renderTemplatesPanel } = await import('./week-templates.js');
      const modalContent = document.getElementById('modal-content');
      openModal('');
      renderTemplatesPanel(modalContent, currentWeekId, async () => {
        await renderMealPlanner(container);
      });
      return;
    }

    // ---- Apply Adrenal Cocktails ----
    if (target.closest('[data-action="apply-adrenal"]')) {
      const settings = store.getSettings();
      const recipeId = settings.adrenalRecipeId;
      const count = settings.adrenalCountPerDay || 2;
      const { showToast } = await getApp();
      if (!recipeId) {
        showToast('Select an adrenal cocktail recipe in Settings first', 'warning');
        return;
      }
      const plan = await loadOrCreatePlan(currentWeekId);
      applyAdrenalToWeek(plan, recipeId, count);
      await store.saveWeekPlan(currentWeekId, plan);
      await renderMealPlanner(container);
      showToast('Adrenal cocktails applied to all days', 'success');
      return;
    }

    // ---- Remove Adrenal Cocktails ----
    if (target.closest('[data-action="remove-adrenal"]')) {
      const plan = await loadOrCreatePlan(currentWeekId);
      removeAdrenalFromWeek(plan);
      await store.saveWeekPlan(currentWeekId, plan);
      await renderMealPlanner(container);
      const { showToast } = await getApp();
      showToast('Adrenal cocktails removed from all days', 'info');
      return;
    }

    // ---- Mark as cooked (checkmark button on filled slot) ----
    const cookedBtn = target.closest('[data-action="mark-cooked"]');
    if (cookedBtn) {
      e.stopPropagation();
      const dayKey = cookedBtn.dataset.day;
      const slotName = cookedBtn.dataset.slot;
      const recipeId = cookedBtn.dataset.recipeId;

      const plan = await loadOrCreatePlan(currentWeekId);
      const dayPlan = plan.days[dayKey];
      if (!dayPlan) return;

      const slot = dayPlan.slots.find((s) => s.slotName === slotName);
      if (!slot || !slot.recipeId) return;

      if (slot.cooked) {
        const { showToast } = await getApp();
        showToast('Already marked as cooked', 'info');
        return;
      }

      slot.cooked = true;
      await store.saveWeekPlan(currentWeekId, plan);

      const newCount = store.incrementCookCount(recipeId);
      const recipe = getRecipeById(recipeId);

      // Deduct ingredients from inventory (non-blocking)
      let deductions = [];
      try {
        const result = await store.deductRecipeInventory(parseInt(recipeId, 10));
        deductions = result.deductions || [];
      } catch (err) {
        console.warn('[meal-planner] Inventory deduction failed:', err);
      }

      if (currentContainer) {
        await renderMealPlanner(currentContainer);
      }

      const { showToast } = await getApp();
      const name = recipe ? recipe.name : 'Recipe';

      if (deductions.length > 0) {
        const deductionSummary = deductions
          .filter(d => d.amount_deducted > 0)
          .map(d => `${d.amount_deducted}${d.unit} ${d.ingredient_name}`)
          .join(', ');
        if (deductionSummary) {
          showToast(`"${name}" cooked! Removed: ${deductionSummary}`, 'success');
        } else {
          showToast(`"${name}" marked as cooked! (${newCount} total)`, 'success');
        }
      } else {
        showToast(`"${name}" marked as cooked! (${newCount} total)`, 'success');
      }
      return;
    }

    // ---- Remove recipe (must check before pick-recipe to avoid bubbling) ----
    const removeBtn = target.closest('[data-action="remove-recipe"]');
    if (removeBtn) {
      e.stopPropagation();
      const dayKey = removeBtn.dataset.day;
      const slotName = removeBtn.dataset.slot;
      await removeRecipe(dayKey, slotName);
      return;
    }

    // ---- Swap recipe (↻ button on filled slot → opens picker) ----
    const swapBtn = target.closest('[data-action="swap-recipe"]');
    if (swapBtn) {
      e.stopPropagation();
      const dayKey = swapBtn.dataset.day;
      const slotName = swapBtn.dataset.slot;
      openRecipePicker(dayKey, slotName);
      return;
    }

    // ---- View recipe detail (clicking recipe name in filled slot) ----
    const viewEl = target.closest('[data-action="view-recipe"]');
    if (viewEl) {
      e.stopPropagation();
      const recipeId = viewEl.dataset.recipeId;
      if (recipeId) {
        const { openRecipeModal } = await import('./recipe-library.js');
        openRecipeModal(recipeId);
      }
      return;
    }

    // ---- Pick recipe (clicking on empty slot) ----
    const slotEl = target.closest('[data-action="pick-recipe"]');
    if (slotEl) {
      const dayKey = slotEl.dataset.day;
      const slotName = slotEl.dataset.slot;
      openRecipePicker(dayKey, slotName);
      return;
    }
  };

  container.addEventListener('click', _clickHandler);
}
