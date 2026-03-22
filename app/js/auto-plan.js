/**
 * auto-plan.js - Auto-planning algorithm module.
 *
 * Generates optimized weekly meal plans that target macro goals
 * (1500 cal / 135g protein / 30-40g fiber) while maximizing
 * ingredient overlap across the week for shopping efficiency
 * and ensuring cuisine variety.
 *
 * Exports:
 *   renderAutoPlanner(container, weekId, onApply)
 *   generateWeekPlan(weekId, options)
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
// Constants
// ---------------------------------------------------------------------------

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
 * Format a Date as "Mar 2", "Mar 3", etc.
 */
function formatMonthDay(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

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
  dayOfCycle = dayOfCycle + 1;
  return store.getDayPhase(dayOfCycle);
}

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
// Extras macro computation
// ---------------------------------------------------------------------------

/**
 * Compute macro totals from a day's extras array (e.g. adrenal cocktails).
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

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmtNum(n, decimals = 0) {
  if (decimals === 0) return Math.round(n).toLocaleString();
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Plan creation helper
// ---------------------------------------------------------------------------

/**
 * Create an empty week plan structure for the given weekId.
 * Mirrors the logic in meal-planner.js.
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
// Recently-used recipe collection
// ---------------------------------------------------------------------------

/**
 * Gather recipe IDs used in the previous N weeks for freshness scoring.
 */
async function getRecentRecipeIds(weekId, lookbackWeeks = 2) {
  const recentIds = new Set();
  let wid = weekId;
  for (let i = 0; i < lookbackWeeks; i++) {
    wid = getPrevWeekId(wid);
    const plan = await store.getWeekPlan(wid);
    if (plan && plan.days) {
      for (const dayKey of DAY_KEYS) {
        const day = plan.days[dayKey];
        if (day && day.slots) {
          for (const slot of day.slots) {
            if (slot.recipeId) {
              recentIds.add(slot.recipeId);
            }
          }
        }
      }
    }
  }
  return recentIds;
}

// ---------------------------------------------------------------------------
// Core algorithm: generateWeekPlan
// ---------------------------------------------------------------------------

/**
 * Generate an optimized week plan that targets macro goals while maximizing
 * ingredient overlap and cuisine variety.
 *
 * @param {string} weekId - ISO week ID, e.g. "2026-W10"
 * @param {object} options
 * @param {boolean} [options.fillEmptyOnly=true] - Only fill slots that have no recipe
 * @param {boolean} [options.maximizeOverlap=true] - Prefer shared ingredients
 * @param {boolean} [options.cuisineVariety=true] - Avoid consecutive cuisine repeats
 * @returns {object} The complete week plan object
 */
export async function generateWeekPlan(weekId, options = {}) {
  const {
    fillEmptyOnly = true,
    maximizeOverlap = true,
    cuisineVariety = true,
  } = options;

  const settings = store.getSettings();
  const targets = settings.dailyTargets;

  // Get or create plan
  let plan = await store.getWeekPlan(weekId);
  if (!plan) {
    plan = createEmptyPlan(weekId);
  } else {
    // Deep-clone to avoid mutating the stored version before user confirms
    plan = JSON.parse(JSON.stringify(plan));
  }

  // Separate recipes by type
  const mealRecipes = getRecipes().filter(r => r.mealType === 'meal');
  const snackRecipes = getRecipes().filter(r => r.mealType === 'snack');

  // Track what has been used this week for variety
  const weekRecipeIds = new Set();
  const weekCuisines = [];
  const weekIngredients = new Map(); // ingredient name -> count

  // Get recently used recipes from adjacent weeks for freshness
  const recentRecipeIds = await getRecentRecipeIds(weekId, 2);

  // If fillEmptyOnly, pre-populate tracking sets with existing assignments
  if (fillEmptyOnly) {
    for (const dayKey of DAY_KEYS) {
      const day = plan.days[dayKey];
      if (!day || !day.slots) continue;
      for (const slot of day.slots) {
        if (slot.recipeId) {
          const recipe = getRecipeById(slot.recipeId);
          if (recipe) {
            weekRecipeIds.add(recipe.id);
            if (recipe.cuisine) weekCuisines.push(recipe.cuisine);
            for (const ing of recipe.ingredients) {
              const key = ing.name.toLowerCase();
              weekIngredients.set(key, (weekIngredients.get(key) || 0) + 1);
            }
          }
        }
      }
    }
  }

  // For each day, fill the empty (or all) slots
  for (const dayKey of DAY_KEYS) {
    const day = plan.days[dayKey];
    if (!day || !day.slots) continue;
    const slots = day.slots;

    // Calculate existing macro totals for this day (extras + pre-filled slots)
    const extrasMacros = computeExtrasMacros(day);
    let dayCalories = extrasMacros.calories;
    let dayProtein = extrasMacros.protein;
    let dayFiber = extrasMacros.fiber;

    const existingRecipes = [];
    for (const slot of slots) {
      if (slot.recipeId) {
        const recipe = getRecipeById(slot.recipeId);
        if (recipe) {
          dayCalories += recipe.calories;
          dayProtein += recipe.protein;
          dayFiber += recipe.fiber;
          existingRecipes.push(recipe);
          weekRecipeIds.add(recipe.id);
        }
      }
    }

    // Determine which slots need filling
    const slotsToFill = [];
    for (let i = 0; i < slots.length; i++) {
      if (fillEmptyOnly && slots[i].recipeId) continue;
      slotsToFill.push(i);
    }

    // If not fillEmptyOnly, clear out the slots we are going to refill
    if (!fillEmptyOnly) {
      for (const idx of slotsToFill) {
        // Remove contribution of the old recipe from day totals if it was counted
        const oldRecipe = slots[idx].recipeId ? getRecipeById(slots[idx].recipeId) : null;
        if (oldRecipe) {
          dayCalories -= oldRecipe.calories;
          dayProtein -= oldRecipe.protein;
          dayFiber -= oldRecipe.fiber;
        }
        slots[idx].recipeId = null;
      }
    }

    // Fill each empty slot in order
    let remainingSlots = slotsToFill.length;

    for (const slotIdx of slotsToFill) {
      const slot = slots[slotIdx];
      const isSnackSlot = slot.slotName.toLowerCase().includes('snack');
      const pool = isSnackSlot ? snackRecipes : mealRecipes;

      // Calculate how many calories/protein we need to reach targets
      const calRemaining = targets.calories - dayCalories;
      const protRemaining = targets.protein - dayProtein;

      // Ideal per-slot budgets for remaining slots
      const idealCalPerSlot = remainingSlots > 0 ? calRemaining / remainingSlots : calRemaining;
      const idealProtPerSlot = remainingSlots > 0 ? protRemaining / remainingSlots : protRemaining;

      const isLastSlot = remainingSlots <= 1;

      // Score each candidate recipe
      const scored = pool.map(recipe => {
        let score = 0;

        // === Macro fit score (0-40 points) ===

        const projectedCals = dayCalories + recipe.calories;
        if (isLastSlot) {
          // For the last slot, score based on how close we get to the target
          const calDiff = Math.abs(projectedCals - targets.calories);
          score += Math.max(0, 40 - calDiff * 0.2);
        } else {
          // For non-last slots, prefer staying under target
          // and prefer recipes close to the ideal per-slot budget
          if (projectedCals <= targets.calories) {
            const slotDiff = Math.abs(recipe.calories - idealCalPerSlot);
            score += Math.max(0, 30 - slotDiff * 0.08);
          } else {
            score += Math.max(0, 15 - (projectedCals - targets.calories) * 0.3);
          }
        }

        // Protein fit (0-15 points)
        const projectedProtein = dayProtein + recipe.protein;
        if (isLastSlot) {
          const protDiff = Math.abs(projectedProtein - targets.protein);
          score += Math.max(0, 15 - protDiff * 0.3);
        } else {
          if (projectedProtein <= targets.protein) {
            const slotProtDiff = Math.abs(recipe.protein - idealProtPerSlot);
            score += Math.max(0, 15 - slotProtDiff * 0.2);
          } else {
            score += Math.max(0, 10 - (projectedProtein - targets.protein) * 0.3);
          }
        }

        // Fiber fit (0-15 points)
        const projectedFiber = dayFiber + recipe.fiber;
        const fiberMidpoint = (targets.fiberMin + targets.fiberMax) / 2;
        if (isLastSlot) {
          if (projectedFiber >= targets.fiberMin && projectedFiber <= targets.fiberMax) {
            score += 15;
          } else {
            score += Math.max(0, 15 - Math.abs(projectedFiber - fiberMidpoint) * 0.3);
          }
        } else {
          // For non-last slots, prefer being on track toward the midpoint
          const fiberPerSlotTarget = fiberMidpoint / slots.length;
          const fiberDiff = Math.abs(recipe.fiber - fiberPerSlotTarget);
          score += Math.max(0, 12 - fiberDiff * 0.3);
        }

        // === Ingredient overlap score (0-20 points) ===
        if (maximizeOverlap) {
          let overlapCount = 0;
          for (const ing of recipe.ingredients) {
            const key = ing.name.toLowerCase();
            if (weekIngredients.has(key)) overlapCount++;
          }
          score += Math.min(20, overlapCount * 4);
        }

        // === Cuisine variety score (-10 to +20 points) ===
        if (cuisineVariety && recipe.cuisine) {
          const lastCuisine = weekCuisines.length > 0 ? weekCuisines[weekCuisines.length - 1] : null;
          const dayCuisines = existingRecipes.map(r => r.cuisine).filter(Boolean);

          // Penalize repeating the immediately previous cuisine
          if (recipe.cuisine === lastCuisine) score -= 10;

          // Penalize repeating a cuisine already in today's meals
          if (dayCuisines.includes(recipe.cuisine)) score -= 5;

          // Bonus for a cuisine not yet seen this week
          const weekCuisineSet = new Set(weekCuisines);
          if (!weekCuisineSet.has(recipe.cuisine)) {
            score += 10;
          } else {
            score += 5;
          }
        }

        // === Freshness score (-15 to +10 points) ===
        if (weekRecipeIds.has(recipe.id)) {
          score -= 15; // Already used this week
        }
        if (recentRecipeIds.has(recipe.id)) {
          score -= 5; // Used in recent weeks
        }
        score += 10; // Base freshness

        // === Random factor for regeneration variation (0-5 points) ===
        score += Math.random() * 5;

        return { recipe, score };
      });

      // Pick the highest scoring recipe
      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0];

      if (pick) {
        slot.recipeId = pick.recipe.id;
        dayCalories += pick.recipe.calories;
        dayProtein += pick.recipe.protein;
        dayFiber += pick.recipe.fiber;
        weekRecipeIds.add(pick.recipe.id);
        existingRecipes.push(pick.recipe);

        if (pick.recipe.cuisine) {
          weekCuisines.push(pick.recipe.cuisine);
        }

        // Track ingredients for overlap scoring
        for (const ing of pick.recipe.ingredients) {
          const key = ing.name.toLowerCase();
          weekIngredients.set(key, (weekIngredients.get(key) || 0) + 1);
        }
      }

      remainingSlots--;
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Preview rendering
// ---------------------------------------------------------------------------

/**
 * Render a preview of the generated plan showing each day with recipes
 * and macro totals.
 *
 * @param {object} plan - The generated week plan object
 * @param {HTMLElement} container - DOM element to render into
 * @param {function} onApply - Callback when user clicks "Apply"
 * @param {function} onRegenerate - Callback when user clicks "Regenerate"
 */
function renderPreview(plan, container, onApply, onRegenerate) {
  const settings = store.getSettings();
  const targets = settings.dailyTargets;
  const dates = getWeekDates(plan.weekId);

  let daysHtml = '';

  DAY_KEYS.forEach((dayKey, idx) => {
    const day = plan.days[dayKey];
    if (!day || !day.slots) return;

    const date = dates[idx];
    const dateLabel = `${DAY_NAMES[idx]}, ${formatMonthDay(date)}`;

    const dayExtras = computeExtrasMacros(day);
    let dayCal = dayExtras.calories;
    let dayPro = dayExtras.protein;
    let dayFib = dayExtras.fiber;

    let slotsHtml = '';
    for (const slot of day.slots) {
      const recipe = slot.recipeId ? getRecipeById(slot.recipeId) : null;
      if (recipe) {
        dayCal += recipe.calories;
        dayPro += recipe.protein;
        dayFib += recipe.fiber;
        slotsHtml += `<div class="text-sm" style="padding: 0.125rem 0;">${slot.slotName}: ${recipe.name} <span class="text-secondary">(${fmtNum(recipe.calories)} cal / ${fmtNum(recipe.protein, 1)}g P / ${fmtNum(recipe.fiber, 1)}g F)</span></div>`;
      } else {
        slotsHtml += `<div class="text-sm text-secondary" style="padding: 0.125rem 0;">${slot.slotName}: <em>Empty</em></div>`;
      }
    }

    // Determine status indicator
    const calOk = Math.abs(dayCal - targets.calories) <= 50;
    const proOk = Math.abs(dayPro - targets.protein) <= 10;
    const fibOk = dayFib >= targets.fiberMin && dayFib <= targets.fiberMax;
    const allGood = calOk && proOk && fibOk;
    const statusIcon = allGood ? ' &#10003;' : '';
    const statusClass = allGood ? 'color: var(--color-success, #4a9d6e);' : 'color: var(--color-text);';

    daysHtml += `
      <div class="mb-1" style="padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border, #e2dfd8);">
        <strong>${dateLabel}</strong>
        ${slotsHtml}
        <div class="text-sm" style="font-weight: 600; margin-top: 0.25rem; ${statusClass}">
          Day Total: ${fmtNum(dayCal)} cal / ${fmtNum(dayPro, 1)}g P / ${fmtNum(dayFib, 1)}g F${statusIcon}
        </div>
      </div>
    `;
  });

  // Compute weekly averages
  let totalCal = 0, totalPro = 0, totalFib = 0, daysWithFood = 0;
  for (const dayKey of DAY_KEYS) {
    const day = plan.days[dayKey];
    if (!day || !day.slots) continue;
    const avgExtras = computeExtrasMacros(day);
    let dayCal = avgExtras.calories;
    let dayPro = avgExtras.protein;
    let dayFib = avgExtras.fiber;
    let hasRecipes = false;
    for (const slot of day.slots) {
      if (slot.recipeId) {
        const r = getRecipeById(slot.recipeId);
        if (r) {
          dayCal += r.calories;
          dayPro += r.protein;
          dayFib += r.fiber;
          hasRecipes = true;
        }
      }
    }
    if (hasRecipes) {
      totalCal += dayCal;
      totalPro += dayPro;
      totalFib += dayFib;
      daysWithFood++;
    }
  }

  const divisor = daysWithFood || 1;
  const avgCal = Math.round(totalCal / divisor);
  const avgPro = Math.round(totalPro / divisor);
  const avgFib = Math.round(totalFib / divisor);

  // Count unique ingredients to show shopping efficiency
  const ingredientSet = new Set();
  for (const dayKey of DAY_KEYS) {
    const day = plan.days[dayKey];
    if (!day || !day.slots) continue;
    for (const slot of day.slots) {
      if (slot.recipeId) {
        const r = getRecipeById(slot.recipeId);
        if (r) {
          for (const ing of r.ingredients) {
            ingredientSet.add(ing.name.toLowerCase());
          }
        }
      }
    }
  }

  container.innerHTML = `
    <div class="card">
      <h3>Preview</h3>
      <div class="dashboard-stats" style="margin-bottom: 1rem;">
        <div class="stat-card">
          <div class="stat-card__value">${avgCal.toLocaleString()}</div>
          <div class="stat-card__label">Avg Daily Cal</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${avgPro}g</div>
          <div class="stat-card__label">Avg Daily Protein</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${avgFib}g</div>
          <div class="stat-card__label">Avg Daily Fiber</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">${ingredientSet.size}</div>
          <div class="stat-card__label">Unique Ingredients</div>
        </div>
      </div>
      ${daysHtml}
      <div class="flex gap-1 mt-1">
        <button class="btn btn-primary" id="auto-apply">Apply Plan</button>
        <button class="btn btn-secondary" id="auto-regenerate">Regenerate</button>
      </div>
    </div>
  `;

  // Attach preview button handlers
  const applyBtn = container.querySelector('#auto-apply');
  const regenBtn = container.querySelector('#auto-regenerate');

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      onApply(plan);
    });
  }

  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      onRegenerate();
    });
  }
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Render the auto-plan panel UI into a container (typically a modal content area).
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} weekId - The week to auto-plan for, e.g. "2026-W10"
 * @param {function} onApply - Callback to invoke after the plan is applied
 */
export function renderAutoPlanner(container, weekId, onApply) {
  container.innerHTML = `
    <div class="auto-plan">
      <h2>Auto Plan Week</h2>
      <p class="text-sm text-secondary">Automatically fill your week with recipes optimized for your macro targets and ingredient efficiency.</p>

      <div class="card mt-1">
        <h3>Options</h3>
        <div class="form-group">
          <label class="flex gap-1" style="align-items: center; cursor: pointer;">
            <input type="checkbox" id="auto-fill-empty" checked> Fill empty slots only
          </label>
          <span class="text-sm text-secondary">When unchecked, replaces ALL slots including ones with recipes</span>
        </div>
        <div class="form-group">
          <label class="flex gap-1" style="align-items: center; cursor: pointer;">
            <input type="checkbox" id="auto-overlap" checked> Maximize ingredient overlap
          </label>
          <span class="text-sm text-secondary">Prefer recipes that share ingredients to reduce your shopping list</span>
        </div>
        <div class="form-group">
          <label class="flex gap-1" style="align-items: center; cursor: pointer;">
            <input type="checkbox" id="auto-variety" checked> Cuisine variety
          </label>
          <span class="text-sm text-secondary">Avoid repeating the same cuisine in consecutive meals</span>
        </div>
      </div>

      <div class="flex gap-1 mt-1">
        <button class="btn btn-primary" id="auto-generate">Generate Plan</button>
        <button class="btn btn-secondary" id="auto-cancel">Cancel</button>
      </div>

      <div id="auto-preview" class="mt-1"></div>
    </div>
  `;

  // Gather option values from checkboxes
  function getOptions() {
    const fillEmpty = container.querySelector('#auto-fill-empty');
    const overlap = container.querySelector('#auto-overlap');
    const variety = container.querySelector('#auto-variety');
    return {
      fillEmptyOnly: fillEmpty ? fillEmpty.checked : true,
      maximizeOverlap: overlap ? overlap.checked : true,
      cuisineVariety: variety ? variety.checked : true,
    };
  }

  // Generate and show preview
  async function doGenerate() {
    const options = getOptions();
    const plan = await generateWeekPlan(weekId, options);
    const previewContainer = container.querySelector('#auto-preview');
    if (!previewContainer) return;

    renderPreview(plan, previewContainer, applyPlan, doGenerate);
  }

  // Apply the plan: save it, call onApply, show toast, close modal
  async function applyPlan(plan) {
    await store.saveWeekPlan(weekId, plan);

    const app = await getApp();

    if (typeof onApply === 'function') {
      onApply();
    }

    app.showToast('Auto plan applied successfully!', 'success');
    app.closeModal();
  }

  // Attach button handlers
  const generateBtn = container.querySelector('#auto-generate');
  const cancelBtn = container.querySelector('#auto-cancel');

  if (generateBtn) {
    generateBtn.addEventListener('click', doGenerate);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      const app = await getApp();
      app.closeModal();
    });
  }
}
