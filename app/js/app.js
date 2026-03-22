/**
 * app.js - Main entry point and router for the 1500 Calorie Meal Plan app.
 *
 * Provides hash-based routing, a modal system, toast notifications,
 * ISO-week utilities, and global state access.
 */

import * as store from './store.js';
import { loadRecipes, getRecipes } from './recipe-cache.js';

// ---------------------------------------------------------------------------
// 1. Router
// ---------------------------------------------------------------------------

const VALID_PAGES = ['recipes', 'planner', 'shopping-list', 'pantry', 'dashboard', 'settings', 'add-recipe', 'tags'];
const DEFAULT_PAGE = 'recipes';

/**
 * Lazily load the requested page module and call its render function.
 */
async function loadPage(page, container) {
  // Fade-in transition
  container.classList.remove('page-transition');
  // Force a reflow so re-adding the class triggers the animation
  void container.offsetWidth;
  container.classList.add('page-transition');

  try {
    switch (page) {
      case 'recipes': {
        const { renderRecipeLibrary } = await import('./recipe-library.js');
        renderRecipeLibrary(container);
        break;
      }
      case 'planner': {
        const { renderMealPlanner } = await import('./meal-planner.js');
        await renderMealPlanner(container);
        break;
      }
      case 'shopping-list': {
        const { renderShoppingList } = await import('./shopping-list.js');
        await renderShoppingList(container);
        break;
      }
      case 'pantry': {
        const { renderInventory } = await import('./inventory.js');
        await renderInventory(container);
        break;
      }
      case 'dashboard': {
        const { renderDashboard } = await import('./macro-dashboard.js');
        await renderDashboard(container);
        break;
      }
      case 'settings': {
        const { renderSettings } = await import('./settings.js');
        renderSettings(container);
        break;
      }
      case 'add-recipe': {
        const { renderAddRecipe } = await import('./add-recipe.js');
        renderAddRecipe(container);
        break;
      }
      case 'tags': {
        const { renderTagManager } = await import('./tag-manager.js');
        renderTagManager(container);
        break;
      }
      case 'edit-recipe': {
        const recipeId = location.hash.replace(/^#edit-recipe\//, '');
        const { renderEditRecipe } = await import('./edit-recipe.js');
        renderEditRecipe(container, recipeId);
        break;
      }
      default: {
        container.innerHTML = `<div class="empty-state"><p>Page not found: ${page}</p></div>`;
      }
    }
  } catch (e) {
    console.error('[loadPage] Module load failed for:', page, e);
    container.innerHTML = `
      <div class="empty-state">
        <p>Failed to load page. This can happen if the server is unreachable.</p>
        <button class="btn btn-primary" onclick="location.reload()">Reload App</button>
        <details style="margin-top:1rem;text-align:left;font-size:0.8rem;">
          <summary>Error details</summary>
          <pre style="white-space:pre-wrap;">${e.message}\n${e.stack || ''}</pre>
        </details>
      </div>`;
  }
}

/**
 * Read the current hash and return the sanitised page name.
 * For parameterised routes like #edit-recipe/123, returns the base page name.
 */
function getPageFromHash() {
  const raw = location.hash.replace(/^#/, '').trim();
  if (raw.startsWith('edit-recipe/')) return 'edit-recipe';
  return VALID_PAGES.includes(raw) ? raw : DEFAULT_PAGE;
}

/**
 * Highlight the active nav tab and load the corresponding page.
 */
function navigateTo(page) {
  const container = document.getElementById('app-content');
  if (!container) return;

  // Update active tab
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    if (tab.dataset.page === page) {
      tab.classList.add('nav-tab--active');
    } else {
      tab.classList.remove('nav-tab--active');
    }
  });

  loadPage(page, container);
}

/**
 * Bootstrap the router once the DOM is ready.
 */
function initRouter() {
  // Attach click handlers to nav tabs
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.page;
      if (page) {
        location.hash = page;
      }
    });
  });

  // Listen for hash changes (back/forward, manual URL edits)
  window.addEventListener('hashchange', () => {
    navigateTo(getPageFromHash());
  });

  // Initial navigation
  navigateTo(getPageFromHash());
}

// ---------------------------------------------------------------------------
// 2. Modal system
// ---------------------------------------------------------------------------

/**
 * Open a modal with the given HTML content.
 * @param {string} contentHtml - The inner HTML to display inside the modal.
 */
export function openModal(contentHtml) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  content.innerHTML = contentHtml;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the currently-open modal, clearing its content.
 */
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  overlay.classList.add('hidden');
  content.innerHTML = '';
  document.body.style.overflow = '';
}

/**
 * Wire up the modal event listeners (overlay click and ESC key).
 */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  // Close when clicking the overlay itself (not its children)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Toast system
// ---------------------------------------------------------------------------

/**
 * Display a brief toast notification that auto-removes after 3 seconds.
 *
 * @param {string} message - Text to show.
 * @param {'info'|'success'|'error'} [type='info'] - Visual style variant.
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Auto-remove after 3 seconds with a fade-out
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    // Wait for the fade-out animation to finish before removing from the DOM
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
    // Fallback removal in case animationend never fires (no CSS animation defined)
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 500);
  }, 3000);
}

// ---------------------------------------------------------------------------
// 4. Week ID utilities (ISO 8601)
// ---------------------------------------------------------------------------

/**
 * Compute the ISO 8601 week-numbering year and week number for a given date.
 * Returns a string in the form "YYYY-Www" (e.g. "2026-W10").
 *
 * @param {Date} date
 * @returns {string}
 */
export function getISOWeekId(date) {
  // Work on a copy so we don't mutate the original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  // ISO week: the week that contains the year's first Thursday.
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7; // convert Sunday (0) to 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get the ISO week ID for today.
 * @returns {string} e.g. "2026-W10"
 */
export function getCurrentWeekId() {
  return getISOWeekId(new Date());
}

/**
 * Parse a week ID ("YYYY-Www") and return an array of 7 Date objects
 * representing Monday through Sunday of that week.
 *
 * @param {string} weekId - e.g. "2026-W10"
 * @returns {Date[]}
 */
export function getWeekDates(weekId) {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];

  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // January 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1 .. Sun=7

  // Monday of ISO week 1
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  // Monday of the requested week
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    // Return local Date objects (midnight local) for display purposes
    dates.push(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return dates;
}

/**
 * Return the week ID for the week after the given one.
 *
 * @param {string} weekId - e.g. "2026-W10"
 * @returns {string} e.g. "2026-W11"
 */
export function getNextWeekId(weekId) {
  const dates = getWeekDates(weekId);
  if (!dates.length) return weekId;
  // Take the Monday and add 7 days
  const nextMonday = new Date(dates[0]);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return getISOWeekId(nextMonday);
}

/**
 * Return the week ID for the week before the given one.
 *
 * @param {string} weekId - e.g. "2026-W10"
 * @returns {string} e.g. "2026-W09"
 */
export function getPrevWeekId(weekId) {
  const dates = getWeekDates(weekId);
  if (!dates.length) return weekId;
  // Take the Monday and subtract 7 days
  const prevMonday = new Date(dates[0]);
  prevMonday.setDate(prevMonday.getDate() - 7);
  return getISOWeekId(prevMonday);
}

/**
 * Format a Date as a short human-readable string, e.g. "Mon 3/6".
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${dayName} ${month}/${day}`;
}

// ---------------------------------------------------------------------------
// 5. Global state
// ---------------------------------------------------------------------------

/**
 * Returns the core application data objects.
 *
 * @returns {{ recipes: object[] }}
 */
export function getAppState() {
  return { recipes: getRecipes() };
}

// ---------------------------------------------------------------------------
// 6. Initialisation
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  initModal();
  initKeyboardNav();
  initFirstRun();

  // Load recipes from API before initial navigation
  await loadRecipes();
  initRouter();
});

/**
 * Keyboard navigation: Left/Right arrow keys navigate weeks on the planner
 * and dashboard pages. Escape always closes the modal (already handled in
 * initModal, but reinforced here for robustness).
 */
function initKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when user is typing in an input/textarea/select
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const page = getPageFromHash();

    if (e.key === 'ArrowLeft' && (page === 'planner' || page === 'dashboard')) {
      e.preventDefault();
      const prevBtn = document.querySelector('[data-action="prev-week"]');
      if (prevBtn) prevBtn.click();
    }

    if (e.key === 'ArrowRight' && (page === 'planner' || page === 'dashboard')) {
      e.preventDefault();
      const nextBtn = document.querySelector('[data-action="next-week"]');
      if (nextBtn) nextBtn.click();
    }

    if (e.key === 'Escape') {
      closeModal();
    }
  });
}

/**
 * First-run experience: show a welcome toast and initialise default settings
 * if this is the user's first visit (no mp_settings in localStorage).
 */
function initFirstRun() {
  const existingSettings = store.getItem('mp_settings', null);
  if (existingSettings === null) {
    // Persist default settings so future loads know it's no longer the first run
    store.saveSettings(store.getSettings());
    // Delay toast slightly so the UI is fully painted
    setTimeout(() => {
      showToast(
        'Welcome! Your 30-day meal plan recipes are loaded. Start by exploring the Recipes tab!',
        'success'
      );
    }, 500);
  }
}
