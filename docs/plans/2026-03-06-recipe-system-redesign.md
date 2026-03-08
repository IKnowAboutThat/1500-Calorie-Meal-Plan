# Recipe System Redesign: SQLite + Flask + AI-Powered Recipe Parsing

**Date:** 2026-03-06
**Status:** Approved design, pending implementation

---

## Overview

Redesign the meal planner app's recipe storage from a static JavaScript file (`recipes.js`) to a SQLite database served by a Flask API. Add an "Add Recipe" feature that lets users paste raw recipe text, which gets parsed by Claude (via the Python Anthropic SDK) and enriched with full nutritional data from the USDA FoodData Central API.

---

## Goals

- Add recipes by pasting text — no manual entry of ingredients, macros, or steps
- Full nutritional profiles (macros + all vitamins/minerals) sourced from USDA
- Ingredients are canonical entities shared across recipes (no duplication)
- Flexible, user-created nested tag system where tags can have multiple parents
- Recipe-level macros are always calculated from ingredients, never stored statically
- Migrate all existing recipes from `recipes.js` into the new database

---

## Architecture

### Components

1. **Browser app** (vanilla JS) — existing SPA, modified to fetch from the Flask API
2. **Flask server** — REST API, manages SQLite, orchestrates Claude + USDA calls
3. **SQLite database** — single `.db` file in the project directory
4. **Python Anthropic SDK** — parses pasted recipe text into structured data (no API key in codebase; uses account authorization from the environment)
5. **USDA FoodData Central API** — provides full micro/macronutrient profiles per ingredient

### System Diagram

```
Browser (vanilla JS SPA)
    |
    | HTTP (fetch)
    |
Flask Server (Python)
    |
    |--- SQLite (recipes.db)
    |--- Anthropic SDK (Claude) — recipe text parsing
    |--- USDA FoodData Central API — nutritional data lookup
```

---

## Database Schema

### `ingredients`

Canonical ingredient records with full nutritional data per 100g.

| Column             | Type       | Notes                                      |
|--------------------|------------|--------------------------------------------|
| id                 | INTEGER PK |                                            |
| name               | TEXT       | Canonical name (e.g., "chicken breast")    |
| usda_fdc_id        | INTEGER    | USDA FoodData Central ID for re-fetching   |
| calories_per_100g  | REAL       |                                            |
| protein_per_100g   | REAL       |                                            |
| fat_per_100g       | REAL       |                                            |
| carbs_per_100g     | REAL       |                                            |
| fiber_per_100g     | REAL       |                                            |
| micronutrients     | JSON       | Full vitamin/mineral profile from USDA     |
| category           | TEXT       | e.g., "protein", "grain", "vegetable"      |
| created_at         | DATETIME   |                                            |

### `recipes`

| Column            | Type       | Notes                                       |
|-------------------|------------|---------------------------------------------|
| id                | INTEGER PK |                                             |
| name              | TEXT       |                                             |
| description       | TEXT       |                                             |
| instructions      | TEXT       | Full cooking instructions                   |
| notes             | TEXT       | User notes                                  |
| meal_type         | TEXT       | "meal" or "snack"                           |
| cuisine           | TEXT       |                                             |
| main_protein      | TEXT       |                                             |
| servings          | INTEGER    |                                             |
| phase             | TEXT       | "standard" or "luteal"                      |
| prep_time_min     | INTEGER    |                                             |
| marinate_time_min | INTEGER    |                                             |
| cook_time_min     | INTEGER    |                                             |
| total_time_min    | INTEGER    |                                             |
| source_name       | TEXT       | Where the recipe came from                  |
| source_url        | TEXT       |                                             |
| thumbnail_path    | TEXT       | Path to saved image                         |
| rating            | INTEGER    | 1-5                                         |
| created_at        | DATETIME   |                                             |

Recipe-level macros (total calories, protein, fat, carbs, fiber, vitamins, minerals) are **never stored** — always calculated on the fly from `recipe_ingredients` x `ingredients`.

### `recipe_ingredients`

Junction table linking recipes to ingredients with specific amounts.

| Column        | Type       | Notes                              |
|---------------|------------|------------------------------------|
| id            | INTEGER PK |                                    |
| recipe_id     | INTEGER FK | References `recipes.id`            |
| ingredient_id | INTEGER FK | References `ingredients.id`        |
| amount        | REAL       | Quantity in the specified unit      |
| unit          | TEXT       | Mostly "g" but flexible            |
| sort_order    | INTEGER    | Preserves ingredient list ordering  |

### `tags`

Flat tag entities. A tag is a thing, not a position in a tree.

| Column | Type       | Notes                    |
|--------|------------|--------------------------|
| id     | INTEGER PK |                          |
| name   | TEXT       | Unique tag name          |

### `tag_hierarchy`

Many-to-many self-relationship allowing tags to have multiple parents. A tag can appear in multiple places in the hierarchy without being duplicated.

| Column        | Type       | Notes                              |
|---------------|------------|------------------------------------|
| parent_tag_id | INTEGER FK | References `tags.id`               |
| child_tag_id  | INTEGER FK | References `tags.id`               |

Top-level tags have no rows where they are the `child_tag_id`.

### `recipe_tags`

Links recipes to tags **with lineage context**. A recipe is tagged with a specific tag in a specific parent context, not just a bare tag.

| Column        | Type               | Notes                                          |
|---------------|--------------------|-------------------------------------------------|
| recipe_id     | INTEGER FK         | References `recipes.id`                         |
| tag_id        | INTEGER FK         | References `tags.id` (the tag itself, e.g., "Rice") |
| parent_tag_id | INTEGER FK or NULL | References `tags.id` (the context, e.g., "Vietnamese"). NULL if top-level tag. |

**How lineage tagging works:**
- Tagging a recipe with "Vietnamese > Rice" creates a row: `tag_id=Rice, parent_tag_id=Vietnamese`
- Tagging the same recipe with "Thai > Rice" would be a separate row: `tag_id=Rice, parent_tag_id=Thai`
- Querying "everything tagged Rice" (any lineage) = filter by `tag_id=Rice`
- Querying "everything tagged Vietnamese > Rice" = filter by `tag_id=Rice AND parent_tag_id=Vietnamese`
- Renaming "Rice" updates it everywhere — it's one entity in `tags`
- Reorganizing the hierarchy (moving Rice under a new parent) only changes `tag_hierarchy`, not `recipe_tags`

---

## API Endpoints

### Recipes

| Method | Endpoint                  | Description                                              |
|--------|---------------------------|----------------------------------------------------------|
| GET    | `/api/recipes`            | List all recipes (with calculated macros)                |
| GET    | `/api/recipes/<id>`       | Get single recipe with full detail                       |
| POST   | `/api/recipes/parse`      | Parse pasted recipe text via Claude + USDA lookup        |
| POST   | `/api/recipes`            | Save a parsed/reviewed recipe to the database            |
| PUT    | `/api/recipes/<id>`       | Update an existing recipe                                |
| DELETE | `/api/recipes/<id>`       | Delete a recipe                                          |

### Ingredients

| Method | Endpoint                  | Description                                              |
|--------|---------------------------|----------------------------------------------------------|
| GET    | `/api/ingredients`        | List all known ingredients                               |
| GET    | `/api/ingredients/<id>`   | Get ingredient with full nutritional profile              |

### Tags

| Method | Endpoint                  | Description                                              |
|--------|---------------------------|----------------------------------------------------------|
| GET    | `/api/tags`               | Get full tag tree (all tags with hierarchy)               |
| POST   | `/api/tags`               | Create a new tag                                         |
| PUT    | `/api/tags/<id>`          | Rename/edit a tag (updates everywhere)                   |
| DELETE | `/api/tags/<id>`          | Delete a tag                                             |
| POST   | `/api/tags/hierarchy`     | Add a parent-child relationship between tags             |
| DELETE | `/api/tags/hierarchy`     | Remove a parent-child relationship                       |

### Recipe Tags

| Method | Endpoint                       | Description                                         |
|--------|--------------------------------|-----------------------------------------------------|
| POST   | `/api/recipes/<id>/tags`       | Tag a recipe (with lineage: tag_id + parent_tag_id) |
| DELETE | `/api/recipes/<id>/tags`       | Remove a tag from a recipe                          |

---

## Add Recipe Flow

### Step 1: User pastes recipe text

In the browser, user clicks "Add Recipe" and pastes raw recipe text into a text area. This can be any format — a blog recipe, text from a cookbook, a friend's recipe, etc.

### Step 2: Claude parses the text

```
POST /api/recipes/parse
Body: { "text": "<pasted recipe text>" }
```

Flask sends the text to Claude via the Anthropic SDK with a structured prompt asking it to extract:
- Recipe name, description
- Ingredients with amounts and units (converted to grams where possible)
- Cooking instructions (as steps)
- Prep time, marinate time, cook time
- Cuisine, meal type, main protein
- Servings count

Claude returns structured JSON matching the recipe schema.

### Step 3: USDA nutritional lookup

For each ingredient Claude extracted:

1. Search USDA FoodData Central API for the ingredient name
2. Use fuzzy matching to handle alternate names, spelling variations, abbreviations
3. If multiple candidates, pick the best match
4. If **no match found after thorough search**: **HARD ERROR** — return the failed ingredient name and all search terms tried. Do not estimate. Do not fall back to Claude.
5. If match found: pull the full nutritional profile (macros + all vitamins and minerals) and store as a canonical ingredient record (or match to an existing one)

### Step 4: User reviews the parsed recipe

The browser displays the fully parsed recipe with:
- All fields pre-populated
- Full nutritional breakdown per ingredient and totals
- Ability to edit any field before saving
- Ability to assign tags (with lineage)

### Step 5: User saves

```
POST /api/recipes
Body: { <full recipe object> }
```

Flask saves the recipe, creates/reuses ingredient records, creates `recipe_ingredients` entries, and applies tags.

---

## USDA Lookup Strategy

The USDA FoodData Central API is free and does not require an API key for basic usage.

**Search approach (in order):**
1. Exact match on ingredient name
2. Normalized match (lowercase, remove plurals, trim whitespace)
3. Synonym/alternate name search (e.g., "scallion" = "green onion")
4. Partial/fuzzy match
5. If all fail: **hard error with details**

**Error response example:**
```json
{
  "error": "ingredient_not_found",
  "ingredient": "GF miso paste",
  "searches_tried": [
    "GF miso paste",
    "gluten free miso paste",
    "miso paste",
    "miso"
  ],
  "message": "Could not find 'GF miso paste' in USDA database after 4 search attempts"
}
```

**Future fallback (disabled for now):**
Once confident the search is robust, enable a Claude estimation fallback for ingredients not in USDA. This will be behind a config flag, defaulting to `false`.

---

## Migration Plan

### Existing recipes from `recipes.js`

1. Parse all ~90+ recipes from `recipes.js`
2. For each ingredient, look up or create a canonical `ingredients` record with USDA data
3. Create `recipe` records with all existing metadata (name, cuisine, meal_type, etc.)
4. Create `recipe_ingredients` junction records
5. Migrate existing tags to the new tag system
6. Verify calculated macros match the original stored values (flag discrepancies for review)

### App migration

1. Add Flask server with SQLite and all API endpoints
2. Modify browser app to fetch recipes from `/api/recipes` instead of importing `recipes.js`
3. Add "Add Recipe" UI (paste text area, preview/edit screen, tag assignment)
4. Update planner, shopping list, pantry, and dashboard pages to use the API
5. Keep `recipes.js` as a backup until migration is verified

---

## File Structure

```
1500 Calorie Meal Plan/
  app/
    index.html
    css/styles.css
    js/
      app.js
      meal-planner.js
      recipe-library.js
      shopping-list.js
      pantry.js
      macro-dashboard.js
      settings.js
      favorites-tags.js
      recipe-scaling.js
      auto-plan.js
      store.js
  server/
    app.py              # Flask app entry point
    config.py           # Config (USDA API base URL, DB path, Claude fallback flag)
    db.py               # SQLite connection + schema initialization
    models/
      recipe.py         # Recipe CRUD operations
      ingredient.py     # Ingredient CRUD + USDA lookup
      tag.py            # Tag + hierarchy CRUD
    services/
      claude_parser.py  # Anthropic SDK integration for recipe parsing
      usda_lookup.py    # USDA FoodData Central API client
    requirements.txt    # flask, anthropic
  data/
    recipes.db          # SQLite database (gitignored)
  docs/
    plans/
      2026-03-06-recipe-system-redesign.md  # This file
```

---

## Tech Stack

| Component       | Technology                                  |
|-----------------|---------------------------------------------|
| Frontend        | Vanilla JS (existing), no framework         |
| Backend         | Python / Flask                              |
| Database        | SQLite                                      |
| AI parsing      | Anthropic Python SDK (account auth, no key) |
| Nutrition data  | USDA FoodData Central API (free)            |

---

## Open Questions / Future Considerations

- **Recipe thumbnail storage**: Store images locally in a `data/images/` directory, or use URLs? (Decide during implementation)
- **Claude estimation fallback**: Currently disabled. Enable once USDA search is proven reliable.
- **Planner/shopping list/pantry migration**: These currently work off `recipes.js` data. Will need to be updated to use the API. Can be done incrementally.
- **Multi-user support**: Not needed now. SQLite + local Flask is single-user by design.
- **Backup/export**: Consider adding a `/api/export` endpoint that dumps the full database as JSON for portability.
