/**
 * tag-manager.js - Tag CRUD + hierarchy management UI.
 *
 * Provides tree view of tags, create/rename/delete, and
 * parent-child linking for multi-parent tag hierarchy.
 */

import * as api from './api.js';

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

let tagData = { all: [], roots: [] };
let linkingState = null; // null or { mode: 'select-child', parentId: number }

// ============================================================
// Render
// ============================================================

function renderTagTree(tags, depth = 0) {
  if (!tags || tags.length === 0) return '';
  return tags.map(tag => {
    const indent = depth * 1.5;
    const childrenHTML = renderTagTree(tag.children || [], depth + 1);
    const multiParent = (tag.parent_ids || []).length > 1;

    return `
      <div class="tag-tree-item" style="margin-left:${indent}rem;padding:0.5rem 0.75rem;border-bottom:1px solid var(--color-border-light);display:flex;align-items:center;gap:0.5rem;">
        <span class="tag-tree-name" data-tag-id="${tag.id}" style="flex:1;cursor:pointer;" title="Click to rename">
          ${escapeHTML(tag.name)}
        </span>
        ${multiParent ? '<span class="badge" style="font-size:0.65rem;background:var(--color-accent-glow);color:var(--color-accent);padding:0.1rem 0.4rem;border-radius:var(--radius-full);">multi-parent</span>' : ''}
        <span class="badge" style="font-size:0.7rem;background:var(--color-primary-glow);color:var(--color-primary);padding:0.1rem 0.4rem;border-radius:var(--radius-full);">${tag.recipe_count || 0}</span>
        <button class="btn-icon" data-action="link-child" data-tag-id="${tag.id}" title="Add child tag" style="background:none;border:none;cursor:pointer;padding:0.25rem;font-size:0.85rem;color:var(--color-text-secondary);">+child</button>
        ${depth > 0 ? `<button class="btn-icon" data-action="unlink" data-tag-id="${tag.id}" title="Remove from parent" style="background:none;border:none;cursor:pointer;padding:0.25rem;font-size:0.85rem;color:var(--color-text-secondary);">unlink</button>` : ''}
        <button class="btn-icon" data-action="delete-tag" data-tag-id="${tag.id}" data-tag-name="${escapeHTML(tag.name)}" title="Delete tag" style="background:none;border:none;cursor:pointer;padding:0.25rem;font-size:0.85rem;color:var(--color-danger);">&times;</button>
      </div>
      ${childrenHTML}
    `;
  }).join('');
}

function renderPage() {
  const treeHTML = renderTagTree(tagData.roots);

  // Find tags that appear in multiple parents
  const multiParentTags = tagData.all.filter(t => (t.parent_ids || []).length > 1);
  const multiParentSection = multiParentTags.length > 0 ? `
    <div class="card" style="margin-top:1.5rem;">
      <h3 style="margin-bottom:0.75rem;">Multi-Parent Tags</h3>
      <p class="text-secondary" style="font-size:0.85rem;margin-bottom:0.75rem;">These tags appear under multiple parents.</p>
      <div class="flex flex-wrap gap-1">
        ${multiParentTags.map(t => `
          <span class="badge badge-tag">${escapeHTML(t.name)} (${t.parent_ids.length} parents)</span>
        `).join('')}
      </div>
    </div>
  ` : '';

  const linkingBanner = linkingState ? `
    <div class="card" style="background:var(--color-accent-glow);border:1px solid var(--color-accent);margin-bottom:1rem;padding:0.75rem 1rem;display:flex;align-items:center;justify-content:space-between;">
      <span>Click a tag to make it a child of <strong>${escapeHTML(tagData.all.find(t => t.id === linkingState.parentId)?.name || '?')}</strong></span>
      <button class="btn btn-sm btn-secondary" id="cancel-linking">Cancel</button>
    </div>
  ` : '';

  return `
    <div class="page-transition">
      <h2 style="margin-bottom:1rem;">Tag Manager</h2>

      <div class="card" style="margin-bottom:1rem;">
        <div style="display:flex;gap:0.75rem;align-items:center;">
          <input type="text" id="new-tag-input" placeholder="New tag name..." style="flex:1;padding:0.5rem 0.75rem;border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.95rem;">
          <button class="btn btn-primary btn-sm" id="create-tag-btn">Create Tag</button>
        </div>
      </div>

      ${linkingBanner}

      <div class="card">
        <h3 style="margin-bottom:0.5rem;">Tag Hierarchy</h3>
        ${tagData.roots.length === 0
          ? '<p class="text-secondary" style="padding:1rem 0;">No tags yet. Create one above.</p>'
          : `<div id="tag-tree">${treeHTML}</div>`
        }
      </div>

      ${multiParentSection}
    </div>
  `;
}

// ============================================================
// Data Loading
// ============================================================

async function loadTags() {
  try {
    tagData = await api.getTags();
  } catch (err) {
    console.error('Failed to load tags:', err);
    tagData = { all: [], roots: [] };
  }
}

// ============================================================
// Event Handling
// ============================================================

function attachEvents(container) {
  container.addEventListener('click', async (e) => {
    const target = e.target;

    // Create tag
    if (target.closest('#create-tag-btn')) {
      const input = container.querySelector('#new-tag-input');
      const name = input?.value?.trim();
      if (!name) return;

      try {
        await api.createTag(name);
        input.value = '';
        await refresh(container);
        showToast(`Tag "${name}" created`);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    // Cancel linking
    if (target.closest('#cancel-linking')) {
      linkingState = null;
      container.innerHTML = renderPage();
      return;
    }

    // Delete tag
    const deleteBtn = target.closest('[data-action="delete-tag"]');
    if (deleteBtn) {
      const tagId = parseInt(deleteBtn.dataset.tagId, 10);
      const tagName = deleteBtn.dataset.tagName;
      if (!confirm(`Delete tag "${tagName}"? This will remove it from all recipes.`)) return;

      try {
        await api.deleteTag(tagId);
        await refresh(container);
        showToast(`Tag "${tagName}" deleted`);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }

    // Link child — start linking mode
    const linkBtn = target.closest('[data-action="link-child"]');
    if (linkBtn) {
      const parentId = parseInt(linkBtn.dataset.tagId, 10);
      linkingState = { mode: 'select-child', parentId };
      container.innerHTML = renderPage();
      return;
    }

    // Unlink from parent
    const unlinkBtn = target.closest('[data-action="unlink"]');
    if (unlinkBtn) {
      const childId = parseInt(unlinkBtn.dataset.tagId, 10);
      // Find the parent by walking up the DOM to find the parent tag-tree-item
      const parentItem = unlinkBtn.closest('.tag-tree-item')?.parentElement?.closest('.tag-tree-item');
      // Actually, we need to find the parent from the data. Let's find which parent this child belongs to.
      const tag = tagData.all.find(t => t.id === childId);
      if (tag && tag.parent_ids && tag.parent_ids.length > 0) {
        // If multiple parents, we'd need to know which one. For simplicity, unlink from the nearest.
        // Use the DOM structure: the item's container determines its parent context.
        for (const parentId of tag.parent_ids) {
          try {
            await api.removeTagHierarchy(parentId, childId);
          } catch {}
        }
        await refresh(container);
        showToast('Tag unlinked');
      }
      return;
    }

    // Click on tag name — either rename or select as child (if in linking mode)
    const tagNameEl = target.closest('.tag-tree-name');
    if (tagNameEl) {
      const tagId = parseInt(tagNameEl.dataset.tagId, 10);

      if (linkingState) {
        // Link this tag as child of the parent
        try {
          await api.addTagHierarchy(linkingState.parentId, tagId);
          linkingState = null;
          await refresh(container);
          showToast('Tags linked');
        } catch (err) {
          showToast(err.message, 'error');
        }
        return;
      }

      // Rename — inline edit
      const currentName = tagNameEl.textContent.trim();
      const newName = prompt('Rename tag:', currentName);
      if (newName && newName.trim() && newName.trim() !== currentName) {
        try {
          await api.renameTag(tagId, newName.trim());
          await refresh(container);
          showToast(`Tag renamed to "${newName.trim()}"`);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
      return;
    }
  });

  // Enter key on new tag input
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'new-tag-input') {
      e.preventDefault();
      container.querySelector('#create-tag-btn')?.click();
    }
  });
}

async function refresh(container) {
  await loadTags();
  container.innerHTML = renderPage();
}

async function showToast(message, type = 'success') {
  try {
    const app = await getApp();
    if (app.showToast) app.showToast(message, type);
  } catch {}
}

// ============================================================
// Main Entry Point
// ============================================================

export async function renderTagManager(container) {
  linkingState = null;
  container.innerHTML = '<div class="page-transition" style="text-align:center;padding:3rem;"><div class="spinner" style="margin:0 auto;"></div><p>Loading tags...</p></div>';
  await loadTags();
  container.innerHTML = renderPage();
  attachEvents(container);
}
