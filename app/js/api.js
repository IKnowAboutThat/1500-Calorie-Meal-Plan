/**
 * api.js - Thin fetch wrapper for all Flask API endpoints.
 *
 * All functions return promises. Base URL is configurable.
 */

const API_BASE = `${window.location.protocol}//${window.location.hostname}:5001/api`;

async function _fetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `API error ${resp.status}`);
  }
  return resp.json();
}

// ---- Recipes ----

export async function getRecipes() {
  return _fetch('/recipes');
}

export async function getRecipe(id) {
  return _fetch(`/recipes/${id}`);
}

export async function parseRecipeText(text) {
  return _fetch('/recipes/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function parseRecipe({ text, imageData, imageType }) {
  const body = { text: text || '' };
  if (imageData) {
    body.image_base64 = imageData;
    body.image_media_type = imageType || 'image/jpeg';
  }
  return _fetch('/recipes/parse', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function saveRecipe(recipe) {
  return _fetch('/recipes', {
    method: 'POST',
    body: JSON.stringify(recipe),
  });
}

export async function updateRecipe(id, data) {
  return _fetch(`/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRecipe(id) {
  return _fetch(`/recipes/${id}`, {
    method: 'DELETE',
  });
}

// ---- Recipe Tags ----

export async function tagRecipe(recipeId, tagId, parentTagId = 0) {
  return _fetch(`/recipes/${recipeId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag_id: tagId, parent_tag_id: parentTagId }),
  });
}

export async function untagRecipe(recipeId, tagId, parentTagId = 0) {
  return _fetch(`/recipes/${recipeId}/tags`, {
    method: 'DELETE',
    body: JSON.stringify({ tag_id: tagId, parent_tag_id: parentTagId }),
  });
}

// ---- Ingredients ----

export async function getIngredients() {
  return _fetch('/ingredients');
}

export async function getIngredient(id) {
  return _fetch(`/ingredients/${id}`);
}

// ---- Tags ----

export async function getTags() {
  return _fetch('/tags');
}

export async function createTag(name) {
  return _fetch('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameTag(id, name) {
  return _fetch(`/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function deleteTag(id) {
  return _fetch(`/tags/${id}`, {
    method: 'DELETE',
  });
}

export async function addTagHierarchy(parentTagId, childTagId) {
  return _fetch('/tags/hierarchy', {
    method: 'POST',
    body: JSON.stringify({ parent_tag_id: parentTagId, child_tag_id: childTagId }),
  });
}

export async function removeTagHierarchy(parentTagId, childTagId) {
  return _fetch('/tags/hierarchy', {
    method: 'DELETE',
    body: JSON.stringify({ parent_tag_id: parentTagId, child_tag_id: childTagId }),
  });
}

// ---- Meal Plans ----

export async function getMealPlan(weekId) {
  return _fetch(`/meal-plans/${weekId}`);
}

export async function saveMealPlan(weekId, plan) {
  return _fetch(`/meal-plans/${weekId}`, {
    method: 'PUT',
    body: JSON.stringify(plan),
  });
}

export async function deleteMealPlan(weekId) {
  return _fetch(`/meal-plans/${weekId}`, {
    method: 'DELETE',
  });
}

export async function listMealPlanIds() {
  return _fetch('/meal-plans');
}

// ---- Inventory ----

export async function getInventory() {
  return _fetch('/inventory');
}

export async function addInventoryItem(data) {
  return _fetch('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInventoryItem(id, data) {
  return _fetch(`/inventory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInventoryItem(id) {
  return _fetch(`/inventory/${id}`, {
    method: 'DELETE',
  });
}

export async function deductRecipeFromInventory(recipeId) {
  return _fetch(`/inventory/deduct-recipe/${recipeId}`, {
    method: 'POST',
  });
}

// ---- Purchase Units ----

export async function getPurchaseUnits(ingredientId) {
  const query = ingredientId ? `?ingredient_id=${ingredientId}` : '';
  return _fetch(`/purchase-units${query}`);
}

export async function createPurchaseUnit(data) {
  return _fetch('/purchase-units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function recordPurchase(data) {
  return _fetch('/purchase-units/record-purchase', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---- Shelf Life ----

export async function getShelfLife(ingredientId) {
  const query = ingredientId ? `?ingredient_id=${ingredientId}` : '';
  return _fetch(`/shelf-life${query}`);
}

export async function lookupShelfLife(ingredientId, state, storageType) {
  return _fetch(`/shelf-life/lookup?ingredient_id=${ingredientId}&state=${state}&storage_type=${storageType}`);
}
