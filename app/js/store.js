/**
 * store.js - Single persistence layer for the Meal Planning app.
 *
 * All state is stored in localStorage under keys prefixed with "mp_".
 * Every other module imports from this file to read and write state.
 * A simple pub/sub system provides cross-module reactivity.
 */

// ============================================================
// Internal helpers
// ============================================================

function _generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Subscribers map: key -> Set<Function> */
const subscribers = new Map();

function _notify(key, value) {
  const subs = subscribers.get(key);
  if (subs) {
    for (const cb of subs) {
      try {
        cb(value, key);
      } catch (err) {
        console.error(`[store] subscriber error for key "${key}":`, err);
      }
    }
  }
}

// ============================================================
// Generic localStorage helpers
// ============================================================

/**
 * Read a key from localStorage, JSON-parsing the result.
 * Returns `defaultValue` when the key is missing or the stored value
 * cannot be parsed.
 */
export function getItem(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Write a value to localStorage (JSON-stringified) and notify subscribers.
 */
export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[store] failed to write key "${key}":`, err);
  }
  _notify(key, value);
}

/**
 * Remove a key from localStorage.
 */
export function removeItem(key) {
  localStorage.removeItem(key);
  _notify(key, undefined);
}

// ============================================================
// Event system for cross-module reactivity
// ============================================================

/**
 * Register a callback that fires whenever `setItem` (or `removeItem`) is
 * called for the given key. The callback receives (value, key).
 */
export function subscribe(key, callback) {
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  subscribers.get(key).add(callback);
}

/**
 * Remove a previously registered callback for the given key.
 */
export function unsubscribe(key, callback) {
  const subs = subscribers.get(key);
  if (subs) {
    subs.delete(callback);
    if (subs.size === 0) {
      subscribers.delete(key);
    }
  }
}

// ============================================================
// Meal Planner state
// ============================================================

/**
 * Retrieve a week plan by its weekId (e.g. "2026-W10").
 * Returns the plan object or null.
 */
export function getWeekPlan(weekId) {
  return getItem(`mp_weekPlan_${weekId}`, null);
}

/**
 * Persist a week plan and ensure its weekId appears in the plan index.
 */
export function saveWeekPlan(weekId, plan) {
  setItem(`mp_weekPlan_${weekId}`, plan);

  const index = getAllWeekPlanIds();
  if (!index.includes(weekId)) {
    index.push(weekId);
    index.sort();
    setItem('mp_weekPlanIndex', index);
  }
}

/**
 * Return the array of all weekIds that have saved plans.
 */
export function getAllWeekPlanIds() {
  return getItem('mp_weekPlanIndex', []);
}

/**
 * Delete a week plan and remove its weekId from the index.
 */
export function deleteWeekPlan(weekId) {
  removeItem(`mp_weekPlan_${weekId}`);

  const index = getAllWeekPlanIds().filter((id) => id !== weekId);
  setItem('mp_weekPlanIndex', index);
}

// ============================================================
// Meal Slot Configuration
// ============================================================

const DEFAULT_MEAL_SLOTS = {
  standard: [
    { name: 'Meal 1', order: 0 },
    { name: 'Meal 2', order: 1 },
    { name: 'Snack', order: 2 },
  ],
  luteal: [
    { name: 'Meal 1', order: 0 },
    { name: 'Meal 2', order: 1 },
    { name: 'Meal 3', order: 2 },
    { name: 'Snack', order: 3 },
  ],
};

/**
 * Return the hardcoded default meal slots for a phase.
 */
export function getDefaultMealSlots(phase) {
  return DEFAULT_MEAL_SLOTS[phase] || DEFAULT_MEAL_SLOTS.standard;
}

/**
 * Get the meal slot configuration for a phase, falling back to defaults.
 */
export function getMealSlots(phase = 'standard') {
  const key = phase === 'luteal' ? 'mp_mealSlots_luteal' : 'mp_mealSlots_standard';
  return getItem(key, getDefaultMealSlots(phase));
}

/**
 * Save the meal slot configuration for a phase.
 */
export function saveMealSlots(phase, slots) {
  const key = phase === 'luteal' ? 'mp_mealSlots_luteal' : 'mp_mealSlots_standard';
  setItem(key, slots);
}

// ============================================================
// Phase Configuration
// ============================================================

const DEFAULT_PHASE_CONFIG = {
  cycleLength: 30,
  lutealStart: 21,
  lutealEnd: 30,
  cycleStartDate: null,
};

/**
 * Get the phase / cycle configuration, merged with defaults.
 */
export function getPhaseConfig() {
  const stored = getItem('mp_phaseConfig', null);
  return { ...DEFAULT_PHASE_CONFIG, ...(stored || {}) };
}

/**
 * Save phase / cycle configuration.
 */
export function savePhaseConfig(config) {
  setItem('mp_phaseConfig', config);
}

/**
 * Determine whether a given day-of-cycle falls in the "standard" or
 * "luteal" phase based on the saved configuration.
 */
export function getDayPhase(dayOfCycle) {
  const config = getPhaseConfig();
  if (dayOfCycle >= config.lutealStart && dayOfCycle <= config.lutealEnd) {
    return 'luteal';
  }
  return 'standard';
}

// ============================================================
// Pantry
// ============================================================

/**
 * Get all pantry items.
 */
export function getPantryItems() {
  return getItem('mp_pantry', []);
}

/**
 * Overwrite the entire pantry items array.
 */
export function savePantryItems(items) {
  setItem('mp_pantry', items);
}

/**
 * Add a single pantry item (auto-generates an ID), saves, and returns
 * the item with its new ID.
 */
export function addPantryItem(item) {
  const items = getPantryItems();
  const newItem = { ...item, id: _generateId() };
  items.push(newItem);
  savePantryItems(items);
  return newItem;
}

/**
 * Remove a pantry item by ID.
 */
export function removePantryItem(id) {
  const items = getPantryItems().filter((item) => item.id !== id);
  savePantryItems(items);
}

/**
 * Merge partial updates into an existing pantry item.
 */
export function updatePantryItem(id, updates) {
  const items = getPantryItems().map((item) => {
    if (item.id === id) {
      return { ...item, ...updates };
    }
    return item;
  });
  savePantryItems(items);
}

// ============================================================
// Favorites & Tags
// ============================================================

/**
 * Get the array of favorite recipe IDs.
 */
export function getFavorites() {
  return getItem('mp_favorites', []);
}

/**
 * Toggle a recipe as favorite. Returns `true` if the recipe is now a
 * favorite, `false` if it was removed.
 */
export function toggleFavorite(recipeId) {
  const favorites = getFavorites();
  const index = favorites.indexOf(recipeId);
  if (index === -1) {
    favorites.push(recipeId);
    setItem('mp_favorites', favorites);
    return true;
  }
  favorites.splice(index, 1);
  setItem('mp_favorites', favorites);
  return false;
}

/**
 * Check whether a recipe is currently favorited.
 */
export function isFavorite(recipeId) {
  return getFavorites().includes(recipeId);
}

/**
 * Get the full recipe-tags map: { [recipeId]: string[] }.
 */
export function getRecipeTags() {
  return getItem('mp_recipeTags', {});
}

/**
 * Set the tags array for a single recipe.
 */
export function setRecipeTags(recipeId, tags) {
  const allTags = getRecipeTags();
  allTags[recipeId] = tags;
  setItem('mp_recipeTags', allTags);
}

/**
 * Collect every unique tag across all recipes and return them as a
 * sorted, deduplicated array.
 */
export function getAllTags() {
  const allTags = getRecipeTags();
  const tagSet = new Set();
  for (const tags of Object.values(allTags)) {
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }
  }
  return Array.from(tagSet).sort();
}

// ============================================================
// Week Templates
// ============================================================

/**
 * Get all saved week templates.
 */
export function getTemplates() {
  return getItem('mp_templates', []);
}

/**
 * Save (upsert) a week template. If the template has no ID one is generated.
 */
export function saveTemplate(template) {
  const templates = getTemplates();
  const entry = { ...template };
  if (!entry.id) {
    entry.id = _generateId();
    entry.createdAt = new Date().toISOString();
  }

  const existingIndex = templates.findIndex((t) => t.id === entry.id);
  if (existingIndex !== -1) {
    templates[existingIndex] = entry;
  } else {
    templates.push(entry);
  }

  setItem('mp_templates', templates);
  return entry;
}

/**
 * Delete a week template by ID.
 */
export function deleteTemplate(id) {
  const templates = getTemplates().filter((t) => t.id !== id);
  setItem('mp_templates', templates);
}

// ============================================================
// Adrenal Cocktail Tracking
// ============================================================

/**
 * Get the adrenal cocktail log for a specific date ("YYYY-MM-DD").
 * Returns `{ count: 0 }` when no entry exists.
 */
export function getAdrenalLog(date) {
  return getItem(`mp_adrenalLog_${date}`, { count: 0 });
}

/**
 * Set the adrenal cocktail count for a date (0, 1, or 2).
 */
export function setAdrenalLog(date, count) {
  setItem(`mp_adrenalLog_${date}`, { count });
}

/**
 * Return an object mapping each date in [startDate, endDate] to its
 * adrenal cocktail count: `{ "2026-03-01": 2, "2026-03-02": 0, ... }`.
 */
export function getAdrenalLogRange(startDate, endDate) {
  const result = {};
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const log = getAdrenalLog(dateStr);
    result[dateStr] = log.count;
    current.setDate(current.getDate() + 1);
  }

  return result;
}

// ============================================================
// Settings
// ============================================================

const DEFAULT_SETTINGS = {
  dailyTargets: {
    calories: 1500,
    protein: 135,
    fiberMin: 30,
    fiberMax: 40,
  },
  adrenalCocktailsPerDay: 2,
};

/**
 * Get app settings, deep-merged with defaults so new default keys are
 * always present.
 */
export function getSettings() {
  const stored = getItem('mp_settings', null);
  if (!stored) return { ...DEFAULT_SETTINGS, dailyTargets: { ...DEFAULT_SETTINGS.dailyTargets } };
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    dailyTargets: {
      ...DEFAULT_SETTINGS.dailyTargets,
      ...(stored.dailyTargets || {}),
    },
  };
}

/**
 * Save app settings.
 */
export function saveSettings(settings) {
  setItem('mp_settings', settings);
}

// ============================================================
// Shopping List Checked State
// ============================================================

/**
 * Get the array of checked ingredient names for a given week.
 */
export function getShoppingChecked(weekId) {
  return getItem(`mp_shoppingChecked_${weekId}`, []);
}

/**
 * Save the array of checked ingredient names for a given week.
 */
export function saveShoppingChecked(weekId, checked) {
  setItem(`mp_shoppingChecked_${weekId}`, checked);
}

// ============================================================
// Data Export / Import
// ============================================================

/**
 * Collect every `mp_` prefixed key in localStorage and return a JSON
 * string representing the full data snapshot.
 */
export function exportAllData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('mp_')) {
      try {
        data[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
  }
  return JSON.stringify(data);
}

/**
 * Parse a JSON string (as produced by `exportAllData`) and write every
 * key back to localStorage, notifying subscribers for each.
 */
export function importAllData(jsonString) {
  const data = JSON.parse(jsonString);
  for (const [key, value] of Object.entries(data)) {
    setItem(key, value);
  }
}
