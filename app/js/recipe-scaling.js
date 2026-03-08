/**
 * recipe-scaling.js - Recipe scaling utility module.
 *
 * Provides functions for adjusting serving sizes with proportional
 * recalculation of all ingredient amounts and macros. Used by
 * recipe-library, meal-planner, and integration modules.
 */

import { getRecipes } from './recipe-cache.js';

// ============================================================
// Recipe lookup map
// ============================================================

const recipeMap = new Map(getRecipes().map(r => [r.id, r]));

// ============================================================
// Core scaling
// ============================================================

/**
 * Scale a recipe by the given factor, returning a NEW recipe object.
 * All ingredient amounts, calories, protein, and fiber values are
 * recalculated proportionally. The original recipe is never mutated.
 *
 * @param {Object} recipe  - A recipe object (see data/recipes.js).
 * @param {number} scaleFactor - Multiplier (e.g. 0.5, 1, 1.5, 2).
 * @returns {Object} A new recipe object with scaled values.
 */
export function scaleRecipe(recipe, scaleFactor) {
  if (scaleFactor === 1) return { ...recipe };

  return {
    ...recipe,
    calories: Math.round(recipe.calories * scaleFactor),
    protein: Math.round(recipe.protein * scaleFactor * 10) / 10,
    fiber: Math.round(recipe.fiber * scaleFactor * 10) / 10,
    servings: Math.round(recipe.servings * scaleFactor * 100) / 100,
    ingredients: recipe.ingredients.map(ing => ({
      ...ing,
      amount: Math.round(ing.amount * scaleFactor),
      calories: Math.round(ing.calories * scaleFactor),
      protein: Math.round(ing.protein * scaleFactor * 10) / 10,
      fiber: Math.round(ing.fiber * scaleFactor * 10) / 10,
    })),
  };
}

// ============================================================
// Scale controls UI
// ============================================================

/**
 * Return an HTML string for a scale-control widget.
 *
 * Contains decrement / increment buttons (step 0.25, range 0.25 - 4)
 * and preset buttons for common multipliers.
 *
 * @param {string}   recipeId      - The recipe's unique id.
 * @param {number}   currentScale  - Current scale factor.
 * @param {Function} onScaleChange - Callback receiving the new scale value (unused in markup, wired via attachScaleListeners).
 * @returns {string} HTML string.
 */
export function renderScaleControls(recipeId, currentScale, onScaleChange) {
  const presets = [0.5, 1, 1.5, 2];

  const presetButtons = presets
    .map(
      value =>
        `<button class="btn btn-sm ${currentScale === value ? 'btn-primary' : 'btn-secondary'} scale-preset" data-scale="${value}">${value}x</button>`
    )
    .join('\n      ');

  return `<div class="scale-controls" data-recipe-id="${recipeId}">
  <span class="text-sm fw-bold">Serving Size:</span>
  <button class="btn btn-sm btn-icon scale-btn" data-action="scale-down" ${currentScale <= 0.25 ? 'disabled' : ''}>&#8722;</button>
  <span class="scale-display" id="scale-value-${recipeId}">${currentScale}x</span>
  <button class="btn btn-sm btn-icon scale-btn" data-action="scale-up" ${currentScale >= 4 ? 'disabled' : ''}>&#43;</button>
  <span class="scale-presets">
      ${presetButtons}
  </span>
</div>`;
}

// ============================================================
// Scaled ingredient table
// ============================================================

/**
 * Return an HTML string for a table showing all ingredients with
 * their scaled amounts, calories, protein, and fiber.
 *
 * When the scaleFactor differs from 1 each row receives the
 * `scaled-row` class so the caller's stylesheet (or the inline
 * fallback below) can visually indicate the change.
 *
 * @param {Object} recipe      - A recipe object.
 * @param {number} scaleFactor - Multiplier to apply.
 * @returns {string} HTML table string.
 */
export function renderScaledIngredientTable(recipe, scaleFactor) {
  const scaled = scaleRecipe(recipe, scaleFactor);
  const isScaled = scaleFactor !== 1;
  const rowClass = isScaled ? ' class="scaled-row"' : '';

  const rows = scaled.ingredients
    .map(
      ing =>
        `    <tr${rowClass}>
      <td>${ing.name}</td>
      <td>${ing.amount}${ing.unit}</td>
      <td>${ing.calories}</td>
      <td>${ing.protein}g</td>
      <td>${ing.fiber}g</td>
    </tr>`
    )
    .join('\n');

  // Inline style fallback for the scaled-row highlight
  const inlineStyle = isScaled
    ? `<style>.scaled-row { background-color: rgba(74,124,89,0.06); }</style>\n`
    : '';

  return `${inlineStyle}<table class="data-table scaled-table">
  <thead>
    <tr>
      <th>Ingredient</th>
      <th>Amount</th>
      <th>Calories</th>
      <th>Protein</th>
      <th>Fiber</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
  <tfoot>
    <tr class="fw-bold">
      <td>Total</td>
      <td></td>
      <td>${scaled.calories}</td>
      <td>${scaled.protein}g</td>
      <td>${scaled.fiber}g</td>
    </tr>
  </tfoot>
</table>`;
}

// ============================================================
// Event wiring
// ============================================================

/**
 * Attach click listeners to the scale controls inside `container`
 * for the given recipeId.
 *
 * Handles increment / decrement buttons (step 0.25, clamped to
 * 0.25 - 4) and preset buttons.  Calls `onScaleChange(newScale)`
 * whenever the value changes.
 *
 * @param {HTMLElement} container    - DOM element containing scale controls.
 * @param {string}      recipeId     - The recipe's unique id.
 * @param {number}      initialScale - Starting scale factor.
 * @param {Function}    onScaleChange - Callback receiving the new scale value.
 */
export function attachScaleListeners(container, recipeId, initialScale, onScaleChange) {
  let currentScale = initialScale;

  container.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action], .scale-preset');
    if (!target) return;

    // Only handle events for this recipe's controls
    const controls = target.closest(`.scale-controls[data-recipe-id="${recipeId}"]`);
    if (!controls) return;

    if (target.dataset.action === 'scale-down') {
      currentScale = Math.max(0.25, currentScale - 0.25);
    } else if (target.dataset.action === 'scale-up') {
      currentScale = Math.min(4, currentScale + 0.25);
    } else if (target.dataset.scale) {
      currentScale = parseFloat(target.dataset.scale);
    } else {
      return;
    }

    onScaleChange(currentScale);
  });
}

// ============================================================
// Lookup helper
// ============================================================

/**
 * Retrieve a recipe by its unique id.
 *
 * @param {string} recipeId - The recipe id to look up.
 * @returns {Object|null} The recipe object, or null if not found.
 */
export function getRecipeById(recipeId) {
  return recipeMap.get(recipeId) || null;
}
