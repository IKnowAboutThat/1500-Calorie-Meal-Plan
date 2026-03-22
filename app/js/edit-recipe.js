/**
 * edit-recipe.js - Full-page recipe editor for existing recipes.
 *
 * Route: #edit-recipe/:id
 * Loads a recipe by ID, builds an editable draft, and provides full
 * structural editing of ingredients, instructions, and metadata.
 */

import { getRecipe, updateRecipe, lookupIngredient, searchIngredients, createIngredient } from './api.js';
import { reloadRecipes } from './recipe-cache.js';
import {
  renderIngredientEditor,
  renderInstructionEditor,
  renderResolutionPanel,
  renderNutritionSummary,
  computeIngredientMacros,
  attachEditorEvents,
} from './recipe-editor-components.js';

// Dynamic import for app.js (toast, modal)
async function getApp() {
  return await import('./app.js');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// State
// ============================================================

let state = {
  recipeId: null,
  originalRecipe: null,
  draftRecipe: null,
  resolvingIndex: null,
  saving: false,
};

let _container = null;

// ============================================================
// Draft helpers
// ============================================================

function buildDraftFromRecipe(recipe) {
  // Normalize instructions: may be a JSON string, array, or null
  let instructions = recipe.instructions || [];
  if (typeof instructions === 'string') {
    try {
      instructions = JSON.parse(instructions);
    } catch {
      instructions = instructions.split('\n').filter(s => s.trim());
    }
  }
  if (!Array.isArray(instructions)) {
    instructions = [];
  }

  const ingredients = (recipe.ingredients || []).map((ing, idx) => ({
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit || 'g',
    section: ing.section || null,
    ingredient_id: ing.ingredient_id,
    resolved: true,
    resolution_error: null,
    calories_per_100g: ing.calories_per_100g || 0,
    protein_per_100g: ing.protein_per_100g || 0,
    fat_per_100g: ing.fat_per_100g || 0,
    carbs_per_100g: ing.carbs_per_100g || 0,
    fiber_per_100g: ing.fiber_per_100g || 0,
    calories: ing.calories || 0,
    protein: ing.protein || 0,
    fat: ing.fat || 0,
    carbs: ing.carbs || 0,
    fiber: ing.fiber || 0,
  }));

  return {
    name: recipe.name || '',
    description: recipe.description || '',
    servings: recipe.servings || 1,
    cuisine: recipe.cuisine || '',
    meal_type: recipe.meal_type || 'meal',
    main_protein: recipe.main_protein || '',
    prep_time_min: recipe.prep_time_min || null,
    cook_time_min: recipe.cook_time_min || null,
    marinate_time_min: recipe.marinate_time_min || null,
    phase: recipe.phase || 'standard',
    instructions,
    ingredients,
  };
}

function recalcRowMacros(ing) {
  if (!ing.resolved || ing.calories_per_100g == null) return;
  const macros = computeIngredientMacros(ing);
  ing.calories = macros.calories;
  ing.protein = macros.protein;
  ing.fat = macros.fat;
  ing.carbs = macros.carbs;
  ing.fiber = macros.fiber;
}

function blankIngredient() {
  return {
    name: '', amount: 0, unit: 'g', section: null,
    ingredient_id: null, resolved: false, resolution_error: null,
    calories_per_100g: 0, protein_per_100g: 0, fat_per_100g: 0,
    carbs_per_100g: 0, fiber_per_100g: 0,
    calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0,
  };
}

// ============================================================
// Resolution helpers
// ============================================================

function applyResolvedIngredient(data) {
  const idx = state.resolvingIndex;
  if (idx == null || !state.draftRecipe) return;
  const ing = state.draftRecipe.ingredients[idx];
  if (!ing) return;

  ing.ingredient_id = data.ingredient_id || data.id;
  ing.name = data.name || ing.name;
  ing.calories_per_100g = data.calories_per_100g ?? 0;
  ing.protein_per_100g = data.protein_per_100g ?? 0;
  ing.fat_per_100g = data.fat_per_100g ?? 0;
  ing.carbs_per_100g = data.carbs_per_100g ?? 0;
  ing.fiber_per_100g = data.fiber_per_100g ?? 0;
  ing.resolved = true;
  ing.resolution_error = null;

  recalcRowMacros(ing);
  state.resolvingIndex = null;
}

// ============================================================
// Search result renderers
// ============================================================

function renderUSDAResult(result) {
  if (!result || (!result.ingredient_id && !result.id)) {
    return '<p style="font-size:0.8rem;color:var(--color-text-secondary);">No match found.</p>';
  }
  const data = JSON.stringify({
    ingredient_id: result.ingredient_id || result.id,
    name: result.name,
    calories_per_100g: result.calories_per_100g,
    protein_per_100g: result.protein_per_100g,
    fat_per_100g: result.fat_per_100g,
    carbs_per_100g: result.carbs_per_100g,
    fiber_per_100g: result.fiber_per_100g,
  }).replace(/"/g, '&quot;');

  return `
    <div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:0.5rem;margin-bottom:0.25rem;font-size:0.8rem;">
      <strong>${escapeHTML(result.name)}</strong>
      <div style="color:var(--color-text-secondary);margin-top:0.25rem;">
        ${Math.round(result.calories_per_100g || 0)} cal &middot;
        ${Math.round((result.protein_per_100g || 0) * 10) / 10}g P &middot;
        ${Math.round((result.fat_per_100g || 0) * 10) / 10}g F &middot;
        ${Math.round((result.carbs_per_100g || 0) * 10) / 10}g C
        /100g
      </div>
      <button class="btn btn-primary btn-sm" data-action="use-ingredient" data-ingredient="${data}" style="margin-top:0.35rem;font-size:0.75rem;padding:0.15rem 0.5rem;">Use This</button>
    </div>
  `;
}

function renderLocalResult(item) {
  const data = JSON.stringify({
    ingredient_id: item.id || item.ingredient_id,
    name: item.name,
    calories_per_100g: item.calories_per_100g,
    protein_per_100g: item.protein_per_100g,
    fat_per_100g: item.fat_per_100g,
    carbs_per_100g: item.carbs_per_100g,
    fiber_per_100g: item.fiber_per_100g,
  }).replace(/"/g, '&quot;');

  return `
    <div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:0.5rem;margin-bottom:0.25rem;font-size:0.8rem;">
      <strong>${escapeHTML(item.name)}</strong>
      <div style="color:var(--color-text-secondary);margin-top:0.25rem;">
        ${Math.round(item.calories_per_100g || 0)} cal &middot;
        ${Math.round((item.protein_per_100g || 0) * 10) / 10}g P &middot;
        ${Math.round((item.fat_per_100g || 0) * 10) / 10}g F &middot;
        ${Math.round((item.carbs_per_100g || 0) * 10) / 10}g C
        /100g
      </div>
      <button class="btn btn-primary btn-sm" data-action="use-ingredient" data-ingredient="${data}" style="margin-top:0.35rem;font-size:0.75rem;padding:0.15rem 0.5rem;">Use This</button>
    </div>
  `;
}

// ============================================================
// Toast helper
// ============================================================

async function showToast(message, type = 'info') {
  try {
    const app = await getApp();
    if (app.showToast) { app.showToast(message, type); return; }
  } catch {}
}

// ============================================================
// Render
// ============================================================

function renderPage() {
  const draft = state.draftRecipe;
  if (!draft) return '<p>No recipe data.</p>';

  const inputStyle = 'width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;background:var(--color-surface);';

  const fieldsHTML = `
    <div class="card" style="margin-bottom:1rem;">
      <h3 style="margin-bottom:0.75rem;">Recipe Details</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Name</label>
          <input type="text" data-draft-field="name" value="${escapeHTML(draft.name)}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Servings</label>
          <input type="number" data-draft-field="servings" value="${draft.servings}" min="1" style="${inputStyle}">
        </div>
      </div>

      <div style="margin-top:1rem;">
        <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Description</label>
        <input type="text" data-draft-field="description" value="${escapeHTML(draft.description)}" style="${inputStyle}">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Cuisine</label>
          <input type="text" data-draft-field="cuisine" value="${escapeHTML(draft.cuisine)}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Meal Type</label>
          <select data-draft-field="meal_type" style="${inputStyle}">
            <option value="meal"${draft.meal_type === 'meal' ? ' selected' : ''}>Meal</option>
            <option value="snack"${draft.meal_type === 'snack' ? ' selected' : ''}>Snack</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Main Protein</label>
          <input type="text" data-draft-field="main_protein" value="${escapeHTML(draft.main_protein)}" style="${inputStyle}">
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Prep Time (min)</label>
          <input type="number" data-draft-field="prep_time_min" value="${draft.prep_time_min || ''}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Cook Time (min)</label>
          <input type="number" data-draft-field="cook_time_min" value="${draft.cook_time_min || ''}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Marinate Time (min)</label>
          <input type="number" data-draft-field="marinate_time_min" value="${draft.marinate_time_min || ''}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Phase</label>
          <select data-draft-field="phase" style="${inputStyle}">
            <option value="standard"${draft.phase === 'standard' ? ' selected' : ''}>Standard</option>
            <option value="luteal"${draft.phase === 'luteal' ? ' selected' : ''}>Luteal</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const ingredientsHTML = renderIngredientEditor(draft.ingredients, {
    resolvingIndex: state.resolvingIndex,
    editable: true,
    servings: draft.servings,
  });

  const nutritionHTML = renderNutritionSummary(draft.ingredients, draft.servings);

  const instructionsHTML = renderInstructionEditor(draft.instructions, {
    editable: true,
  });

  const actionsHTML = `
    <div class="flex gap-1" style="margin-top:1rem;display:flex;gap:0.75rem;">
      <button class="btn btn-primary" data-action="save-recipe">Save Changes</button>
      <button class="btn btn-secondary" data-action="cancel-edit">Cancel</button>
    </div>
  `;

  return `
    <h2>Edit Recipe: ${escapeHTML(draft.name)}</h2>
    ${fieldsHTML}
    ${ingredientsHTML}
    ${nutritionHTML}
    ${instructionsHTML}
    ${actionsHTML}
  `;
}

function rerender() {
  if (!_container) return;
  _container.innerHTML = `<div class="page-transition">${renderPage()}</div>`;
}

// ============================================================
// Save
// ============================================================

async function handleSave() {
  const draft = state.draftRecipe;
  if (!draft) return;

  // Validate
  if (!draft.name.trim()) {
    showToast('Recipe name is required', 'error');
    return;
  }

  if (draft.ingredients.length === 0) {
    showToast('At least one ingredient is required', 'error');
    return;
  }

  const unresolvedCount = draft.ingredients.filter(i => !i.resolved).length;
  if (unresolvedCount > 0) {
    showToast(`${unresolvedCount} ingredient${unresolvedCount > 1 ? 's' : ''} still need${unresolvedCount === 1 ? 's' : ''} to be resolved`, 'error');
    return;
  }

  state.saving = true;

  const payload = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    servings: draft.servings,
    cuisine: draft.cuisine.trim(),
    meal_type: draft.meal_type,
    main_protein: draft.main_protein.trim(),
    prep_time_min: draft.prep_time_min || null,
    cook_time_min: draft.cook_time_min || null,
    marinate_time_min: draft.marinate_time_min || null,
    phase: draft.phase,
    instructions: draft.instructions.filter(s => s.trim()),
    ingredients: draft.ingredients.map((ing, idx) => ({
      ingredient_id: ing.ingredient_id,
      amount: ing.amount,
      unit: ing.unit,
      sort_order: idx,
      section: ing.section,
    })),
  };

  try {
    await updateRecipe(state.recipeId, payload);
    await reloadRecipes();
    showToast(`"${draft.name}" updated successfully!`, 'success');
    location.hash = 'recipes';
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
    state.saving = false;
  }
}

// ============================================================
// Event wiring
// ============================================================

function attachEvents(container) {
  _container = container;

  // Metadata field changes (change for selects/numbers, input for text)
  container.addEventListener('change', (e) => {
    if (e.target.dataset.draftField && state.draftRecipe) {
      const field = e.target.dataset.draftField;
      let val = e.target.value;
      if (field === 'servings') val = parseInt(val, 10) || 1;
      else if (['prep_time_min', 'cook_time_min', 'marinate_time_min'].includes(field)) val = parseInt(val, 10) || null;
      state.draftRecipe[field] = val;
      if (field === 'servings') rerender();
    }
  });

  container.addEventListener('input', (e) => {
    if (e.target.dataset.draftField && state.draftRecipe) {
      const field = e.target.dataset.draftField;
      if (!['servings', 'prep_time_min', 'cook_time_min', 'marinate_time_min'].includes(field)) {
        state.draftRecipe[field] = e.target.value;
      }
    }
  });

  // Page-level click actions (save, cancel)
  container.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="save-recipe"]')) {
      await handleSave();
      return;
    }
    if (e.target.closest('[data-action="cancel-edit"]')) {
      location.hash = 'recipes';
      return;
    }
  });

  // Shared editor event delegation
  attachEditorEvents(container, {
    onIngredientChange(index, field, value) {
      if (!state.draftRecipe) return;
      const ing = state.draftRecipe.ingredients[index];
      if (!ing) return;

      if (field === 'name') {
        if (value !== ing.name) {
          ing.name = value;
          ing.resolved = false;
          ing.ingredient_id = null;
          ing.resolution_error = null;
          ing.calories_per_100g = 0;
          ing.protein_per_100g = 0;
          ing.fat_per_100g = 0;
          ing.carbs_per_100g = 0;
          ing.fiber_per_100g = 0;
          ing.calories = 0;
          ing.protein = 0;
          ing.fat = 0;
          ing.carbs = 0;
          ing.fiber = 0;
          rerender();
        }
      } else if (field === 'amount') {
        ing.amount = parseFloat(value) || 0;
        recalcRowMacros(ing);
        rerender();
      } else if (field === 'unit') {
        ing.unit = value;
      }
    },

    onIngredientRemove(index) {
      state.draftRecipe.ingredients.splice(index, 1);
      if (state.resolvingIndex != null) {
        if (state.resolvingIndex === index) state.resolvingIndex = null;
        else if (state.resolvingIndex > index) state.resolvingIndex--;
      }
      rerender();
    },

    onIngredientAdd() {
      state.draftRecipe.ingredients.push(blankIngredient());
      rerender();
    },

    onResolve(index) {
      state.resolvingIndex = index;
      rerender();
    },

    onCancelResolve() {
      state.resolvingIndex = null;
      rerender();
    },

    async onUsdaRetry(term) {
      const resultsDiv = container.querySelector('#usda-retry-results');
      if (resultsDiv) resultsDiv.innerHTML = '<p style="font-size:0.8rem;color:var(--color-text-secondary);">Searching...</p>';
      try {
        const rIdx = state.resolvingIndex;
        const ing = state.draftRecipe.ingredients[rIdx];
        const result = await lookupIngredient(term, ing.amount || 100, 'g');
        if (resultsDiv) {
          resultsDiv.innerHTML = renderUSDAResult(result);
        }
      } catch (err) {
        if (resultsDiv) resultsDiv.innerHTML = `<p style="font-size:0.8rem;color:var(--color-danger, #e53935);">Not found: ${escapeHTML(err.message)}</p>`;
      }
    },

    async onLocalSearch(query) {
      const resultsDiv = container.querySelector('#local-search-results');
      if (resultsDiv) resultsDiv.innerHTML = '<p style="font-size:0.8rem;color:var(--color-text-secondary);">Searching...</p>';
      try {
        const results = await searchIngredients(query);
        const items = Array.isArray(results) ? results : (results.ingredients || []);
        if (resultsDiv) {
          resultsDiv.innerHTML = items.length > 0
            ? items.map(r => renderLocalResult(r)).join('')
            : '<p style="font-size:0.8rem;color:var(--color-text-secondary);">No matches found.</p>';
        }
      } catch (err) {
        if (resultsDiv) resultsDiv.innerHTML = `<p style="font-size:0.8rem;color:var(--color-danger, #e53935);">Error: ${escapeHTML(err.message)}</p>`;
      }
    },

    onUseIngredient(data) {
      applyResolvedIngredient(data);
      rerender();
    },

    async onCreateManual({ name, cal, pro, fat, carb, fib }) {
      if (!name) {
        showToast('Ingredient name is required', 'error');
        return;
      }

      try {
        const created = await createIngredient({
          name,
          calories_per_100g: cal,
          protein_per_100g: pro,
          fat_per_100g: fat,
          carbs_per_100g: carb,
          fiber_per_100g: fib,
        });
        applyResolvedIngredient({
          ingredient_id: created.id || created.ingredient_id,
          name: created.name || name,
          calories_per_100g: cal,
          protein_per_100g: pro,
          fat_per_100g: fat,
          carbs_per_100g: carb,
          fiber_per_100g: fib,
        });
        rerender();
      } catch (err) {
        showToast(`Create failed: ${err.message}`, 'error');
      }
    },

    onInstructionChange(index, value) {
      if (state.draftRecipe) {
        state.draftRecipe.instructions[index] = value;
      }
    },

    onInstructionRemove(index) {
      state.draftRecipe.instructions.splice(index, 1);
      rerender();
    },

    onInstructionAdd() {
      state.draftRecipe.instructions.push('');
      rerender();
    },
  });
}

// ============================================================
// Main export
// ============================================================

export async function renderEditRecipe(container, recipeId) {
  // Reset state
  state = {
    recipeId: parseInt(recipeId, 10),
    originalRecipe: null,
    draftRecipe: null,
    resolvingIndex: null,
    saving: false,
  };
  _container = container;

  // Show loading
  container.innerHTML = `
    <div class="page-transition" style="text-align:center;padding:4rem 2rem;">
      <div class="spinner" style="margin:0 auto 1.5rem;"></div>
      <h3>Loading recipe...</h3>
    </div>
  `;

  try {
    const recipe = await getRecipe(state.recipeId);
    if (!recipe) {
      container.innerHTML = `
        <div class="page-transition">
          <div class="card" style="text-align:center;padding:3rem;">
            <h3>Recipe not found</h3>
            <p class="text-secondary">The recipe you are looking for does not exist.</p>
            <a href="#recipes" class="btn btn-secondary" style="margin-top:1rem;">Back to Recipes</a>
          </div>
        </div>
      `;
      return;
    }

    state.originalRecipe = recipe;
    state.draftRecipe = buildDraftFromRecipe(recipe);

    rerender();
    attachEvents(container);
  } catch (err) {
    container.innerHTML = `
      <div class="page-transition">
        <div class="card" style="text-align:center;padding:3rem;">
          <h3>Recipe not found</h3>
          <p class="text-secondary">${escapeHTML(err.message)}</p>
          <a href="#recipes" class="btn btn-secondary" style="margin-top:1rem;">Back to Recipes</a>
        </div>
      </div>
    `;
  }
}
