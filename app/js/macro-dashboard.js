/**
 * macro-dashboard.js - Macro tracking dashboard with weekly overview,
 * calorie bar chart, daily breakdown cards, and adrenal cocktail tracking.
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

/**
 * Format a Date as "YYYY-MM-DD".
 */
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ABBREVS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Recipe lookup
// ---------------------------------------------------------------------------

const recipesById = new Map();
for (const r of getRecipes()) {
  recipesById.set(r.id, r);
}

function getRecipeById(id) {
  return recipesById.get(id) || null;
}

// ---------------------------------------------------------------------------
// Macro math helpers
// ---------------------------------------------------------------------------

/**
 * Compute macros contributed by a day's extras (e.g. adrenal cocktails).
 */
function computeExtrasMacros(dayPlan) {
  let calories = 0, protein = 0, fiber = 0;
  const extras = dayPlan.extras || [];
  for (const extra of extras) {
    if (extra.recipeId) {
      const recipe = getRecipeById(extra.recipeId);
      if (recipe) {
        const count = extra.count || 1;
        calories += recipe.calories * count;
        protein += recipe.protein * count;
        fiber += recipe.fiber * count;
      }
    }
  }
  return { calories, protein, fiber };
}

/**
 * Compute daily macro totals for a given day in the plan.
 * Extras (adrenal cocktails, etc.) are included from the plan's extras array.
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

  // Add extras (adrenal cocktails, etc.) from plan
  const extrasMacros = computeExtrasMacros(dayPlan);
  calories += extrasMacros.calories;
  protein += extrasMacros.protein;
  fiber += extrasMacros.fiber;

  return { calories, protein, fiber };
}

/**
 * Check whether a day has at least one recipe assigned.
 */
function dayHasRecipes(dayPlan) {
  return dayPlan.slots.some(s => s.recipeId);
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
 * Determine whether a day is "on target" using the wider dashboard thresholds:
 * calories within +/-100, protein within +/-20, fiber 25-45.
 */
function isDayOnTarget(macros) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;
  const calOk = Math.abs(macros.calories - targets.calories) <= 100;
  const proOk = Math.abs(macros.protein - targets.protein) <= 20;
  const fibOk = macros.fiber >= 25 && macros.fiber <= 45;
  return calOk && proOk && fibOk;
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
// Phase detection helper
// ---------------------------------------------------------------------------

/**
 * Determine the phase for a specific calendar date based on stored cycle config.
 */
function getPhaseForDate(date) {
  const config = store.getPhaseConfig();
  if (!config.cycleStartDate) return 'standard';
  const cycleStart = new Date(config.cycleStartDate + 'T00:00:00');
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((target - cycleStart) / 86400000);
  const cycleLen = config.cycleLength || 30;
  let dayOfCycle = ((diffDays % cycleLen) + cycleLen) % cycleLen;
  dayOfCycle = dayOfCycle + 1;
  return store.getDayPhase(dayOfCycle);
}

// ---------------------------------------------------------------------------
// Chart styles (injected as <style> since these are unique to the dashboard)
// ---------------------------------------------------------------------------

const CHART_STYLES = `
<style id="dashboard-chart-styles">
  .dashboard-chart-area {
    display: flex;
    justify-content: space-around;
    align-items: flex-end;
    height: 250px;
    position: relative;
    border-bottom: 2px solid var(--color-border);
    padding: 0 1rem;
  }
  .chart-bar-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    z-index: 1;
  }
  .chart-bar {
    width: 40px;
    border-radius: var(--radius) var(--radius) 0 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    min-height: 4px;
    transition: height 0.3s var(--ease-out);
    position: relative;
  }
  .chart-bar__value {
    font-size: 0.7rem;
    font-weight: 700;
    color: #ffffff;
    padding-top: 4px;
    white-space: nowrap;
  }
  .chart-bar__value--above {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    color: var(--color-text);
    padding-top: 0;
    padding-bottom: 2px;
  }
  .chart-bar__label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .chart-bar__detail {
    font-size: 0.7rem;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .chart-target-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 2px dashed var(--color-warning);
    z-index: 0;
    pointer-events: none;
  }
  .chart-target-line__label {
    position: absolute;
    right: 4px;
    top: -16px;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--color-warning);
  }
</style>
`;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let currentWeekId = getISOWeekId(new Date());
let currentContainer = null;

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Primary export. Renders the full macro dashboard UI into the given container.
 */
export async function renderDashboard(container) {
  currentContainer = container;

  const plan = await store.getWeekPlan(currentWeekId);
  const dates = getWeekDates(currentWeekId);
  const settings = store.getSettings();
  const targets = settings.dailyTargets;

  // Inject chart styles if not already present
  const stylesHtml = document.getElementById('dashboard-chart-styles') ? '' : CHART_STYLES;

  // If no plan exists, check if we should show empty state
  if (!plan) {
    container.innerHTML = `
      ${stylesHtml}
      ${renderWeekNav(currentWeekId, dates)}
      ${renderEmptyState()}
    `;
    attachEventListeners(container);
    return;
  }

  // Collect per-day data
  const dayData = collectDayData(plan, dates);

  // Check if any day has recipes
  const anyMealsPlanned = dayData.some(d => d.hasRecipes);

  if (!anyMealsPlanned) {
    container.innerHTML = `
      ${stylesHtml}
      ${renderWeekNav(currentWeekId, dates)}
      ${renderEmptyState()}
    `;
    attachEventListeners(container);
    return;
  }

  container.innerHTML = `
    ${stylesHtml}
    ${renderWeekNav(currentWeekId, dates)}
    ${renderWeeklyOverview(dayData, targets)}
    ${renderBarChart(dayData, targets)}
    ${dayData.map(d => renderDayCard(d, targets)).join('')}
  `;

  attachEventListeners(container);
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

/**
 * Collect all data needed for each day of the week.
 */
function collectDayData(plan, dates) {
  return DAY_KEYS.map((key, idx) => {
    const dayPlan = plan.days[key];
    const date = dates[idx];
    const dateStr = toDateStr(date);
    const hasRecipes = dayHasRecipes(dayPlan);
    const macros = computeDayMacros(dayPlan);
    const phase = dayPlan.phase || getPhaseForDate(date);

    // Collect individual meal info
    const meals = dayPlan.slots
      .filter(s => s.recipeId)
      .map(s => {
        const recipe = getRecipeById(s.recipeId);
        return recipe ? { slotName: s.slotName, recipe } : null;
      })
      .filter(Boolean);

    // Collect extras info for display
    const extras = (dayPlan.extras || []).map(extra => {
      const recipe = extra.recipeId ? getRecipeById(extra.recipeId) : null;
      return { ...extra, recipe };
    }).filter(e => e.recipe);

    return {
      key,
      index: idx,
      date,
      dateStr,
      dayName: DAY_NAMES[idx],
      dayAbbrev: DAY_ABBREVS[idx],
      phase,
      hasRecipes,
      macros,
      meals,
      extras,
      dayPlan,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

/**
 * Render the week navigation bar (matches planner style).
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
      ${isCurrent ? '' : '<button class="btn btn-sm btn-secondary" data-action="today-week">Today</button>'}
    </div>
  `;
}

/**
 * Render the empty state message.
 */
function renderEmptyState() {
  return `
    <div class="empty-state">
      <p>No meals planned for this week.</p>
      <p>Go to the Planner to get started!</p>
      <a href="#planner" class="btn btn-primary mt-1">Open Planner</a>
    </div>
  `;
}

/**
 * Render the weekly overview summary cards.
 */
function renderWeeklyOverview(dayData, targets) {
  const daysWithFood = dayData.filter(d => d.hasRecipes);
  const divisor = daysWithFood.length || 1;

  let totalCal = 0;
  let totalProtein = 0;
  let totalFiber = 0;
  let daysOnTarget = 0;
  let totalMeals = 0;
  let totalExtras = 0;

  for (const d of dayData) {
    if (d.hasRecipes) {
      totalCal += d.macros.calories;
      totalProtein += d.macros.protein;
      totalFiber += d.macros.fiber;
      if (isDayOnTarget(d.macros)) {
        daysOnTarget++;
      }
    }
    totalMeals += d.meals.length;
    for (const extra of d.extras) {
      totalExtras += extra.count || 1;
    }
  }

  const avgCal = Math.round(totalCal / divisor);
  const avgProtein = Math.round(totalProtein / divisor);
  const avgFiber = Math.round(totalFiber / divisor);

  return `
    <div class="dashboard-stats">
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #c27044, #e8956a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${avgCal.toLocaleString()}</div>
        <div class="stat-card__label">Avg Daily Calories</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #3d7c8c, #5ca8b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${avgProtein}g</div>
        <div class="stat-card__label">Avg Daily Protein</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #7c6fae, #a498d1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${avgFiber}g</div>
        <div class="stat-card__label">Avg Daily Fiber</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #4a7c59, #6aab7b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${daysOnTarget}/${daysWithFood.length || 7}</div>
        <div class="stat-card__label">Days On Target</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #4a7c59, #6aab7b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${totalExtras}</div>
        <div class="stat-card__label">Extras Planned</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value" style="background: linear-gradient(135deg, #4a7c59, #6aab7b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${totalMeals}</div>
        <div class="stat-card__label">Meals Planned</div>
      </div>
    </div>
  `;
}

/**
 * Render the weekly calorie bar chart (CSS/HTML only).
 */
function renderBarChart(dayData, targets) {
  const maxCal = 2000;
  const chartHeight = 200; // px max bar height
  const targetLineBottom = (targets.calories / maxCal) * chartHeight;

  const barsHtml = dayData.map(d => {
    if (!d.hasRecipes) {
      return `
        <div class="chart-bar-group">
          <div class="chart-bar" style="height: 4px; background: var(--color-border-light);">
            <span class="chart-bar__value chart-bar__value--above">---</span>
          </div>
          <div class="chart-bar__label">${d.dayAbbrev}</div>
          <div class="chart-bar__detail">--</div>
        </div>
      `;
    }

    const barHeight = Math.max(4, (d.macros.calories / maxCal) * chartHeight);
    // If bar is too short (< 30px), show value above the bar
    const showAbove = barHeight < 30;

    return `
      <div class="chart-bar-group">
        <div class="chart-bar" style="height: ${barHeight}px; background: linear-gradient(180deg, #c27044, #e8956a); box-shadow: 0 0 8px rgba(194,112,68,0.3);">
          <span class="chart-bar__value${showAbove ? ' chart-bar__value--above' : ''}">${fmtNum(d.macros.calories)}</span>
        </div>
        <div class="chart-bar__label">${d.dayAbbrev}</div>
        <div class="chart-bar__detail">${fmtNum(d.macros.protein, 0)}g P | ${fmtNum(d.macros.fiber, 0)}g F</div>
      </div>
    `;
  }).join('');

  return `
    <div class="card">
      <h3>Weekly Calorie Overview</h3>
      <div class="dashboard-chart-area">
        <div class="chart-target-line" style="bottom: ${targetLineBottom}px;">
          <span class="chart-target-line__label">${fmtNum(targets.calories)}</span>
        </div>
        ${barsHtml}
      </div>
    </div>
  `;
}

/**
 * Render a daily breakdown card.
 */
function renderDayCard(d, targets) {
  const phaseBadgeClass = d.phase === 'luteal' ? 'badge-phase-luteal' : 'badge-phase-standard';
  const phaseLabel = d.phase === 'luteal' ? 'Luteal' : 'Standard';

  // Meal list
  let mealListHtml = '';
  if (d.meals.length > 0) {
    mealListHtml = d.meals.map(m =>
      `<div class="flex flex-between"><span>${m.slotName}: ${m.recipe.name}</span><span>${fmtNum(m.recipe.calories)} cal | ${fmtNum(m.recipe.protein, 1)}g P | ${fmtNum(m.recipe.fiber, 1)}g F</span></div>`
    ).join('');
  }

  // Extras lines (adrenal cocktails, etc.)
  for (const extra of d.extras) {
    const count = extra.count || 1;
    const eCal = extra.recipe.calories * count;
    const ePro = extra.recipe.protein * count;
    const eFib = extra.recipe.fiber * count;
    mealListHtml += `<div class="flex flex-between text-secondary"><span>${extra.recipe.name} &times;${count}</span><span>${fmtNum(eCal)} cal | ${fmtNum(ePro)}g P | ${fmtNum(eFib, 1)}g F</span></div>`;
  }

  if (!d.hasRecipes && d.extras.length === 0) {
    mealListHtml = '<div class="text-secondary">No meals planned</div>';
  }

  // Format the day and date for the heading
  const dateDisplay = `${d.dayName}, ${formatMonthDay(d.date)}`;

  // Macro progress bars
  const calPct = macroPercent('calories', d.macros.calories);
  const proPct = macroPercent('protein', d.macros.protein);
  const fibPct = macroPercent('fiber', d.macros.fiber);
  const calStatus = getMacroStatus('calories', d.macros.calories);
  const proStatus = getMacroStatus('protein', d.macros.protein);
  const fibStatus = getMacroStatus('fiber', d.macros.fiber);

  // Only show progress bars if there are meals or extras
  const showMacros = d.hasRecipes || d.extras.length > 0;

  return `
    <div class="dashboard-day card">
      <div class="flex flex-between" style="align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <h3 style="margin: 0;">${dateDisplay} <span class="badge ${phaseBadgeClass}">${phaseLabel}</span></h3>
      </div>

      <div class="text-sm mb-1 mt-1">
        ${mealListHtml}
      </div>

      ${showMacros ? `
      <div class="mt-1">
        <div class="macro-bar-container">
          <div class="flex flex-between text-sm"><span>Calories</span><span class="${calStatus}">${fmtNum(d.macros.calories)} / ${fmtNum(targets.calories)}</span></div>
          <div class="macro-bar macro-bar--cal"><div class="macro-bar__fill" style="width: ${calPct}%"></div></div>
        </div>
        <div class="macro-bar-container">
          <div class="flex flex-between text-sm"><span>Protein</span><span class="${proStatus}">${fmtNum(d.macros.protein, 1)}g / ${fmtNum(targets.protein)}g</span></div>
          <div class="macro-bar macro-bar--protein"><div class="macro-bar__fill" style="width: ${proPct}%"></div></div>
        </div>
        <div class="macro-bar-container">
          <div class="flex flex-between text-sm"><span>Fiber</span><span class="${fibStatus}">${fmtNum(d.macros.fiber, 1)}g / ${targets.fiberMin}-${targets.fiberMax}g</span></div>
          <div class="macro-bar macro-bar--fiber"><div class="macro-bar__fill" style="width: ${fibPct}%"></div></div>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

/**
 * Attach all click handlers to the container using event delegation.
 */
function attachEventListeners(container) {
  container.addEventListener('click', async (e) => {
    const target = e.target;

    // ---- Week navigation ----
    if (target.closest('[data-action="prev-week"]')) {
      currentWeekId = getPrevWeekId(currentWeekId);
      await renderDashboard(container);
      return;
    }

    if (target.closest('[data-action="next-week"]')) {
      currentWeekId = getNextWeekId(currentWeekId);
      await renderDashboard(container);
      return;
    }

    if (target.closest('[data-action="today-week"]')) {
      currentWeekId = getISOWeekId(new Date());
      await renderDashboard(container);
      return;
    }

  });
}
