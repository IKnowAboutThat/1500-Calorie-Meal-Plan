/**
 * recipe-editor-components.js - Shared rendering components for recipe editors.
 *
 * Extracted from add-recipe.js so that multiple pages (add, edit, etc.)
 * can reuse the same ingredient table, instruction editor, nutrition
 * summary, and resolution panel without duplicating markup or logic.
 *
 * Every render function is pure — it takes data in and returns an HTML
 * string with no side effects.  Event wiring is handled separately by
 * attachEditorEvents().
 */

// ============================================================
// Helpers
// ============================================================

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const INPUT_STYLE = 'width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;background:var(--color-surface);';
const SMALL_INPUT_STYLE = 'border:1px solid var(--color-border);border-radius:var(--radius);padding:0.3rem 0.5rem;font-size:0.85rem;background:var(--color-surface);';

// ============================================================
// computeIngredientMacros
// ============================================================

/**
 * Compute per-row macro values from per-100g data and amount.
 * @param {Object} ingredient - ingredient with amount, calories_per_100g, etc.
 * @returns {{ calories: number, protein: number, fat: number, carbs: number, fiber: number }}
 */
export function computeIngredientMacros(ingredient) {
  const factor = (ingredient.amount || 0) / 100;
  return {
    calories: Math.round((ingredient.calories_per_100g || 0) * factor * 10) / 10,
    protein:  Math.round((ingredient.protein_per_100g || 0) * factor * 10) / 10,
    fat:      Math.round((ingredient.fat_per_100g || 0) * factor * 10) / 10,
    carbs:    Math.round((ingredient.carbs_per_100g || 0) * factor * 10) / 10,
    fiber:    Math.round((ingredient.fiber_per_100g || 0) * factor * 10) / 10,
  };
}

// ============================================================
// renderIngredientEditor
// ============================================================

/**
 * Render the ingredient table with editable rows.
 * @param {Array} ingredients - array of ingredient objects
 * @param {Object} options
 * @param {number|null} options.resolvingIndex - index currently being resolved
 * @param {boolean}     [options.editable=true]
 * @param {number}      [options.servings=1]
 * @returns {string} HTML string
 */
export function renderIngredientEditor(ingredients, options = {}) {
  const { resolvingIndex = null, editable = true, servings = 1 } = options;

  // Count unresolved
  const unresolvedCount = ingredients.filter(i => !i.resolved).length;

  const unresolvedWarning = unresolvedCount > 0 ? `
    <div style="background:rgba(255,152,0,0.1);border:1px solid var(--color-warning, orange);border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem;color:var(--color-warning, orange);">
      ${unresolvedCount} ingredient${unresolvedCount > 1 ? 's' : ''} need${unresolvedCount === 1 ? 's' : ''} to be resolved before saving.
    </div>
  ` : '';

  // Compute totals for footer
  const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  for (const ing of ingredients) {
    if (!ing.resolved) continue;
    totals.calories += ing.calories || 0;
    totals.protein  += ing.protein || 0;
    totals.fat      += ing.fat || 0;
    totals.carbs    += ing.carbs || 0;
    totals.fiber    += ing.fiber || 0;
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 10) / 10;

  const ingredientRows = ingredients.map((ing, idx) => {
    const resolved = ing.resolved;
    const statusBadge = resolved
      ? '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:10px;font-size:0.75rem;background:rgba(76,175,80,0.15);color:#4caf50;font-weight:600;">Resolved</span>'
      : '<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:10px;font-size:0.75rem;background:rgba(255,152,0,0.15);color:var(--color-warning, orange);font-weight:600;">Needs match</span>';

    const resolveBtn = editable
      ? (resolved
        ? `<button class="btn btn-sm" data-action="resolve-ingredient" data-index="${idx}" style="font-size:0.7rem;padding:0.15rem 0.4rem;background:none;border:1px solid var(--color-border);border-radius:var(--radius);cursor:pointer;" title="Re-lookup or override nutrition">&#9998;</button>`
        : `<button class="btn btn-secondary btn-sm" data-action="resolve-ingredient" data-index="${idx}" style="font-size:0.75rem;padding:0.2rem 0.5rem;">Resolve</button>`)
      : '';

    const removeBtn = editable
      ? `<button class="btn btn-sm" data-action="remove-ingredient" data-index="${idx}" style="font-size:0.75rem;padding:0.2rem 0.5rem;color:var(--color-danger, #e53935);background:none;border:1px solid var(--color-danger, #e53935);border-radius:var(--radius);" title="Remove">&times;</button>`
      : '';

    return `
      <tr data-index="${idx}">
        <td><input type="text" value="${escapeHTML(ing.name)}" data-field="name" data-index="${idx}" style="${SMALL_INPUT_STYLE}width:100%;"${!editable ? ' disabled' : ''}></td>
        <td><input type="number" value="${ing.amount}" data-field="amount" data-index="${idx}" step="any" style="${SMALL_INPUT_STYLE}width:70px;text-align:right;"${!editable ? ' disabled' : ''}></td>
        <td><input type="text" value="${escapeHTML(ing.unit || 'g')}" data-field="unit" data-index="${idx}" style="${SMALL_INPUT_STYLE}width:50px;"${!editable ? ' disabled' : ''}></td>
        <td style="text-align:right;font-size:0.85rem;">${resolved && ing.calories != null ? Math.round(ing.calories) : '-'}</td>
        <td style="text-align:right;font-size:0.85rem;">${resolved && ing.protein != null ? Math.round(ing.protein * 10) / 10 + 'g' : '-'}</td>
        <td style="text-align:center;">${statusBadge}</td>
        <td style="white-space:nowrap;">
          ${resolveBtn}
          ${removeBtn}
        </td>
      </tr>
    `;
  }).join('');

  // Resolution panel
  let resolutionPanelHTML = '';
  if (resolvingIndex != null && resolvingIndex < ingredients.length) {
    resolutionPanelHTML = renderResolutionPanel(ingredients[resolvingIndex], resolvingIndex);
  }

  return `
    <div class="card" style="margin-bottom:1rem;">
      <h3 style="margin-bottom:0.75rem;">Ingredients</h3>
      ${unresolvedWarning}
      <div style="overflow-x:auto;">
        <table class="data-table ingredient-editor" style="width:100%;">
          <thead>
            <tr>
              <th>Name</th>
              <th style="width:80px;">Amount</th>
              <th style="width:60px;">Unit</th>
              <th style="width:60px;text-align:right;">Cal</th>
              <th style="width:70px;text-align:right;">Protein</th>
              <th style="width:100px;text-align:center;">Status</th>
              <th style="width:120px;">Actions</th>
            </tr>
          </thead>
          <tbody id="ingredient-table-body">
            ${ingredientRows}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="3">Total (${servings} serving${servings > 1 ? 's' : ''})</td>
              <td style="text-align:right;">${Math.round(totals.calories)}</td>
              <td style="text-align:right;">${Math.round(totals.protein * 10) / 10}g</td>
              <td colspan="2"></td>
            </tr>
            ${servings > 1 ? `
            <tr style="font-weight:600;color:var(--color-text-secondary);">
              <td colspan="3">Per Serving</td>
              <td style="text-align:right;">${Math.round(totals.calories / servings)}</td>
              <td style="text-align:right;">${Math.round((totals.protein / servings) * 10) / 10}g</td>
              <td colspan="2"></td>
            </tr>
            ` : ''}
          </tfoot>
        </table>
      </div>
      ${editable ? '<button class="btn btn-secondary btn-sm" data-action="add-ingredient" style="margin-top:0.75rem;">+ Add Ingredient</button>' : ''}
      ${resolutionPanelHTML}
    </div>
  `;
}

// ============================================================
// renderResolutionPanel
// ============================================================

/**
 * Render the ingredient resolution panel (USDA retry, local search, manual creation).
 * @param {Object} ingredient - the unresolved ingredient object
 * @param {number} index - the ingredient's index in the array
 * @returns {string} HTML string
 */
export function renderResolutionPanel(ingredient, index) {
  return `
    <div style="border:2px solid var(--color-primary);border-radius:var(--radius);padding:1rem;margin-top:1rem;background:var(--color-surface);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h4 style="margin:0;">Resolve: ${escapeHTML(ingredient.name || 'Unnamed ingredient')}</h4>
        <button class="btn btn-secondary btn-sm" data-action="cancel-resolve">Cancel</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
        <!-- USDA Retry -->
        <div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:0.75rem;">
          <h5 style="margin:0 0 0.5rem;">Search USDA</h5>
          <input type="text" id="usda-retry-term" value="${escapeHTML(ingredient.name)}" placeholder="Search term" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.5rem;">
          <button class="btn btn-primary btn-sm" data-action="usda-retry" style="width:100%;">Search</button>
          <div id="usda-retry-results" style="margin-top:0.5rem;max-height:200px;overflow-y:auto;"></div>
        </div>

        <!-- Local DB Search -->
        <div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:0.75rem;">
          <h5 style="margin:0 0 0.5rem;">Search Existing Ingredients</h5>
          <input type="text" id="local-search-term" value="${escapeHTML(ingredient.name)}" placeholder="Search term" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.5rem;">
          <button class="btn btn-primary btn-sm" data-action="local-search" style="width:100%;">Search</button>
          <div id="local-search-results" style="margin-top:0.5rem;max-height:200px;overflow-y:auto;"></div>
        </div>

        <!-- Manual Creation -->
        <div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:0.75rem;">
          <h5 style="margin:0 0 0.5rem;">Create Manually</h5>
          <input type="text" id="manual-name" value="${escapeHTML(ingredient.name)}" placeholder="Ingredient name" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.4rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);white-space:nowrap;">Enter nutrition for</span>
            <input type="number" id="manual-amount" value="${ingredient.amount || 0}" min="0" step="any" style="${SMALL_INPUT_STYLE}width:70px;">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);">g</span>
          </div>
          <input type="number" id="manual-cal" placeholder="Calories" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.4rem;">
          <input type="number" id="manual-pro" placeholder="Protein (g)" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.4rem;">
          <input type="number" id="manual-fat" placeholder="Fat (g)" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.4rem;">
          <input type="number" id="manual-carb" placeholder="Carbs (g)" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.4rem;">
          <input type="number" id="manual-fib" placeholder="Fiber (g)" style="${SMALL_INPUT_STYLE}width:100%;margin-bottom:0.5rem;">
          <button class="btn btn-primary btn-sm" data-action="create-manual" style="width:100%;">Create & Use</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// renderInstructionEditor
// ============================================================

/**
 * Render the instruction step editor.
 * @param {string[]} instructions - array of instruction strings
 * @param {Object}   [options]
 * @param {boolean}  [options.editable=true]
 * @returns {string} HTML string
 */
export function renderInstructionEditor(instructions, options = {}) {
  const { editable = true } = options;

  const instructionRows = instructions.map((step, i) => `
    <div class="instruction-row" data-index="${i}" style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.5rem;">
      <span class="instruction-number" style="font-weight:600;padding-top:0.4rem;min-width:1.5rem;color:var(--color-text-secondary);">${i + 1}.</span>
      <textarea data-field="instruction" data-index="${i}" rows="2" style="flex:1;${SMALL_INPUT_STYLE}resize:vertical;line-height:1.5;"${!editable ? ' disabled' : ''}>${escapeHTML(step)}</textarea>
      ${editable ? `<button data-action="remove-instruction" data-index="${i}" title="Remove" style="background:none;border:1px solid var(--color-danger, #e53935);color:var(--color-danger, #e53935);border-radius:var(--radius);padding:0.2rem 0.5rem;cursor:pointer;font-size:1rem;line-height:1;">&times;</button>` : ''}
    </div>
  `).join('');

  return `
    <div class="card" style="margin-bottom:1rem;">
      <h3 style="margin-bottom:0.75rem;">Instructions</h3>
      <div id="instruction-editor">
        ${instructionRows || '<p class="text-secondary" style="font-size:0.85rem;">No instructions yet.</p>'}
      </div>
      ${editable ? '<button class="btn btn-secondary btn-sm" data-action="add-instruction" style="margin-top:0.5rem;">+ Add Step</button>' : ''}
    </div>
  `;
}

// ============================================================
// renderNutritionSummary
// ============================================================

/**
 * Render the nutrition summary card.
 * @param {Array}  ingredients - array of ingredient objects
 * @param {number} servings
 * @returns {string} HTML string
 */
export function renderNutritionSummary(ingredients, servings) {
  const s = servings || 1;
  const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  let unresolvedCount = 0;

  for (const ing of ingredients) {
    if (!ing.resolved) { unresolvedCount++; continue; }
    totals.calories += ing.calories || 0;
    totals.protein  += ing.protein || 0;
    totals.fat      += ing.fat || 0;
    totals.carbs    += ing.carbs || 0;
    totals.fiber    += ing.fiber || 0;
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 10) / 10;

  const perServing = {
    calories: Math.round(totals.calories / s),
    protein:  Math.round((totals.protein / s) * 10) / 10,
    fat:      Math.round((totals.fat / s) * 10) / 10,
    carbs:    Math.round((totals.carbs / s) * 10) / 10,
    fiber:    Math.round((totals.fiber / s) * 10) / 10,
  };

  const display = s > 1 ? perServing : totals;

  const nutritionWarning = unresolvedCount > 0
    ? `<p style="text-align:center;font-size:0.75rem;color:var(--color-warning, orange);margin-top:0.5rem;">Nutrition totals exclude ${unresolvedCount} unresolved ingredient${unresolvedCount > 1 ? 's' : ''}.</p>`
    : '';

  return `
    <div class="card" style="margin-bottom:1rem;">
      <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:1rem;text-align:center;">
        <div>
          <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-cal);">${display.calories}</div>
          <div style="font-size:0.75rem;color:var(--color-text-secondary);">Calories${s > 1 ? '/srv' : ''}</div>
        </div>
        <div>
          <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-protein);">${display.protein}g</div>
          <div style="font-size:0.75rem;color:var(--color-text-secondary);">Protein</div>
        </div>
        <div>
          <div style="font-size:1.5rem;font-weight:700;">${display.fat}g</div>
          <div style="font-size:0.75rem;color:var(--color-text-secondary);">Fat</div>
        </div>
        <div>
          <div style="font-size:1.5rem;font-weight:700;">${display.carbs}g</div>
          <div style="font-size:0.75rem;color:var(--color-text-secondary);">Carbs</div>
        </div>
        <div>
          <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-fiber);">${display.fiber}g</div>
          <div style="font-size:0.75rem;color:var(--color-text-secondary);">Fiber</div>
        </div>
      </div>
      ${nutritionWarning}
    </div>
  `;
}

// ============================================================
// attachEditorEvents
// ============================================================

/**
 * Attach delegated event listeners for editor interactions.
 *
 * @param {HTMLElement} container - DOM element to attach listeners to
 * @param {Object} callbacks
 * @param {Function} callbacks.onIngredientChange   - (index, field, value)
 * @param {Function} callbacks.onIngredientRemove   - (index)
 * @param {Function} callbacks.onIngredientAdd      - ()
 * @param {Function} callbacks.onResolve            - (index)
 * @param {Function} callbacks.onCancelResolve      - ()
 * @param {Function} callbacks.onUsdaRetry          - (term, index)
 * @param {Function} callbacks.onLocalSearch        - (query)
 * @param {Function} callbacks.onUseIngredient      - (ingredientData, index)
 * @param {Function} callbacks.onCreateManual       - (data, index)
 * @param {Function} callbacks.onInstructionChange  - (index, value)
 * @param {Function} callbacks.onInstructionRemove  - (index)
 * @param {Function} callbacks.onInstructionAdd     - ()
 */
export function attachEditorEvents(container, callbacks) {
  // --- Click delegation ---
  container.addEventListener('click', (e) => {
    // Add ingredient
    if (e.target.closest('[data-action="add-ingredient"]')) {
      callbacks.onIngredientAdd?.();
      return;
    }

    // Remove ingredient
    const removeIngBtn = e.target.closest('[data-action="remove-ingredient"]');
    if (removeIngBtn) {
      callbacks.onIngredientRemove?.(parseInt(removeIngBtn.dataset.index, 10));
      return;
    }

    // Resolve ingredient
    const resolveBtn = e.target.closest('[data-action="resolve-ingredient"]');
    if (resolveBtn) {
      callbacks.onResolve?.(parseInt(resolveBtn.dataset.index, 10));
      return;
    }

    // Cancel resolve
    if (e.target.closest('[data-action="cancel-resolve"]')) {
      callbacks.onCancelResolve?.();
      return;
    }

    // USDA retry search
    if (e.target.closest('[data-action="usda-retry"]')) {
      const term = container.querySelector('#usda-retry-term')?.value?.trim();
      if (term) {
        callbacks.onUsdaRetry?.(term);
      }
      return;
    }

    // Local DB search
    if (e.target.closest('[data-action="local-search"]')) {
      const query = container.querySelector('#local-search-term')?.value?.trim();
      if (query) {
        callbacks.onLocalSearch?.(query);
      }
      return;
    }

    // Use ingredient from search results
    const useBtn = e.target.closest('[data-action="use-ingredient"]');
    if (useBtn) {
      const data = JSON.parse(useBtn.dataset.ingredient);
      callbacks.onUseIngredient?.(data);
      return;
    }

    // Create manual ingredient
    if (e.target.closest('[data-action="create-manual"]')) {
      const name   = container.querySelector('#manual-name')?.value?.trim();
      const cal    = parseFloat(container.querySelector('#manual-cal')?.value) || 0;
      const pro    = parseFloat(container.querySelector('#manual-pro')?.value) || 0;
      const fat    = parseFloat(container.querySelector('#manual-fat')?.value) || 0;
      const carb   = parseFloat(container.querySelector('#manual-carb')?.value) || 0;
      const fib    = parseFloat(container.querySelector('#manual-fib')?.value) || 0;
      const amount = parseFloat(container.querySelector('#manual-amount')?.value) || 100;

      // Convert from "per amount used" to "per 100g" for storage
      const factor = amount > 0 ? 100 / amount : 1;
      callbacks.onCreateManual?.({
        name,
        cal:  cal * factor,
        pro:  pro * factor,
        fat:  fat * factor,
        carb: carb * factor,
        fib:  fib * factor,
      });
      return;
    }

    // Add instruction
    if (e.target.closest('[data-action="add-instruction"]')) {
      callbacks.onInstructionAdd?.();
      return;
    }

    // Remove instruction
    const removeInsBtn = e.target.closest('[data-action="remove-instruction"]');
    if (removeInsBtn) {
      callbacks.onInstructionRemove?.(parseInt(removeInsBtn.dataset.index, 10));
      return;
    }
  });

  // --- Change delegation (selects, number inputs) ---
  container.addEventListener('change', (e) => {
    // Ingredient field changes
    if (e.target.dataset.field && e.target.dataset.index !== undefined) {
      const field = e.target.dataset.field;
      if (field === 'instruction') {
        callbacks.onInstructionChange?.(parseInt(e.target.dataset.index, 10), e.target.value);
      } else {
        const idx = parseInt(e.target.dataset.index, 10);
        let val = e.target.value;
        if (field === 'amount') val = parseFloat(val) || 0;
        callbacks.onIngredientChange?.(idx, field, val);
      }
    }
  });

  // --- Input delegation (live typing) ---
  container.addEventListener('input', (e) => {
    // Instruction textarea live update
    if (e.target.dataset.field === 'instruction' && e.target.dataset.index !== undefined) {
      callbacks.onInstructionChange?.(parseInt(e.target.dataset.index, 10), e.target.value);
    }

    // Ingredient field live update (for text fields like name, unit)
    if (e.target.dataset.field && e.target.dataset.field !== 'instruction' && e.target.dataset.index !== undefined) {
      const field = e.target.dataset.field;
      if (field === 'name' || field === 'unit') {
        callbacks.onIngredientChange?.(parseInt(e.target.dataset.index, 10), field, e.target.value);
      }
    }
  });
}
