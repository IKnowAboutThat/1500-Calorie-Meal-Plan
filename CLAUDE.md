# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Set up the virtual environment (one-time)
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -r server/requirements.txt

# Start the app (serves both frontend and API on port 5001)
cd server && python app.py

# Run recipe migration (one-time, imports from recipes.js into SQLite)
cd server && python migrate_recipes.py

# No automated test suite; server/test_api.py is manual/exploratory
```

## Architecture

Full-stack meal planning app: vanilla JS SPA frontend + Flask API backend + SQLite database. Flask serves both the static frontend and the API from a single process on port 5001. Caddy reverse-proxies port 5100 → localhost:5001 for HTTPS access.

```
app/ (frontend SPA)  ←→  server/ (Flask :5001, serves both)  ←→  data/recipes.db (SQLite)
                                ↓
                         USDA FoodData Central API (nutrition lookup)
                         Claude Agent SDK (recipe text parsing)
```

**Frontend** (`app/`): Hash-based SPA routing (`#recipes`, `#planner`, etc.). Each page has a module in `app/js/` with a `render*` function. State management via `store.js` using localStorage with pub/sub pattern. No framework, no build step. Served as static files by Flask.

**Backend** (`server/`): Flask with blueprints for modular routes. Entry point is `app.py`. Serves the frontend static files from `app/` and all API routes.
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
