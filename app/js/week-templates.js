/**
 * week-templates.js - Week template management for the Meal Planning app.
 *
 * Provides saving, loading, and managing week templates including pre-built
 * templates generated from the original 30-day meal plan data. Templates can
 * be loaded into any week in "replace" or "fill-empty" mode.
 *
 * Exports:
 *   - renderTemplatesPanel(container, weekId, onLoad)
 *   - getPrebuiltTemplates()
 *   - loadTemplateToWeek(templateId, weekId, mode)
 *   - saveCurrentWeekAsTemplate(weekId, name)
 */

import { mealPlan } from './data/recipes.js';
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
// 1. getPrebuiltTemplates
// ---------------------------------------------------------------------------

/**
 * Generate 4 pre-built week templates from the original 30-day meal plan.
 *
 * Week 1: Days 1-7 (Standard phase)
 * Week 2: Days 8-14 (Standard phase)
 * Week 3: Days 15-21 (Mixed — transitions from standard to luteal)
 * Week 4: Days 22-28 (Luteal phase)
 *
 * @returns {Object[]} Array of 4 template objects
 */
export function getPrebuiltTemplates() {
  const weekRanges = [
    { name: 'Week 1 — Days 1-7 (Standard)', days: [1, 2, 3, 4, 5, 6, 7] },
    { name: 'Week 2 — Days 8-14 (Standard)', days: [8, 9, 10, 11, 12, 13, 14] },
    { name: 'Week 3 — Days 15-21 (Mixed)', days: [15, 16, 17, 18, 19, 20, 21] },
    { name: 'Week 4 — Days 22-28 (Luteal)', days: [22, 23, 24, 25, 26, 27, 28] },
  ];

  return weekRanges.map((range, idx) => {
    const days = {};
    range.days.forEach((dayNum, i) => {
      const mp = mealPlan.find(m => m.day === dayNum);
      if (mp) {
        days[DAY_KEYS[i]] = {
          phase: mp.phase,
          slots: mp.meals.map(m => ({ slotName: m.slot, recipeId: m.recipeId })),
        };
      }
    });

    return {
      id: `prebuilt-${idx + 1}`,
      name: range.name,
      createdAt: new Date().toISOString(),
      isPrebuilt: true,
      days,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. loadTemplateToWeek
// ---------------------------------------------------------------------------

/**
 * Load a template into a specific week's plan.
 *
 * @param {string} templateId - ID of the template (prebuilt or user-created)
 * @param {string} weekId     - Target week ID, e.g. "2026-W10"
 * @param {'replace'|'fill-empty'} [mode='replace'] - Load strategy:
 *   - "replace": overwrite all slots with template data
 *   - "fill-empty": only populate slots that currently have no recipe
 * @returns {boolean} true if the template was found and applied
 */
export function loadTemplateToWeek(templateId, weekId, mode = 'replace') {
  // Find the template — check prebuilt first, then user-saved
  let template = getPrebuiltTemplates().find(t => t.id === templateId);
  if (!template) {
    const stored = store.getTemplates();
    template = stored.find(t => t.id === templateId);
  }
  if (!template) return false;

  // Get or create the week plan
  let plan = store.getWeekPlan(weekId);
  if (!plan) {
    plan = { weekId, days: {} };
    DAY_KEYS.forEach(dk => {
      const phase = template.days[dk]?.phase || 'standard';
      const mealSlots = store.getMealSlots(phase);
      plan.days[dk] = {
        date: '',
        phase,
        slots: mealSlots.map(s => ({ slotName: s.name, recipeId: null })),
      };
    });
  }

  for (const dk of DAY_KEYS) {
    if (!template.days[dk]) continue;
    const templateDay = template.days[dk];

    if (mode === 'replace') {
      // Replace all slots with template slots
      plan.days[dk].slots = templateDay.slots.map(s => ({
        slotName: s.slotName,
        recipeId: s.recipeId,
      }));
    } else if (mode === 'fill-empty') {
      // Only fill slots that are currently empty
      for (const tSlot of templateDay.slots) {
        const existingSlot = plan.days[dk].slots.find(s => s.slotName === tSlot.slotName);
        if (existingSlot && !existingSlot.recipeId) {
          existingSlot.recipeId = tSlot.recipeId;
        } else if (!existingSlot) {
          plan.days[dk].slots.push({
            slotName: tSlot.slotName,
            recipeId: tSlot.recipeId,
          });
        }
      }
    }
  }

  store.saveWeekPlan(weekId, plan);
  return true;
}

// ---------------------------------------------------------------------------
// 3. saveCurrentWeekAsTemplate
// ---------------------------------------------------------------------------

/**
 * Save the current week's plan as a user-created template.
 *
 * @param {string} weekId - The week to save, e.g. "2026-W10"
 * @param {string} name   - Human-readable name for the template
 * @returns {Object|null} The saved template object, or null if no plan exists
 */
export function saveCurrentWeekAsTemplate(weekId, name) {
  const plan = store.getWeekPlan(weekId);
  if (!plan) return null;

  const template = {
    name,
    isPrebuilt: false,
    days: {},
  };

  for (const dk of DAY_KEYS) {
    if (plan.days[dk]) {
      template.days[dk] = {
        phase: plan.days[dk].phase,
        slots: plan.days[dk].slots.map(s => ({
          slotName: s.slotName,
          recipeId: s.recipeId,
        })),
      };
    }
  }

  store.saveTemplate(template);
  return template;
}

// ---------------------------------------------------------------------------
// 4. renderTemplatesPanel
// ---------------------------------------------------------------------------

/**
 * Count the total number of assigned meals in a template.
 * @param {Object} template
 * @returns {number}
 */
function countTemplateMeals(template) {
  let count = 0;
  for (const dk of DAY_KEYS) {
    if (template.days[dk]) {
      count += template.days[dk].slots.filter(s => s.recipeId).length;
    }
  }
  return count;
}

/**
 * Render a single template card.
 * @param {Object} template
 * @returns {string} HTML string
 */
function renderTemplateCard(template) {
  const mealCount = countTemplateMeals(template);

  return `
    <div class="template-card" data-template-id="${template.id}">
      <div class="template-card__info">
        <div class="template-card__name">${template.name}</div>
        <div class="template-card__meta">${mealCount} meals</div>
      </div>
      <div class="template-card__actions">
        <button class="btn btn-sm btn-primary" data-action="load-template" data-id="${template.id}" data-mode="replace">Load (Replace)</button>
        <button class="btn btn-sm btn-secondary" data-action="load-template" data-id="${template.id}" data-mode="fill-empty">Fill Empty</button>
        ${!template.isPrebuilt ? `<button class="btn btn-sm btn-danger" data-action="delete-template" data-id="${template.id}">Delete</button>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render the full templates management panel into a container.
 *
 * This function is designed to be called from the meal planner to populate
 * a modal with template management UI.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} weekId        - Currently viewed week in the planner
 * @param {Function} onLoad      - Callback after a template is loaded (so planner re-renders)
 */
export function renderTemplatesPanel(container, weekId, onLoad) {
  const prebuiltTemplates = getPrebuiltTemplates();
  const userTemplates = store.getTemplates();

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h2 style="margin: 0;">Week Templates</h2>
        <button class="modal-close" data-action="close-modal">&times;</button>
      </div>

      <!-- Save current week -->
      <div class="card">
        <h3>Save Current Week as Template</h3>
        <div class="flex gap-1">
          <input type="text" id="template-name" class="input" placeholder="Template name..." style="flex: 1;">
          <button class="btn btn-primary" id="save-template">Save</button>
        </div>
      </div>

      <!-- Pre-built templates -->
      <div class="card mt-1">
        <h3>Original Meal Plan Templates</h3>
        <div id="prebuilt-templates">
          ${prebuiltTemplates.map(t => renderTemplateCard(t)).join('')}
        </div>
      </div>

      <!-- User templates -->
      <div class="card mt-1">
        <h3>Your Saved Templates</h3>
        <div id="user-templates">
          ${userTemplates.length > 0
            ? userTemplates.map(t => renderTemplateCard(t)).join('')
            : '<div class="empty-state"><p>No saved templates yet. Plan a week and save it as a template to reuse later.</p></div>'
          }
        </div>
      </div>
    </div>
  `;

  // ---- Event delegation ----
  attachTemplatePanelListeners(container, weekId, onLoad);
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/**
 * Attach all event listeners for the templates panel using event delegation.
 *
 * @param {HTMLElement} container
 * @param {string} weekId
 * @param {Function} onLoad
 */
function attachTemplatePanelListeners(container, weekId, onLoad) {
  container.addEventListener('click', async (e) => {
    const target = e.target;

    // ---- Close modal ----
    if (target.closest('[data-action="close-modal"]')) {
      const { closeModal } = await getApp();
      closeModal();
      return;
    }

    // ---- Save current week as template ----
    if (target.closest('#save-template')) {
      const nameInput = container.querySelector('#template-name');
      const name = nameInput ? nameInput.value.trim() : '';

      if (!name) {
        const { showToast } = await getApp();
        showToast('Please enter a template name.', 'error');
        return;
      }

      const result = saveCurrentWeekAsTemplate(weekId, name);
      const { showToast } = await getApp();

      if (result) {
        showToast(`Template "${name}" saved successfully.`, 'success');
        // Re-render the panel to show the new template
        renderTemplatesPanel(container, weekId, onLoad);
      } else {
        showToast('No plan found for the current week. Add some meals first.', 'error');
      }
      return;
    }

    // ---- Load template ----
    const loadBtn = target.closest('[data-action="load-template"]');
    if (loadBtn) {
      const templateId = loadBtn.dataset.id;
      const mode = loadBtn.dataset.mode;

      const success = loadTemplateToWeek(templateId, weekId, mode);
      const { showToast, closeModal } = await getApp();

      if (success) {
        const modeLabel = mode === 'replace' ? 'replaced' : 'filled empty slots in';
        showToast(`Template ${modeLabel} the current week.`, 'success');
        if (typeof onLoad === 'function') {
          onLoad();
        }
        closeModal();
      } else {
        showToast('Template not found.', 'error');
      }
      return;
    }

    // ---- Delete template ----
    const deleteBtn = target.closest('[data-action="delete-template"]');
    if (deleteBtn) {
      const templateId = deleteBtn.dataset.id;
      store.deleteTemplate(templateId);

      const { showToast } = await getApp();
      showToast('Template deleted.', 'info');

      // Re-render the panel to reflect the deletion
      renderTemplatesPanel(container, weekId, onLoad);
      return;
    }
  });
}
