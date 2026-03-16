# Planner Recipe Card Drag-and-Drop Implementation Plan

## Overview

The planner page is rendered by [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js), with slot markup generated in [`app/js/meal-planner.js#L357`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L357) and click delegation attached in [`app/js/meal-planner.js#L715`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L715). There is no existing drag-and-drop abstraction, so the implementation should extend the current event-delegation model rather than introduce a new architecture.

Primary files to change:

- [`app/js/meal-planner.js`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js)
- [`app/css/styles.css`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/css/styles.css)

## Proposed Behavior

- Filled meal slots should render the assigned recipe as a compact inner card instead of plain title text.
- The recipe card should be draggable from any filled slot to any other slot in the visible week.
- Dropping onto an empty slot should move the recipe there and clear the origin slot.
- Dropping onto a filled slot should swap the two assigned recipes.
- The existing picker-based assignment workflow should remain unchanged.

## Why Swap On Occupied Targets

- The user explicitly wants quick rearrangement when similar meals land too close together.
- Requiring a target slot to be empty adds friction and defeats the purpose of fast planner cleanup.
- Swap behavior is the most direct interpretation of dragging one assigned recipe onto another existing meal slot.

## Detailed Implementation Steps

### 1. Add planner-local drag state

Add a small module-level drag descriptor in [`app/js/meal-planner.js#L273`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L273), near the existing `currentWeekId` and `currentContainer` state.

Suggested fields:

- `fromDayKey`
- `fromSlotName`
- `recipeId`
- `cooked`

Justification:

- Drag state is transient UI state and should not be persisted.
- The planner already re-renders from canonical plan data after every mutation.

### 2. Refactor slot rendering to emit a compact draggable recipe card

Modify slot rendering in [`app/js/meal-planner.js#L357-L389`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L357).

Current behavior:

- Empty slots render a dashed slot shell.
- Filled slots render action buttons, a bold recipe title, and macro badges.

Required change:

- Keep the outer slot container.
- Replace the plain title element at [`app/js/meal-planner.js#L381`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L381) with a compact `.planner-slot__recipe-card`.
- Add `draggable="true"` and source datasets to that inner card.
- Preserve click-to-view behavior on the card body or title.

Constraint:

- Do not make the entire slot draggable. The slot header buttons would become unreliable.

### 3. Make every slot a drop target

Use the slot root element as the destination target in both empty and filled branches in [`app/js/meal-planner.js#L360-L388`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L360).

Requirements:

- Every slot root must consistently expose `data-day` and `data-slot`.
- Drop handlers must be able to resolve the destination whether the slot is empty or filled.

Justification:

- Target discovery should not depend on whether a slot currently has a recipe.

### 4. Add drag event delegation next to click delegation

Extend [`app/js/meal-planner.js#L715-L868`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L715) with named delegated handlers for:

- `dragstart`
- `dragend`
- `dragover`
- `dragleave`
- `drop`

Behavior notes:

- `dragstart` captures source slot metadata into the module-level drag state.
- `dragover` must call `preventDefault()` on valid slot targets.
- `drop` resolves source and destination and invokes a dedicated move/swap helper.
- `dragend` clears visual drag state.

Justification:

- The planner destroys and rebuilds `container.innerHTML` during re-render at [`app/js/meal-planner.js#L286-L292`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L286), so delegated listeners are the correct pattern.

### 5. Add a single move/swap mutation helper

Create a helper near the existing assignment helpers around [`app/js/meal-planner.js#L654`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L654), for example:

`moveOrSwapRecipe(fromDayKey, fromSlotName, toDayKey, toSlotName)`

Responsibilities:

- Load the current week plan through `loadOrCreatePlan`
- Resolve source and target slot objects
- No-op on invalid slots or self-drop
- Move into empty target
- Swap if target already has a recipe
- Persist with [`app/js/store.js#L116-L119`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/store.js#L116)
- Re-render via [`app/js/meal-planner.js#L281`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L281)
- Show a concise toast confirming the move or swap

Justification:

- All drag/drop mutation logic should live in one place to avoid duplicating plan editing rules.

### 6. Preserve cooked-state correctness during moves and swaps

Current cooked-state behavior is handled per slot in [`app/js/meal-planner.js#L766-L823`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L766).

Recommended rule:

- Move to empty slot: move `recipeId` and `cooked` together.
- Swap with filled slot: swap `recipeId` and `cooked` together.

Justification:

- `cooked` currently belongs to the assignment stored in the slot object, not to the calendar position alone.
- Leaving `cooked` behind on the old slot after a move would corrupt planner state.

Constraint:

- This feature should not alter inventory deduction behavior. Inventory only changes when the cooked button is clicked, not when assignments are rearranged.

### 7. Add compact visual styling for the draggable recipe card

Extend planner styling in [`app/css/styles.css#L328-L370`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/css/styles.css#L328) and the cooked-slot styling in [`app/css/styles.css#L937-L945`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/css/styles.css#L937).

Add styles for:

- `.planner-slot__recipe-card`
- `.planner-slot__recipe-card--dragging`
- `.planner-slot--drop-target`
- `.planner-slot--drop-over`

Visual constraints:

- The inner recipe card should be only slightly larger than the current title text.
- Avoid large tile/card styling.
- Keep padding tight and typography compact.
- Use truncation or line clamp if needed to prevent growth.

Justification:

- The outer slot is already a card-like container. The new inner card only needs to signal “this is a movable object.”

### 8. Protect desktop layout and responsive behavior

Relevant layout rules:

- Slot row layout: [`app/css/styles.css#L321-L326`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/css/styles.css#L321)
- Desktop no-wrap rule: [`app/css/styles.css#L1514-L1516`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/css/styles.css#L1514)

Constraint:

- On desktop, planner slots do not wrap. Any significant width increase in filled slots will create layout pressure immediately.

Plan:

- Keep the inner recipe card width fluid within the existing slot width.
- Prefer truncation over growth.
- Avoid increasing `min-width` on `.planner-slot`.

### 9. Keep all existing slot actions working

Existing controls live in [`app/js/meal-planner.js#L373-L379`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L373).

The following must remain intact:

- Mark cooked
- Swap via picker
- Remove recipe
- View recipe details

Constraint:

- Small pointer movements while clicking buttons must not begin a drag unintentionally.

Implementation guard:

- Only the inner recipe card should be draggable.
- Buttons should remain outside that draggable region.

### 10. Add clear but minimal user feedback

Existing toast patterns appear in:

- [`app/js/meal-planner.js#L674-L678`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L674)
- [`app/js/meal-planner.js#L700-L701`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L700)

Recommended:

- Show one concise toast after move or swap.
- Do not show a toast for invalid no-op drops.

Justification:

- Drag/drop is less explicit than a button click and benefits from a lightweight confirmation after the planner re-renders.

## Constraints Summary

- Architecture must remain vanilla JS and CSS. No framework or large refactor.
- Persistence must continue through the existing meal-plan API in [`app/js/api.js#L141-L159`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/api.js#L141).
- Drag/drop is additive. The recipe picker flow at [`app/js/meal-planner.js#L504-L587`](/Users/whitneyhaskin/Documents/1500%20Calorie%20Meal%20Plan/.worktrees/planner-recipe-card-dnd/app/js/meal-planner.js#L504) must remain.
- The feature is week-local. There is no need for cross-week drag/drop in this implementation.
- The compact look is a hard requirement. The planner should not gain large visual cards.
- Cooked-state integrity must be preserved during move and swap operations.

## Risks

- Cooked-state corruption if assignment metadata is only partially moved.
- Click-versus-drag conflicts on the recipe card.
- Desktop overflow because `.planner-day__slots` does not wrap.
- Drop-target resolution failures if nested elements are used without consistent slot root datasets.

## Manual Verification Checklist

- Drag filled slot to empty slot on the same day.
- Drag filled slot to filled slot on the same day.
- Drag filled slot to empty slot on a different day.
- Drag filled slot to filled slot on a different day.
- Move a cooked assignment and verify cooked styling follows the assignment.
- Drop onto the source slot and verify it no-ops cleanly.
- Click the recipe card and verify recipe details still open.
- Click cooked, swap, and remove buttons after the feature is added.
- Verify planner layout on desktop and mobile widths.
