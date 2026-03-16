/**
 * add-recipe.js - Paste-to-parse recipe creation UI.
 *
 * Flow: Paste text -> Parse with AI -> Preview/edit -> Save
 */

import * as api from './api.js';
import { reloadRecipes } from './recipe-cache.js';

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
  view: 'paste', // 'paste' | 'loading' | 'preview' | 'saving'
  parsedRecipe: null,
  lookupErrors: [],
  imageData: null,   // base64 string (no prefix)
  imageType: null,    // e.g. 'image/png'
};

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
// Render: Preview View
// ============================================================

function renderPreviewView(recipe) {
  const ingredients = recipe.ingredients || [];
  const instructions = recipe.instructions || [];
  const totals = recipe.totals || {};
  const perServing = recipe.per_serving || {};
  const parseWarnings = recipe.parse_warnings || [];
  const errors = recipe.lookup_errors || [];

  const ingredientRows = ingredients.map((ing, idx) => `
    <tr>
      <td><input type="text" class="ing-name" data-idx="${idx}" value="${escapeHTML(ing.name)}" style="width:100%;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.3rem 0.5rem;font-size:0.85rem;"></td>
      <td><input type="number" class="ing-amount" data-idx="${idx}" value="${ing.amount}" step="1" style="width:70px;border:1px solid var(--color-border);border-radius:var(--radius);padding:0.3rem 0.5rem;font-size:0.85rem;text-align:right;"></td>
      <td style="font-size:0.85rem;">${ing.unit || 'g'}</td>
      <td style="text-align:right;font-size:0.85rem;">${ing.calories ?? '-'}</td>
      <td style="text-align:right;font-size:0.85rem;">${ing.protein ?? '-'}g</td>
      <td style="text-align:right;font-size:0.85rem;">${ing.fiber ?? '-'}g</td>
    </tr>
  `).join('');

  const parseWarningHTML = parseWarnings.length > 0 ? `
    <div class="card" style="border-left:3px solid var(--color-accent);margin-bottom:1rem;">
      <h4 style="margin-bottom:0.5rem;">Parse Warnings</h4>
      ${parseWarnings.map(w => `
        <div style="margin-bottom:0.5rem;font-size:0.85rem;">
          ${escapeHTML(w.message)}
        </div>
      `).join('')}
    </div>
  ` : '';

  const errorHTML = errors.length > 0 ? `
    <div class="card" style="border-left:3px solid var(--color-warning);margin-bottom:1rem;">
      <h4 style="color:var(--color-warning);margin-bottom:0.5rem;">Ingredient Lookup Warnings</h4>
      ${errors.map(e => `
        <div style="margin-bottom:0.5rem;font-size:0.85rem;">
          <strong>${escapeHTML(e.ingredient)}</strong> — not found in USDA database
          <br><span class="text-secondary">Searched: ${e.searches_tried.map(s => `"${escapeHTML(s)}"`).join(', ')}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const instructionsList = instructions.map((step, i) => `
    <li style="margin-bottom:0.5rem;">${escapeHTML(step)}</li>
  `).join('');

  return `
    <div class="add-recipe-preview">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2>Review Recipe</h2>
        <button class="btn btn-secondary btn-sm" id="back-to-paste">Back</button>
      </div>

      ${parseWarningHTML}
      ${errorHTML}

      <div class="card" style="margin-bottom:1rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Name</label>
            <input type="text" id="recipe-name" value="${escapeHTML(recipe.name || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Servings</label>
            <input type="number" id="recipe-servings" value="${recipe.servings || 1}" min="1" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
        </div>

        <div style="margin-top:1rem;">
          <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Description</label>
          <input type="text" id="recipe-description" value="${escapeHTML(recipe.description || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Cuisine</label>
            <input type="text" id="recipe-cuisine" value="${escapeHTML(recipe.cuisine || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Meal Type</label>
            <select id="recipe-meal-type" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
              <option value="meal"${recipe.meal_type === 'meal' ? ' selected' : ''}>Meal</option>
              <option value="snack"${recipe.meal_type === 'snack' ? ' selected' : ''}>Snack</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Main Protein</label>
            <input type="text" id="recipe-main-protein" value="${escapeHTML(recipe.main_protein || '')}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;">
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Prep Time (min)</label>
            <input type="number" id="recipe-prep-time" value="${recipe.prep_time_min || ''}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Cook Time (min)</label>
            <input type="number" id="recipe-cook-time" value="${recipe.cook_time_min || ''}" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--color-text-secondary);display:block;margin-bottom:0.25rem;">Phase</label>
            <select id="recipe-phase" style="width:100%;padding:0.5rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
              <option value="standard">Standard</option>
              <option value="luteal">Luteal</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem;">
        <h3 style="margin-bottom:0.75rem;">Ingredients</h3>
        <div style="overflow-x:auto;">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th style="width:80px;">Amount</th>
                <th style="width:50px;">Unit</th>
                <th style="width:60px;text-align:right;">Cal</th>
                <th style="width:70px;text-align:right;">Protein</th>
                <th style="width:60px;text-align:right;">Fiber</th>
              </tr>
            </thead>
            <tbody id="ingredient-table-body">
              ${ingredientRows}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;">
                <td colspan="3">Total (${recipe.servings || 1} serving${(recipe.servings || 1) > 1 ? 's' : ''})</td>
                <td style="text-align:right;">${totals.calories ?? 0}</td>
                <td style="text-align:right;">${totals.protein ?? 0}g</td>
                <td style="text-align:right;">${totals.fiber ?? 0}g</td>
              </tr>
              ${(recipe.servings || 1) > 1 ? `
              <tr style="font-weight:600;color:var(--color-text-secondary);">
                <td colspan="3">Per Serving</td>
                <td style="text-align:right;">${perServing.calories ?? 0}</td>
                <td style="text-align:right;">${perServing.protein ?? 0}g</td>
                <td style="text-align:right;">${perServing.fiber ?? 0}g</td>
              </tr>
              ` : ''}
            </tfoot>
          </table>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem;">
        <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:1rem;text-align:center;">
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-cal);">${perServing.calories ?? totals.calories ?? 0}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">Calories</div>
          </div>
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-protein);">${perServing.protein ?? totals.protein ?? 0}g</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">Protein</div>
          </div>
          <div>
            <div style="font-size:1.5rem;font-weight:700;">${perServing.fat ?? totals.fat ?? 0}g</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">Fat</div>
          </div>
          <div>
            <div style="font-size:1.5rem;font-weight:700;">${perServing.carbs ?? totals.carbs ?? 0}g</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">Carbs</div>
          </div>
          <div>
            <div style="font-size:1.5rem;font-weight:700;color:var(--color-macro-fiber);">${perServing.fiber ?? totals.fiber ?? 0}g</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);">Fiber</div>
          </div>
        </div>
      </div>

      ${instructions.length > 0 ? `
      <div class="card" style="margin-bottom:1rem;">
        <h3 style="margin-bottom:0.75rem;">Instructions</h3>
        <ol style="padding-left:1.25rem;margin:0;">${instructionsList}</ol>
      </div>
      ` : ''}

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

function attachEvents(container) {
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
        const result = await api.parseRecipe({ text, imageData: state.imageData, imageType: state.imageType });
        state.parsedRecipe = result;
        state.lookupErrors = result.lookup_errors || [];
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
      render(container);
      return;
    }

    // Save recipe
    if (e.target.closest('#save-recipe-btn')) {
      await saveRecipe(container);
      return;
    }
  });
}

async function saveRecipe(container) {
  const recipe = state.parsedRecipe;
  if (!recipe) return;

  // Read edited values from form
  const name = container.querySelector('#recipe-name')?.value?.trim();
  const description = container.querySelector('#recipe-description')?.value?.trim();
  const servings = parseInt(container.querySelector('#recipe-servings')?.value, 10) || 1;
  const cuisine = container.querySelector('#recipe-cuisine')?.value?.trim();
  const mealType = container.querySelector('#recipe-meal-type')?.value;
  const mainProtein = container.querySelector('#recipe-main-protein')?.value?.trim();
  const prepTime = parseInt(container.querySelector('#recipe-prep-time')?.value, 10) || null;
  const cookTime = parseInt(container.querySelector('#recipe-cook-time')?.value, 10) || null;
  const phase = container.querySelector('#recipe-phase')?.value;

  if (!name) {
    showToast('Recipe name is required', 'error');
    return;
  }

  const payload = {
    name,
    description,
    servings,
    cuisine,
    meal_type: mealType,
    main_protein: mainProtein,
    prep_time_min: prepTime,
    cook_time_min: cookTime,
    total_time_min: (prepTime || 0) + (cookTime || 0) || null,
    phase,
    instructions: recipe.instructions || [],
    ingredients: recipe.ingredients || [],
    tags: [],
  };

  state.view = 'saving';
  render(container);

  try {
    await api.saveRecipe(payload);
    await reloadRecipes();
    showToast(`"${name}" saved successfully!`, 'success');

    // Reset and go to recipe library
    state = { view: 'paste', parsedRecipe: null, lookupErrors: [], imageData: null, imageType: null };
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
      html = renderPreviewView(state.parsedRecipe);
      break;
    default:
      html = renderPasteView();
  }

  container.innerHTML = `<div class="page-transition">${html}</div>`;
}

export function renderAddRecipe(container) {
  state = { view: 'paste', parsedRecipe: null, lookupErrors: [], imageData: null, imageType: null };
  render(container);
  attachEvents(container);
}
