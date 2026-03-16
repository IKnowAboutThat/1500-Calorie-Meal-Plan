# Planner Recipe Card Drag-and-Drop — Implementation Report

## Files Changed

| File | Lines Changed | What |
|------|--------------|------|
| `app/js/meal-planner.js` | ~130 added | Drag state, slot rendering refactor, moveOrSwapRecipe helper, 5 drag event handlers |
| `app/css/styles.css` | ~30 added | Recipe card styling, dragging state, drop-target highlight |

## Plan Steps Completed

### 1. Planner-local drag state (line 278)

Added `dragState` module-level variable (`{ fromDayKey, fromSlotName, recipeId, cooked }`). Set on `dragstart`, cleared on `dragend` and `drop`. Never persisted.

### 2. Slot rendering refactored (lines 384–391)

Filled slots now wrap the recipe name and macro badges inside a `.planner-slot__recipe-card` div with:
- `draggable="true"`
- `data-drag-day`, `data-drag-slot`, `data-drag-recipe-id`, `data-drag-cooked`

Buttons (cooked, swap, remove) remain **outside** the draggable card to prevent click-vs-drag interference.

Empty slots are unchanged — they already expose `data-day` and `data-slot` on the slot root.

### 3. Every slot is a drop target

Both empty (`.planner-slot--empty`) and filled (`.planner-slot--filled`) slots carry `data-day` and `data-slot` on their root element. The `dragover` handler calls `preventDefault()` on any `.planner-slot` ancestor, enabling drops on both.

### 4. Drag event delegation (lines 807–894)

Five delegated handlers registered on the container, alongside the existing click handler:

| Event | Behavior |
|-------|----------|
| `dragstart` | Captures source metadata into `dragState`, adds `--dragging` class |
| `dragend` | Clears `--dragging` class and all `--drop-over` highlights, nulls `dragState` |
| `dragover` | `preventDefault()` on valid `.planner-slot` targets, adds `--drop-over` highlight |
| `dragleave` | Removes `--drop-over` only when truly leaving the slot (not entering a child) |
| `drop` | Resolves target slot, calls `moveOrSwapRecipe`, clears visual state |

All handlers are removed and re-attached on each render to prevent stacking.

### 5. moveOrSwapRecipe helper (lines 713–765)

Single mutation function handling both move and swap:

- **Self-drop**: silent no-op (same day + same slot)
- **Move to empty**: source recipe + cooked state moves to target; source cleared
- **Swap with filled**: both slots exchange `recipeId` and `cooked` atomically
- **Invalid state**: throws with descriptive error messages (no silent failures)
- **Persistence**: calls `store.saveWeekPlan()` then re-renders via `renderMealPlanner()`
- **Toast**: "Moved X to SlotName" or "Swapped X ↔ Y"

### 6. Cooked-state correctness

Cooked state travels with the recipe in both move and swap operations:
- Move: `cooked` moves to destination, source gets `false`
- Swap: `cooked` values are exchanged between the two slots

No inventory side effects — inventory deduction only happens on the cooked-button click path.

### 7. CSS styling (styles.css section 16d)

| Class | Purpose |
|-------|---------|
| `.planner-slot__recipe-card` | Subtle bg, 1px border, `cursor: grab`, tight padding (0.375rem × 0.5rem) |
| `.planner-slot__recipe-card:hover` | Border highlights to primary-light, gains shadow |
| `.planner-slot__recipe-card--dragging` | 0.4 opacity, no shadow |
| `.planner-slot--drop-over` | 2px dashed primary outline, green glow background |

Card is compact — only slightly larger than the previous plain text.

### 8. Desktop layout protected

No changes to `.planner-slot` min-width or `.planner-day__slots` flex behavior. The inner recipe card is fluid within the existing slot width. Text truncation was already handled by the slot's `min-width: 200px` and `flex: 1`.

### 9. Existing slot actions preserved

All existing click handlers remain intact:
- **Mark cooked** — button outside draggable card, uses `stopPropagation()`
- **Swap via picker** — button outside draggable card
- **Remove recipe** — button outside draggable card
- **View recipe details** — click on recipe name inside the card still triggers `view-recipe` action
- **Pick recipe (empty slot)** — empty slots unchanged, still have `data-action="pick-recipe"`

### 10. User feedback

Toast shown after every successful move or swap. No toast for self-drop (no-op). Invalid states throw rather than silently failing.

## Error Handling Philosophy

Per user instruction: **loud breaking failures, zero fallbacks**.

- `moveOrSwapRecipe` throws on invalid day keys, missing slots, and empty source slots
- `drop` handler throws if `dragState` is null or target slot element is missing
- No try/catch wrapping — errors propagate to console as unhandled rejections

## Manual Verification Checklist

From the plan — all scenarios supported by the implementation:

- [ ] Drag filled slot to empty slot on the same day
- [ ] Drag filled slot to filled slot on the same day
- [ ] Drag filled slot to empty slot on a different day
- [ ] Drag filled slot to filled slot on a different day
- [ ] Move a cooked assignment — verify cooked styling follows
- [ ] Drop onto the source slot — verify no-op
- [ ] Click the recipe card — verify recipe details still open
- [ ] Click cooked, swap, and remove buttons after feature added
- [ ] Verify planner layout on desktop and mobile widths
