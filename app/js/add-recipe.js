/**
 * add-recipe.js - Paste-to-parse recipe creation UI with full draft editor.
 *
 * Flow: Paste text -> Parse with AI -> Draft editor (edit fields, resolve
 *       unresolved ingredients, edit instructions) -> Save
 */

import { parseRecipe, saveRecipe as apiSaveRecipe, lookupIngredient, searchIngredients, createIngredient } from './api.js';
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
  view: 'paste',        // 'paste' | 'loading' | 'preview' | 'saving'
  parsedRecipe: null,
  draftRecipe: null,     // canonical editable state
  lookupErrors: [],
  imageData: null,       // base64 string (no prefix)
  imageType: null,       // e.g. 'image/png'
  resolvingIndex: null,  // which ingredient row is being resolved (null = none)
};

// Reference to current container for re-renders
let _container = null;

// ============================================================
// Draft helpers
// ============================================================

function buildDraftFromParsed(parsed) {
  const ingredients = (parsed.ingredients || []).map(ing => ({
    name: ing.name || '',
    amount: ing.amount ?? 0,
    unit: ing.unit || 'g',
    section: ing.section || '',
    ingredient_id: ing.ingredient_id || null,
    resolved: ing.resolved !== false && !!ing.ingredient_id,
    resolution_error: ing.resolution_error || null,
    calories_per_100g: ing.calories_per_100g ?? null,
    protein_per_100g: ing.protein_per_100g ?? null,
    fat_per_100g: ing.fat_per_100g ?? null,
    carbs_per_100g: ing.carbs_per_100g ?? null,
    fiber_per_100g: ing.fiber_per_100g ?? null,
    calories: ing.calories ?? null,
    protein: ing.protein ?? null,
    fat: ing.fat ?? null,
    carbs: ing.carbs ?? null,
    fiber: ing.fiber ?? null,
  }));

  // Also fold in lookup_errors as unresolved ingredients if they aren't already present
  const existingNames = new Set(ingredients.map(i => i.name.toLowerCase()));
  for (const err of (parsed.lookup_errors || [])) {
    if (!existingNames.has((err.ingredient || '').toLowerCase())) {
      ingredients.push({
        name: err.ingredient || '',
        amount: err.amount ?? 0,
        unit: err.unit || 'g',
        section: '',
        ingredient_id: null,
        resolved: false,
        resolution_error: err.error || 'USDA lookup failed',
        calories_per_100g: null, protein_per_100g: null, fat_per_100g: null,
        carbs_per_100g: null, fiber_per_100g: null,
        calories: null, protein: null, fat: null, carbs: null, fiber: null,
      });
    }
  }

  return {
    name: parsed.name || '',
    description: parsed.description || '',
    servings: parsed.servings || 1,
    cuisine: parsed.cuisine || '',
    meal_type: parsed.meal_type || 'meal',
    main_protein: parsed.main_protein || '',
    prep_time_min: parsed.prep_time_min || null,
    cook_time_min: parsed.cook_time_min || null,
    phase: parsed.phase || 'standard',
    instructions: [...(parsed.instructions || [])],
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
    name: '', amount: 0, unit: 'g', section: '',
    ingredient_id: null, resolved: false, resolution_error: null,
    calories_per_100g: null, protein_per_100g: null, fat_per_100g: null,
    carbs_per_100g: null, fiber_per_100g: null,
    calories: null, protein: null, fat: null, carbs: null, fiber: null,
  };
}

// ============================================================
// Render: Paste View
// ============================================================

function renderPasteView() {
  return `
    <div class="add-recipe-paste">
      <h2>Add New Recipe</h2>
      <p class="text-secondary">Paste any recipe text below and let AI parse it into a structured, nutritionally complete recipe.</p>

      <div class="card" style="margin-top: 1.5rem;">
        <div id="image-upload-area" style="border: 2px dashed var(--color-border); border-radius: var(--radius); padding: 1.5rem; text-align: center; cursor: pointer; margin-bottom: 1rem; transition: border-color 0.2s, background 0.2s;">
          <div id="image-upload-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 0.5rem;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <p style="margin: 0; color: var(--color-text-secondary); font-size: 0.9rem;">Drop a recipe image here or click to upload</p>
            <p style="margin: 0.25rem 0 0; color: var(--color-text-secondary); font-size: 0.75rem;">PNG, JPG, or WebP</p>
          </div>
          <div id="image-preview-container" style="display: none;">
            <img id="image-preview" style="max-width: 100%; max-height: 300px; border-radius: var(--radius);" />
            <button class="btn btn-secondary btn-sm" id="remove-image-btn" style="margin-top: 0.5rem;">Remove Image</button>
          </div>
          <input type="file" id="image-file-input" accept="image/png,image/jpeg,image/webp" style="display: none;" />
        </div>

        <textarea id="recipe-text-input"
          placeholder="Paste recipe text here, add notes about the image, or describe what you'd like changed...&#10;&#10;You can use text alone, an image alone, or both together."
          rows="10"
          style="width: 100%; font-family: var(--font-family); font-size: 0.95rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius); resize: vertical; background: var(--color-surface); line-height: 1.6;"
        ></textarea>

        <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button class="btn btn-primary" id="parse-recipe-btn" style="display: flex; align-items: center; gap: 0.5rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>
            Parse with AI
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// Render: Loading View
// ============================================================

function renderLoadingView() {
  return `
    <div class="add-recipe-loading" style="text-align: center; padding: 4rem 2rem;">
      <div class="spinner" style="margin: 0 auto 1.5rem;"></div>
      <h3>Parsing your recipe...</h3>
      <p class="text-secondary">Claude is extracting ingredients and steps, then we're looking up nutrition data from USDA.</p>
    </div>
  `;
}

// ============================================================
// Render: Preview / Draft Editor View
// ============================================================

function renderPreviewView() {
  const draft = state.draftRecipe;
  if (!draft) return '<p>No recipe data.</p>';

  const inputStyle = 'width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;background:var(--color-surface);';

  // --- Top-level fields ---
  const fieldsHTML = `
    <div class="card" style="margin-bottom:1rem;">
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

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Prep Time (min)</label>
          <input type="number" data-draft-field="prep_time_min" value="${draft.prep_time_min || ''}" style="${inputStyle}">
        </div>
        <div>
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Cook Time (min)</label>
          <input type="number" data-draft-field="cook_time_min" value="${draft.cook_time_min || ''}" style="${inputStyle}">
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

  // --- Shared components ---
  const ingredientsHTML = renderIngredientEditor(draft.ingredients, {
    resolvingIndex: state.resolvingIndex,
    editable: true,
    servings: draft.servings,
  });

  const nutritionHTML = renderNutritionSummary(draft.ingredients, draft.servings);

  const instructionsHTML = renderInstructionEditor(draft.instructions, {
    editable: true,
  });

  // --- Parse warnings ---
  const parseWarnings = state.parsedRecipe?.parse_warnings || [];
  const parseWarningHTML = parseWarnings.length > 0 ? `
    <div class="card" style="border-left:3px solid var(--color-accent);margin-bottom:1rem;">
      <h4 style="margin-bottom:0.5rem;">Parse Warnings</h4>
      ${parseWarnings.map(w => `
        <div style="margin-bottom:0.5rem;font-size:0.85rem;">
          ${escapeHTML(w.message || w)}
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="add-recipe-preview">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2>Review Recipe</h2>
        <button class="btn btn-secondary btn-sm" id="back-to-paste">Back</button>
      </div>

      ${parseWarningHTML}
      ${fieldsHTML}
      ${ingredientsHTML}
      ${nutritionHTML}
      ${instructionsHTML}

      <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;">
        <button class="btn btn-secondary" id="back-to-paste-bottom">Back to Edit</button>
        <button class="btn btn-primary" id="save-recipe-btn" style="display:flex;align-items:center;gap:0.5rem;">
          Save Recipe
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// Event Handling
// ============================================================

function handleImageFile(file, container) {
  if (!file || !file.type.match(/^image\/(png|jpeg|webp)$/)) {
    showToast('Please upload a PNG, JPG, or WebP image', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    state.imageType = file.type;
    state.imageData = dataUrl.split(',')[1]; // strip data:...;base64, prefix
    const preview = container.querySelector('#image-preview');
    const previewContainer = container.querySelector('#image-preview-container');
    const placeholder = container.querySelector('#image-upload-placeholder');
    if (preview && previewContainer && placeholder) {
      preview.src = dataUrl;
      previewContainer.style.display = 'block';
      placeholder.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);
}

function renderUSDAResult(result) {
  // result from lookupIngredient: { ingredient_id, name, calories_per_100g, ... }
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

function attachEvents(container) {
  _container = container;

  // Image upload: click area to trigger file input
  container.addEventListener('click', (e) => {
    const uploadArea = e.target.closest('#image-upload-area');
    if (uploadArea && !e.target.closest('#remove-image-btn')) {
      container.querySelector('#image-file-input')?.click();
    }
    // Remove image button
    if (e.target.closest('#remove-image-btn')) {
      e.stopPropagation();
      state.imageData = null;
      state.imageType = null;
      const preview = container.querySelector('#image-preview-container');
      const placeholder = container.querySelector('#image-upload-placeholder');
      if (preview) preview.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
      const fileInput = container.querySelector('#image-file-input');
      if (fileInput) fileInput.value = '';
    }
  });

  // File input change
  container.addEventListener('change', (e) => {
    if (e.target.id === 'image-file-input' && e.target.files?.[0]) {
      handleImageFile(e.target.files[0], container);
    }

    // Draft top-level field changes
    if (e.target.dataset.draftField && state.draftRecipe) {
      const field = e.target.dataset.draftField;
      let val = e.target.value;
      if (field === 'servings') val = parseInt(val, 10) || 1;
      else if (field === 'prep_time_min' || field === 'cook_time_min') val = parseInt(val, 10) || null;
      state.draftRecipe[field] = val;
      // Re-render only for servings (affects totals display)
      if (field === 'servings') render(container);
    }
  });

  // Also handle input events for live updates on draft fields
  container.addEventListener('input', (e) => {
    // Draft top-level field live updates (non-numeric)
    if (e.target.dataset.draftField && state.draftRecipe) {
      const field = e.target.dataset.draftField;
      if (!['servings', 'prep_time_min', 'cook_time_min'].includes(field)) {
        state.draftRecipe[field] = e.target.value;
      }
    }
  });

  // Drag and drop
  const uploadArea = container.querySelector('#image-upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--color-primary)';
      uploadArea.style.background = 'var(--color-surface)';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = 'var(--color-border)';
      uploadArea.style.background = '';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--color-border)';
      uploadArea.style.background = '';
      if (e.dataTransfer.files?.[0]) {
        handleImageFile(e.dataTransfer.files[0], container);
      }
    });
  }

  // Page-level click actions (parse, back, save)
  container.addEventListener('click', async (e) => {
    // Parse button
    if (e.target.closest('#parse-recipe-btn')) {
      const textarea = container.querySelector('#recipe-text-input');
      const text = textarea?.value?.trim();
      if (!text && !state.imageData) {
        showToast('Please paste a recipe or upload an image first', 'error');
        return;
      }

      state.view = 'loading';
      render(container);

      try {
        const result = await parseRecipe({ text, imageData: state.imageData, imageType: state.imageType });
        state.parsedRecipe = result;
        state.lookupErrors = result.lookup_errors || [];
        state.draftRecipe = buildDraftFromParsed(result);
        state.resolvingIndex = null;
        state.view = 'preview';
      } catch (err) {
        showToast(`Parse failed: ${err.message}`, 'error');
        state.view = 'paste';
      }
      render(container);
      return;
    }

    // Back to paste
    if (e.target.closest('#back-to-paste') || e.target.closest('#back-to-paste-bottom')) {
      state.view = 'paste';
      state.resolvingIndex = null;
      render(container);
      return;
    }

    // Save recipe
    if (e.target.closest('#save-recipe-btn')) {
      await handleSaveRecipe(container);
      return;
    }
  });

  // --- Shared editor event delegation ---
  attachEditorEvents(container, {
    onIngredientChange(index, field, value) {
      if (!state.draftRecipe) return;
      const ing = state.draftRecipe.ingredients[index];
      if (!ing) return;

      if (field === 'name') {
        if (value !== ing.name) {
          ing.name = value;
          // Changing name marks ingredient as unresolved
          ing.resolved = false;
          ing.ingredient_id = null;
          ing.resolution_error = null;
          ing.calories_per_100g = null;
          ing.protein_per_100g = null;
          ing.fat_per_100g = null;
          ing.carbs_per_100g = null;
          ing.fiber_per_100g = null;
          ing.calories = null;
          ing.protein = null;
          ing.fat = null;
          ing.carbs = null;
          ing.fiber = null;
          render(container);
        }
      } else if (field === 'amount') {
        ing.amount = parseFloat(value) || 0;
        recalcRowMacros(ing);
        render(container);
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
      render(container);
    },

    onIngredientAdd() {
      state.draftRecipe.ingredients.push(blankIngredient());
      render(container);
    },

    onResolve(index) {
      state.resolvingIndex = index;
      render(container);
    },

    onCancelResolve() {
      state.resolvingIndex = null;
      render(container);
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
      render(container);
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
        render(container);
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
      render(container);
    },

    onInstructionAdd() {
      state.draftRecipe.instructions.push('');
      render(container);
    },
  });
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
  ing.calories_per_100g = data.calories_per_100g ?? null;
  ing.protein_per_100g = data.protein_per_100g ?? null;
  ing.fat_per_100g = data.fat_per_100g ?? null;
  ing.carbs_per_100g = data.carbs_per_100g ?? null;
  ing.fiber_per_100g = data.fiber_per_100g ?? null;
  ing.resolved = true;
  ing.resolution_error = null;

  recalcRowMacros(ing);
  state.resolvingIndex = null;
}

// ============================================================
// Save
// ============================================================

async function handleSaveRecipe(container) {
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

  const payload = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    servings: draft.servings,
    cuisine: draft.cuisine.trim(),
    meal_type: draft.meal_type,
    main_protein: draft.main_protein.trim(),
    prep_time_min: draft.prep_time_min || null,
    cook_time_min: draft.cook_time_min || null,
    total_time_min: (draft.prep_time_min || 0) + (draft.cook_time_min || 0) || null,
    phase: draft.phase,
    instructions: draft.instructions.filter(s => s.trim()),
    ingredients: draft.ingredients.map(ing => ({
      ingredient_id: ing.ingredient_id,
      name: ing.name,
      amount: ing.amount,
      unit: ing.unit,
      section: ing.section || '',
      calories: ing.calories,
      protein: ing.protein,
      fat: ing.fat,
      carbs: ing.carbs,
      fiber: ing.fiber,
    })),
    tags: [],
  };

  state.view = 'saving';
  render(container);

  try {
    await apiSaveRecipe(payload);
    await reloadRecipes();
    showToast(`"${draft.name}" saved successfully!`, 'success');

    // Reset and go to recipe library
    state = {
      view: 'paste', parsedRecipe: null, draftRecipe: null,
      lookupErrors: [], imageData: null, imageType: null, resolvingIndex: null,
    };
    location.hash = 'recipes';
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
    state.view = 'preview';
    render(container);
  }
}

async function showToast(message, type = 'info') {
  try {
    const app = await getApp();
    if (app.showToast) { app.showToast(message, type); return; }
  } catch {}
}

// ============================================================
// Main Render
// ============================================================

function render(container) {
  let html;
  switch (state.view) {
    case 'paste':
      html = renderPasteView();
      break;
    case 'loading':
    case 'saving':
      html = renderLoadingView();
      break;
    case 'preview':
      html = renderPreviewView();
      break;
    default:
      html = renderPasteView();
  }

  container.innerHTML = `<div class="page-transition">${html}</div>`;
}

export function renderAddRecipe(container) {
  state = {
    view: 'paste', parsedRecipe: null, draftRecipe: null,
    lookupErrors: [], imageData: null, imageType: null, resolvingIndex: null,
  };
  render(container);
  attachEvents(container);
}
