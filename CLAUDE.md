# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Flask backend (from server/)
cd server && python app.py          # Runs on localhost:5001, debug mode

# Frontend - no build step, open app/index.html in browser
# Frontend connects to http://127.0.0.1:5001/api

# Install Python dependencies
pip install -r server/requirements.txt

# Run recipe migration (one-time, imports from recipes.js into SQLite)
cd server && python migrate_recipes.py

# No automated test suite; server/test_api.py is manual/exploratory
```

## Architecture

Full-stack meal planning app: vanilla JS SPA frontend + Flask API backend + SQLite database.

```
app/ (frontend SPA)  ←→  server/ (Flask :5001)  ←→  data/recipes.db (SQLite)
                                ↓
                         USDA FoodData Central API (nutrition lookup)
                         Claude Agent SDK (recipe text parsing)
```

**Frontend** (`app/`): Hash-based SPA routing (`#recipes`, `#planner`, etc.). Each page has a module in `app/js/` with a `render*` function. State management via `store.js` using localStorage with pub/sub pattern. No framework, no build step.

**Backend** (`server/`): Flask with blueprints for modular routes. Entry point is `app.py`.
- `routes/` — API endpoints (`/api/recipes`, `/api/ingredients`, `/api/tags`)
- `models/` — Database abstractions (recipe, ingredient, tag CRUD)
- `services/` — External integrations (USDA lookup with caching/scoring, Claude recipe parsing)
- `db.py` — SQLite connection pool, schema initialization, WAL mode, foreign keys enabled
- `config.py` — Reads from `server/.env` (USDA_API_KEY, ANTHROPIC_AUTH_TOKEN)

**Database** (`data/recipes.db`): 7 tables — `recipes`, `ingredients`, `recipe_ingredients` (junction), `tags`, `tag_hierarchy` (self-join with BFS cycle detection), `recipe_tags` (with lineage via parent_tag_id). CASCADE deletes on foreign keys.

## Key Patterns

- Macro nutrients (calories, protein, fat, carbs, fiber) are stored per-100g on ingredients and calculated per-recipe via recipe_ingredients amounts
- Micronutrient tracking (calcium, iron, B vitamins, etc.) stored as JSON on ingredients
- USDA lookup uses fuzzy matching with synonym mapping and result scoring
- Tag hierarchy supports parent-child relationships with cycle detection via BFS
- Frontend API wrapper in `app/js/api.js` — all backend calls go through this module
- USDA rate limiting: DEMO_KEY allows ~30 req/hour; scripts add 1-second delays between lookups
