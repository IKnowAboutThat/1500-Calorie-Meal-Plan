# Recipe Migration Tracker

## Goal
Populate SQLite DB with all 100 recipes from `app/js/data/recipes.js`, then verify the frontend renders them from the API.

## Status: COMPLETE

## Tasks

### 1. Fix claude_parser.py — Remove API key requirement
- Status: DONE (already uses `anthropic.Anthropic()` with no explicit key)

### 2. Schema Compliance Check
- Status: DONE
- Sprint doc: `docs/sprints/sprint-1-schema-check.md`
- All 100 recipes pass schema validation
- 3 duplicate recipe names found: Harissa Chicken, Indian Egg + Lentil Masala, Turkey Roll-Ups + Hummus + Celery

### 3. Ingestion Script
- Status: DONE
- Sprint doc: `docs/sprints/sprint-2-ingestion.md`
- 97 unique recipes created (3 duplicates skipped)
- 135 ingredients created with per-100g nutrition data
- 676 recipe-ingredient junction rows created
- Idempotent: safe to re-run

### 4. Frontend Verification
- Status: DONE
- API serves 97 recipes with calculated macros
- Values match screenshot within rounding: BBQ Chicken 473.6 cal (screenshot: 473), 51.4g P (51.3g), 15.1g F (15.1g)
- Trailing slash issue fixed (`strict_slashes=False`)

### 5. Additional fixes during migration
- Created shared `server/js_parser.py` for robust JS-to-JSON conversion (handles colons in string values)
- Fixed Flask `strict_slashes` to prevent 308 redirects breaking fetch calls

## Key Files
- Source: `app/js/data/recipes.js`
- DB: `data/recipes.db`
- Server: `server/app.py` (port 5001)
- API base: `http://127.0.0.1:5001/api`
