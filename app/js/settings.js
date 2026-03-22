/**
 * settings.js - Settings / configuration page for the Meal Planning app.
 *
 * Renders four sections:
 *   1. Daily Targets (calories, protein, fiber, adrenal cocktails)
 *   2. Meal Slot Configuration (standard + luteal phases)
 *   3. Cycle / Phase Configuration with visual preview
 *   4. Data Management (export, import, reset)
 */

import * as store from './store.js';
import { getRecipes } from './recipe-cache.js';

/**
 * Dynamically import app.js to access the toast system.
 * Using dynamic import avoids circular dependency issues.
 */
async function getApp() {
  return await import('./app.js');
}

// ============================================================
// Main render
// ============================================================

/**
 * Render the full settings page into the given container element.
 * @param {HTMLElement} container
 */
export function renderSettings(container) {
  const settings = store.getSettings();
  const phaseConfig = store.getPhaseConfig();

  container.innerHTML = `
    <h1>Settings</h1>

    <!-- Section 1: Daily Targets -->
    <div class="card">
      <h2>Daily Targets</h2>
      <div class="form-group">
        <label>Daily Calories</label>
        <input type="number" id="target-calories" value="${settings.dailyTargets.calories}" min="800" max="5000" step="50">
      </div>
      <div class="form-group">
        <label>Protein (grams)</label>
        <input type="number" id="target-protein" value="${settings.dailyTargets.protein}" min="0" max="500" step="5">
      </div>
      <div class="form-group">
        <label>Fiber Minimum (grams)</label>
        <input type="number" id="target-fiber-min" value="${settings.dailyTargets.fiberMin}" min="0" max="100" step="5">
      </div>
      <div class="form-group">
        <label>Fiber Maximum (grams)</label>
        <input type="number" id="target-fiber-max" value="${settings.dailyTargets.fiberMax}" min="0" max="100" step="5">
      </div>
      <div class="form-group">
        <label>Adrenal Cocktail Recipe</label>
        <select id="adrenal-recipe-select">
          <option value="">None selected</option>
          ${buildAdrenalRecipeOptions(settings.adrenalRecipeId)}
        </select>
      </div>
      <div class="form-group">
        <label>Adrenal Cocktails Per Day</label>
        <input type="number" id="target-adrenal" value="${settings.adrenalCountPerDay}" min="0" max="5" step="1">
      </div>
      <button class="btn btn-primary" id="save-targets">Save Targets</button>
    </div>

    <!-- Section 2: Meal Slot Configuration -->
    <div class="card">
      <h2>Meal Slots</h2>

      <h3>Standard Phase <span class="badge badge-phase-standard">Standard</span></h3>
      <div id="slots-standard"></div>
      <div class="flex gap-1 mt-1">
        <input type="text" id="new-slot-standard" placeholder="New slot name...">
        <button class="btn btn-primary btn-sm" data-action="add-slot" data-phase="standard">Add</button>
      </div>
      <button class="btn btn-secondary btn-sm mt-1" data-action="reset-slots" data-phase="standard">Reset to Defaults</button>

      <h3 class="mt-2">Luteal Phase <span class="badge badge-phase-luteal">Luteal</span></h3>
      <div id="slots-luteal"></div>
      <div class="flex gap-1 mt-1">
        <input type="text" id="new-slot-luteal" placeholder="New slot name...">
        <button class="btn btn-primary btn-sm" data-action="add-slot" data-phase="luteal">Add</button>
      </div>
      <button class="btn btn-secondary btn-sm mt-1" data-action="reset-slots" data-phase="luteal">Reset to Defaults</button>
    </div>

    <!-- Section 3: Cycle Configuration -->
    <div class="card">
      <h2>Cycle Configuration</h2>
      <p class="text-sm text-secondary">Configure your menstrual cycle phases. The luteal phase affects meal slot counts.</p>
      <div class="form-group">
        <label>Cycle Length (days)</label>
        <input type="number" id="cycle-length" value="${phaseConfig.cycleLength}" min="20" max="45">
      </div>
      <div class="form-group">
        <label>Luteal Phase Start Day</label>
        <input type="number" id="luteal-start" value="${phaseConfig.lutealStart}" min="1" max="45">
      </div>
      <div class="form-group">
        <label>Luteal Phase End Day</label>
        <input type="number" id="luteal-end" value="${phaseConfig.lutealEnd}" min="1" max="45">
      </div>
      <button class="btn btn-primary" id="save-phase">Save Cycle Config</button>

      <div class="mt-2">
        <h3>Cycle Preview</h3>
        <div id="cycle-preview" class="flex flex-wrap gap-1"></div>
      </div>
    </div>

    <!-- Section 4: Data Management -->
    <div class="card">
      <h2>Data Management</h2>
      <div class="flex gap-1 flex-wrap">
        <button class="btn btn-secondary" id="export-data">Export All Data</button>
        <label class="btn btn-secondary" style="cursor: pointer;">
          Import Data
          <input type="file" id="import-data" accept=".json" style="display: none;">
        </label>
        <button class="btn btn-danger" id="reset-data">Reset All Data</button>
      </div>
    </div>
  `;

  // Populate dynamic sub-sections
  renderSlotList('standard');
  renderSlotList('luteal');
  renderCyclePreview();

  // Attach event handlers
  bindTargetEvents(container);
  bindSlotEvents(container);
  bindPhaseEvents(container);
  bindDataEvents(container);
}

// ============================================================
// Section 1: Daily Targets
// ============================================================

/**
 * Build <option> elements for the adrenal cocktail recipe dropdown.
 * Sorts snack recipes first, then meals, alphabetically within each group.
 * @param {number|null} selectedId - Currently selected recipe ID
 * @returns {string} HTML option elements
 */
function buildAdrenalRecipeOptions(selectedId) {
  const recipes = getRecipes();
  if (!recipes || recipes.length === 0) return '';

  // Partition into snacks and non-snacks, sort alphabetically within each
  const snacks = recipes
    .filter(r => r.mealType === 'snack')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const meals = recipes
    .filter(r => r.mealType !== 'snack')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const sorted = [...snacks, ...meals];

  return sorted.map(r => {
    const cal = r.calories != null ? Math.round(r.calories) : '?';
    const selected = r.id === selectedId ? ' selected' : '';
    return `<option value="${r.id}"${selected}>${escapeHtml(r.name)} (${cal} cal)</option>`;
  }).join('\n          ');
}

/**
 * Bind the "Save Targets" button click handler.
 */
function bindTargetEvents(container) {
  const saveBtn = container.querySelector('#save-targets');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const calories = parseInt(container.querySelector('#target-calories').value, 10);
    const protein = parseInt(container.querySelector('#target-protein').value, 10);
    const fiberMin = parseInt(container.querySelector('#target-fiber-min').value, 10);
    const fiberMax = parseInt(container.querySelector('#target-fiber-max').value, 10);
    const adrenalCount = parseInt(container.querySelector('#target-adrenal').value, 10);
    const adrenalRecipeVal = container.querySelector('#adrenal-recipe-select').value;
    const adrenalRecipeId = adrenalRecipeVal ? parseInt(adrenalRecipeVal, 10) : null;
    const adrenalCountPerDay = isNaN(adrenalCount) ? 2 : adrenalCount;

    const settings = {
      dailyTargets: {
        calories: isNaN(calories) ? 1500 : calories,
        protein: isNaN(protein) ? 135 : protein,
        fiberMin: isNaN(fiberMin) ? 30 : fiberMin,
        fiberMax: isNaN(fiberMax) ? 40 : fiberMax,
      },
      adrenalCocktailsPerDay: adrenalCountPerDay,
      adrenalRecipeId,
      adrenalCountPerDay,
    };

    store.saveSettings(settings);

    const app = await getApp();
    app.showToast('Targets saved successfully!', 'success');
  });
}

// ============================================================
// Section 2: Meal Slot Configuration
// ============================================================

/**
 * Render the ordered list of meal slots for a given phase into
 * the corresponding #slots-{phase} container.
 */
function renderSlotList(phase) {
  const listEl = document.getElementById(`slots-${phase}`);
  if (!listEl) return;

  const slots = store.getMealSlots(phase);
  // Sort by order to ensure consistent display
  slots.sort((a, b) => a.order - b.order);

  if (slots.length === 0) {
    listEl.innerHTML = '<p class="text-sm text-secondary">No meal slots configured.</p>';
    return;
  }

  listEl.innerHTML = slots
    .map((slot, index) => {
      const upDisabled = index === 0 ? ' disabled' : '';
      const downDisabled = index === slots.length - 1 ? ' disabled' : '';
      return `
        <div class="flex gap-1 mt-1" style="align-items: center;">
          <span class="text-sm" style="min-width: 24px; font-weight: 600;">${index + 1}.</span>
          <span style="flex: 1;">${escapeHtml(slot.name)}</span>
          <button class="btn btn-secondary btn-sm" data-action="move-slot" data-phase="${phase}" data-index="${index}" data-direction="up"${upDisabled} title="Move up">&uarr;</button>
          <button class="btn btn-secondary btn-sm" data-action="move-slot" data-phase="${phase}" data-index="${index}" data-direction="down"${downDisabled} title="Move down">&darr;</button>
          <button class="btn btn-danger btn-sm" data-action="remove-slot" data-phase="${phase}" data-index="${index}" title="Remove">&times;</button>
        </div>
      `;
    })
    .join('');
}

/**
 * Bind all meal-slot related event handlers using event delegation.
 */
function bindSlotEvents(container) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const phase = btn.dataset.phase;

    if (!phase) return;

    switch (action) {
      case 'add-slot': {
        const input = container.querySelector(`#new-slot-${phase}`);
        const name = input ? input.value.trim() : '';
        if (!name) return;

        const slots = store.getMealSlots(phase);
        const maxOrder = slots.length > 0 ? Math.max(...slots.map((s) => s.order)) : -1;
        slots.push({ name, order: maxOrder + 1 });
        store.saveMealSlots(phase, slots);
        renderSlotList(phase);
        if (input) input.value = '';

        const app = await getApp();
        app.showToast(`Added "${name}" to ${phase} phase`, 'success');
        break;
      }

      case 'move-slot': {
        const index = parseInt(btn.dataset.index, 10);
        const direction = btn.dataset.direction;
        const slots = store.getMealSlots(phase);
        slots.sort((a, b) => a.order - b.order);

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= slots.length) return;

        // Swap order values
        const tempOrder = slots[index].order;
        slots[index].order = slots[targetIndex].order;
        slots[targetIndex].order = tempOrder;

        slots.sort((a, b) => a.order - b.order);
        store.saveMealSlots(phase, slots);
        renderSlotList(phase);
        break;
      }

      case 'remove-slot': {
        const index = parseInt(btn.dataset.index, 10);
        const slots = store.getMealSlots(phase);
        slots.sort((a, b) => a.order - b.order);

        if (slots.length <= 1) {
          const confirmed = confirm('This is the last meal slot. Are you sure you want to remove it?');
          if (!confirmed) return;
        }

        const removed = slots.splice(index, 1)[0];
        // Re-order remaining slots sequentially
        slots.forEach((slot, i) => {
          slot.order = i;
        });

        store.saveMealSlots(phase, slots);
        renderSlotList(phase);

        const app = await getApp();
        app.showToast(`Removed "${removed.name}" from ${phase} phase`, 'info');
        break;
      }

      case 'reset-slots': {
        const defaults = store.getDefaultMealSlots(phase);
        store.saveMealSlots(phase, defaults);
        renderSlotList(phase);

        const app = await getApp();
        app.showToast(`${phase === 'luteal' ? 'Luteal' : 'Standard'} slots reset to defaults`, 'success');
        break;
      }
    }
  });
}

// ============================================================
// Section 3: Phase / Cycle Configuration
// ============================================================

/**
 * Render the cycle preview: a row of small colored boxes for each
 * day of the cycle, teal for standard and pink/purple for luteal.
 */
function renderCyclePreview() {
  const previewEl = document.getElementById('cycle-preview');
  if (!previewEl) return;

  const config = store.getPhaseConfig();
  const cycleLength = config.cycleLength || 30;
  const lutealStart = config.lutealStart || 21;
  const lutealEnd = config.lutealEnd || 30;

  let html = '';
  for (let day = 1; day <= cycleLength; day++) {
    const isLuteal = day >= lutealStart && day <= lutealEnd;
    const bgColor = isLuteal ? '#7c6fae' : '#4a7c59';
    const label = isLuteal ? 'Luteal' : 'Standard';
    html += `<div
      style="
        display: inline-block;
        width: 20px;
        height: 20px;
        border-radius: var(--radius);
        background: ${bgColor};
        color: #ffffff;
        font-size: 9px;
        line-height: 20px;
        text-align: center;
        cursor: default;
      "
      title="Day ${day} - ${label}"
    >${day}</div>`;
  }

  previewEl.innerHTML = html;
}

/**
 * Bind the "Save Cycle Config" button and preview re-render.
 */
function bindPhaseEvents(container) {
  const saveBtn = container.querySelector('#save-phase');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const cycleLength = parseInt(container.querySelector('#cycle-length').value, 10);
    const lutealStart = parseInt(container.querySelector('#luteal-start').value, 10);
    const lutealEnd = parseInt(container.querySelector('#luteal-end').value, 10);

    const config = {
      cycleLength: isNaN(cycleLength) ? 30 : cycleLength,
      lutealStart: isNaN(lutealStart) ? 21 : lutealStart,
      lutealEnd: isNaN(lutealEnd) ? 30 : lutealEnd,
      cycleStartDate: store.getPhaseConfig().cycleStartDate,
    };

    store.savePhaseConfig(config);
    renderCyclePreview();

    const app = await getApp();
    app.showToast('Cycle configuration saved!', 'success');
  });
}

// ============================================================
// Section 4: Data Management
// ============================================================

/**
 * Bind export, import, and reset data handlers.
 */
function bindDataEvents(container) {
  // --- Export ---
  const exportBtn = container.querySelector('#export-data');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const json = store.exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const today = new Date().toISOString().slice(0, 10);
      const filename = `meal-planner-backup-${today}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const app = await getApp();
      app.showToast('Data exported successfully!', 'success');
    });
  }

  // --- Import ---
  const importInput = container.querySelector('#import-data');
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = event.target.result;
          store.importAllData(json);

          const app = await getApp();
          app.showToast('Data imported successfully! Reloading...', 'success');

          setTimeout(() => {
            location.reload();
          }, 1000);
        } catch (err) {
          const app = await getApp();
          app.showToast(`Import failed: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  // --- Reset ---
  const resetBtn = container.querySelector('#reset-data');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure? This will delete all saved data.');
      if (!confirmed) return;

      // Remove all mp_ prefixed keys from localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mp_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      const app = await getApp();
      app.showToast('All data has been reset. Reloading...', 'info');

      setTimeout(() => {
        location.reload();
      }, 1000);
    });
  }
}

// ============================================================
// Utility
// ============================================================

/**
 * Escape HTML special characters to prevent XSS when inserting
 * user-provided text into innerHTML.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
