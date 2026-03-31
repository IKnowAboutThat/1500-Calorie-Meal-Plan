/**
 * recipe-cache.js - Shared recipe data cache loaded from the API.
 *
 * Provides a singleton cache of recipes, ingredients, and tags
 * that all modules can import. Call `await loadRecipes()` once at
 * app startup, then use the synchronous getters everywhere.
 */

import * as api from './api.js';

let _recipes = [];
let _ingredients = [];
let _loaded = false;
let _loading = null;

/**
 * Load (or reload) recipes from the API. Returns the recipes array.
 * Safe to call multiple times — subsequent calls reuse the in-flight request.
 */
export async function loadRecipes() {
  if (_loading) return _loading;
  _loading = api.getRecipes().then(recipes => {
    _recipes = recipes.map(_normalize);
    _loaded = true;
    _loading = null;
    return _recipes;
  }).catch(err => {
    console.error('[recipe-cache] Failed to load recipes from API:', err);
    _loading = null;
    // Fall back to recipes.js if API is down
    return import('./data/recipes.js').then(mod => {
      _recipes = mod.recipes;
      _loaded = true;
      console.warn('[recipe-cache] Using static recipes.js fallback');
      return _recipes;
    });
  });
  return _loading;
}

/**
 * Normalize API recipe shape to match what frontend modules expect.
 * API uses snake_case; frontend uses camelCase.
 */
function _normalize(r) {
  return {
    ...r,
    // Preserve both formats for compatibility
    mealType: r.meal_type || r.mealType,
    mainProtein: r.main_protein || r.mainProtein,
    // Per-serving values are what the frontend displays for single-serving recipes
    calories: r.calories_per_serving ?? r.calories,
    protein: r.protein_per_serving ?? r.protein,
    fat: r.fat_per_serving ?? r.fat,
    carbs: r.carbs_per_serving ?? r.carbs,
    fiber: r.fiber_per_serving ?? r.fiber,
    // Keep total macros available too
    totalCalories: r.calories,
    totalProtein: r.protein,
    totalFat: r.fat,
    totalCarbs: r.carbs,
    totalFiber: r.fiber,
    // Normalize ingredient shape
    ingredients: (r.ingredients || []).map(ing => ({
      ...ing,
      calories: ing.calories ?? 0,
      protein: ing.protein ?? 0,
      fiber: ing.fiber ?? 0,
    })),
    // Normalize instructions: ensure always an array of strings
    instructions: Array.isArray(r.instructions)
      ? r.instructions
      : (() => { try { const p = JSON.parse(r.instructions); return Array.isArray(p) ? p : []; } catch { return []; } })(),
    // Normalize description: ensure always a string
    description: r.description || '',
    // Extract tag names for backward compatibility with localStorage tag system
    tagNames: (r.tags || []).map(t => t.tag_name || t.name || t),
  };
}

/**
 * Get the cached recipes array (synchronous).
 * Returns empty array if not yet loaded.
 */
export function getRecipes() {
  return _recipes;
}

/**
 * Find a recipe by its numeric ID.
 */
export function getRecipeById(id) {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return _recipes.find(r => r.id === numId) || null;
}

/**
 * Whether recipes have been loaded from the API.
 */
export function isLoaded() {
  return _loaded;
}

/**
 * Force reload recipes from the API.
 */
export async function reloadRecipes() {
  _loaded = false;
  _loading = null;
  return loadRecipes();
}
