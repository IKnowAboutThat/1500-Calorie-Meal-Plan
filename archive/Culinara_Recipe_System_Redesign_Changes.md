# Culinara Recipe System Redesign — Changes Document

**Date:** March 7, 2026
**Project:** /Users/whitneyhaskin/Programs/Culinara
**Stack:** TypeScript, Express, React, SQLite (Drizzle ORM), Vite, Tailwind CSS

---

## Overview

Implemented a 10-feature recipe system redesign for the Culinara meal planner app. The original plan assumed Flask/plain-JS but was adapted to the existing TypeScript/Express/React architecture.

---

## 1. Canonical Ingredients Table

**File:** `server/db/schema.ts`

Added `canonicalIngredients` table with fields:
- `id` (TEXT, primary key)
- `name` (TEXT, unique)
- `caloriesPer100g`, `proteinPer100g`, `fatPer100g`, `carbsPer100g`, `fiberPer100g` (REAL)
- `micronutrients` (TEXT — JSON blob for 20+ micronutrients)
- `usdaFdcId` (INTEGER — link to USDA FoodData Central)
- `createdAt`, `updatedAt` timestamps

**File:** `server/db/index.ts`

Added raw SQL `CREATE TABLE IF NOT EXISTS canonical_ingredients` and ALT TABLE migration to add `canonical_ingredient_id` FK to the existing `ingredients` table. Includes index on `canonical_ingredient_id`.

---

## 2. USDA FoodData Central Lookup Service

**File:** `server/services/usda_lookup.ts` (NEW)

Full USDA API client with multi-strategy search:
- Exact match → Normalized → Synonym mapping → Fuzzy → Last-word fallback
- Contains synonym mappings for ~40 common ingredients (e.g., "chicken breast" → "chicken, broilers or fryers, breast")
- Extracts macros + 20+ micronutrients from USDA nutrient IDs
- Caches results in `canonical_ingredients` table
- Uses `DEMO_KEY` by default; override with `USDA_API_KEY` env var

**Exports:**
- `lookupIngredient(name)` → `NutritionalProfile`
- `getOrCreateCanonicalIngredient(name)` → canonical ingredient ID

---

## 3. Claude AI Recipe Parser

**File:** `server/services/claude_parser.ts` (NEW)

Anthropic SDK integration using `claude-sonnet-4-20250514`:
- Accepts raw recipe text, returns structured `ParsedRecipe` JSON
- Extracts: title, description, ingredients (with `gramsEquivalent` for USDA lookup), steps (with sections and timeValues), prep/cook/marinate times, servings, cuisine, mealType, mainProtein
- System prompt instructs Claude to normalize ingredient names, estimate gram weights, separate preparation from ingredient names
- Handles markdown code fence stripping from Claude responses

**Dependency added:** `@anthropic-ai/sdk: 0.78.0` (in `package.json`)

---

## 4. Parse Endpoint

**File:** `server/routes/extract.ts` (MODIFIED)

Added `POST /extract/parse` endpoint:
- Orchestrates Claude parser → USDA lookup → nutrition calculation
- For each ingredient: parses with Claude, looks up USDA data, calculates per-serving and total nutrition
- Returns parsed recipe with `calculatedNutrition` (perServing and total) and any `lookupErrors`
- Includes `guessAisleCategory()` helper with regex-based categorization for ~16 aisle categories

---

## 5. Macro Calculation on Recipe Retrieval

**File:** `server/routes/recipes.ts` (MODIFIED)

- `GET /api/recipes/:id` now calculates and returns `calculatedNutrition` by summing nutritional data from linked canonical ingredients
- Returns calories, protein, fat, carbs, fiber per serving
- Added new recipe fields to POST and PUT handlers: `cuisine`, `mealType`, `mainProtein`, `phase`, `marinateTime`, `canonicalIngredientId`

---

## 6. Tag Hierarchy with Multi-Parent Support

**File:** `server/db/schema.ts`

Added 3 new tables:
- `tags` (id, name UNIQUE)
- `tagHierarchy` (parentTagId, childTagId) — many-to-many junction table enabling multi-parent tags
- `recipeTags` (recipeId, tagId, parentTagId) — lineage-aware tagging so a recipe tagged under "Dinner > Quick" doesn't also appear under "Lunch > Quick"

**File:** `server/db/index.ts`

Raw SQL for CREATE TABLE and indexes on `tag_hierarchy` and `recipe_tags`.

---

## 7. Canonical Ingredients API

**File:** `server/routes/canonicalIngredients.ts` (NEW)

- `GET /api/ingredients` — returns all canonical ingredients ordered by name

**File:** `server/index.ts` (MODIFIED)

- Wired `canonicalIngredientsRouter` at `/api/ingredients`

---

## 8. Paste-to-Parse Frontend

**File:** `src/pages/RecipeEdit.tsx` (MODIFIED — major changes)

- Added AI Parse panel: toggle button (Wand2 icon) in header reveals textarea for raw recipe text
- "Parse with AI" button calls `extractApi.parseText()`
- On successful parse: auto-populates ALL form fields from Claude response
- Shows nutrition preview (calories, protein, fat, carbs, fiber per serving)
- Shows USDA lookup warnings if any ingredients failed
- Added new form fields: marinateTime, cuisine (text), mealType (select), mainProtein (text), phase (text)
- Added lineage-aware tag picker using fetched tags with parent context display
- `selectedTags` state tracks `{ tagId, parentTagId }` objects

---

## 9. Tag Management UI

**File:** `src/pages/Tags.tsx` (NEW)

Full tag management page:
- Create tags via form
- Inline rename and delete with confirmation
- Link mode: click "link" icon on a tag, then click another tag to make it a child
- Unlink button to remove parent-child relationships
- Shows multi-parent badges and a dedicated "Multi-Parent Tags" section
- Recursive `renderTagTree` with depth-based indentation

**File:** `src/App.tsx` (MODIFIED)

- Added route: `<Route path="tags" element={<Tags />} />`

**File:** `src/components/Layout.tsx` (MODIFIED)

- Added "Tags" to navigation with Tag icon

---

## 10. Enrichment Script

**File:** `server/scripts/enrich-recipes.ts` (NEW)

Run via: `npx tsx server/scripts/enrich-recipes.ts`

- Iterates all non-deleted recipes
- USDA-looks up each ingredient, creates canonical records, links them
- Compares calculated vs stored nutrition, flags >20% calorie discrepancies
- Rate-limited at 200ms between USDA API calls
- Outputs summary with success/failure counts and discrepancy report
- **Has not been run yet** — database currently has no recipes

---

## Tags API

**File:** `server/routes/tags.ts` (NEW)

Full CRUD:
- `GET /api/tags` — tree structure with recipe counts, returns `{ all: [], roots: [] }`
- `POST /api/tags` — create tag
- `PUT /api/tags/:id` — rename tag
- `DELETE /api/tags/:id` — delete tag
- `POST /api/tags/hierarchy` — add parent-child link (with cycle detection via BFS)
- `DELETE /api/tags/hierarchy` — remove parent-child link
- `POST /api/recipes/:id/tags` — tag a recipe (lineage-aware)
- `DELETE /api/recipes/:id/tags` — untag a recipe

**File:** `server/index.ts` (MODIFIED)

- Wired `tagsRouter` at `/api/tags`

---

## Frontend Type Updates

**File:** `src/types/index.ts` (MODIFIED)

Added interfaces:
- `CanonicalIngredient` (all USDA nutritional fields)
- `CalculatedNutrition` (calories, protein, fat, carbs, fiber, micronutrients)
- `Tag`, `TagHierarchyLink`, `RecipeTag`

Updated interfaces:
- `Recipe` — added marinateTime, cuisine, mealType, mainProtein, phase, calculatedNutrition, tags
- `Ingredient` — added canonicalIngredientId, optional canonicalIngredient

**File:** `src/lib/api.ts` (MODIFIED)

Added:
- `extractApi.parseText(text)` for AI parsing
- Full `tagsApi` (list, create, update, delete, addHierarchy, removeHierarchy, tagRecipe, untagRecipe)
- `canonicalIngredientsApi.list()`

---

## Database Migration Strategy

For existing SQLite databases, ALTER TABLE migrations run on startup:

```sql
ALTER TABLE recipes ADD COLUMN cuisine TEXT
ALTER TABLE recipes ADD COLUMN meal_type TEXT
ALTER TABLE recipes ADD COLUMN main_protein TEXT
ALTER TABLE recipes ADD COLUMN phase TEXT
ALTER TABLE recipes ADD COLUMN marinate_time INTEGER
ALTER TABLE ingredients ADD COLUMN canonical_ingredient_id TEXT REFERENCES canonical_ingredients(id)
```

Each migration is wrapped in try/catch — if the column already exists, the error is silently ignored.

Indexes on migrated columns are created AFTER the migration block to avoid crashes on existing databases.

---

## Bug Fixes During Implementation

1. **TypeScript `'data' is of type 'unknown'`** in usda_lookup.ts — fixed with explicit type cast
2. **Unused import `like`** in usda_lookup.ts — removed
3. **Unused variable `tagData`** in RecipeEdit.tsx — renamed to `allTags` (which is used)
4. **`Property 'all' does not exist on type 'any[]'`** in RecipeEdit.tsx — fixed `tagsApi.list()` return type to `{ all: any[]; roots: any[] }`
5. **SQLite crash: `no such column: canonical_ingredient_id`** on server start — moved index creation after ALTER TABLE migration block

---

## Current Status

- All 10 features implemented and server compiles/runs
- Server runs in tmux session "culinara" on ports 3001 (API) and 5174 (frontend)
- Database is empty — no recipes have been imported
- Enrichment script has not been run
- End-to-end testing has not been performed

---

## Note

The original 1500 Calorie Meal Plan app lives at:
`/Users/whitneyhaskin/Documents/1500 Calorie Meal Plan/app/`

The Culinara project lives at:
`/Users/whitneyhaskin/Programs/Culinara/`

These are separate projects. The recipe data from the meal plan has not been migrated into Culinara.
