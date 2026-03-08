"""One-time migration script: import recipes from recipes.js into SQLite.

Reads the JS export, creates recipe + ingredient records with USDA data,
and prints a discrepancy report comparing original vs calculated macros.

Two-phase approach to avoid DB locking:
  Phase A: Look up all unique ingredients via USDA (each opens/closes its own connection)
  Phase B: Create all recipes using cached ingredient data (single connection)
"""

import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from db import init_db, get_connection
from services.usda_lookup import get_or_create_ingredient, IngredientNotFoundError

RECIPES_JS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                'app', 'js', 'data', 'recipes.js')

USDA_DELAY = 1.0  # DEMO_KEY allows ~30 requests/hour; use 1s delay


def parse_recipes_js(filepath):
    """Parse the recipes array from the JS file."""
    with open(filepath, 'r') as f:
        content = f.read()

    match = re.search(r'export const recipes = \[', content)
    if not match:
        raise ValueError("Could not find 'export const recipes = [' in file")

    start = match.start() + len('export const recipes = ')
    depth = 0
    end = start
    for i, ch in enumerate(content[start:], start):
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    js_array = content[start:end]
    js_array = re.sub(r'(?<=[{,\n])\s*(\w+)\s*:', r' "\1":', js_array)
    js_array = re.sub(r',\s*([}\]])', r'\1', js_array)
    js_array = re.sub(r'//[^\n]*', '', js_array)

    return json.loads(js_array)


def migrate():
    """Run the full migration."""
    print("=== Recipe Migration ===\n")
    init_db()

    recipes = parse_recipes_js(RECIPES_JS_PATH)
    print(f"Found {len(recipes)} recipes\n")

    # Phase A: Collect and look up all unique ingredient names
    all_ingredient_names = set()
    for r in recipes:
        for ing in r.get('ingredients', []):
            all_ingredient_names.add(ing['name'])

    print(f"Phase A: Looking up {len(all_ingredient_names)} unique ingredients via USDA...\n")

    ingredient_cache = {}  # name -> ingredient dict
    ingredient_errors = []
    looked_up = 0

    for name in sorted(all_ingredient_names):
        try:
            result = get_or_create_ingredient(name)
            ingredient_cache[name] = result
            looked_up += 1
            print(f"  [{looked_up}/{len(all_ingredient_names)}] {name} -> {result['calories_per_100g']} cal/100g")
            time.sleep(USDA_DELAY)
        except IngredientNotFoundError as e:
            ingredient_errors.append({
                'ingredient': name,
                'searches_tried': e.searches_tried,
            })
            print(f"  [{looked_up + 1}/{len(all_ingredient_names)}] {name} -> NOT FOUND (tried: {e.searches_tried})")
            looked_up += 1
            time.sleep(USDA_DELAY)

    print(f"\nPhase A complete: {len(ingredient_cache)} found, {len(ingredient_errors)} not found\n")

    # Phase B: Create recipes using cached ingredient data
    print(f"Phase B: Creating {len(recipes)} recipes...\n")

    conn = get_connection()
    migrated = 0
    failed = []
    discrepancies = []

    for idx, recipe in enumerate(recipes):
        recipe_name = recipe.get('name', f'Recipe #{idx}')
        try:
            instructions = recipe.get('instructions', '')
            if isinstance(instructions, list):
                instructions = json.dumps(instructions)

            cursor = conn.execute("""
                INSERT INTO recipes (name, description, instructions, meal_type, cuisine,
                                    main_protein, servings, phase, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                recipe_name,
                recipe.get('description', ''),
                instructions,
                recipe.get('mealType', 'meal'),
                recipe.get('cuisine', ''),
                recipe.get('mainProtein', ''),
                recipe.get('servings', 1),
                recipe.get('phase', 'standard'),
                f"Day {recipe.get('dayOrigin', '?')}, {recipe.get('mealSlot', '')}",
            ))
            recipe_id = cursor.lastrowid

            total_cal = 0
            total_pro = 0
            total_fiber = 0

            for sort_idx, ing in enumerate(recipe.get('ingredients', [])):
                ing_name = ing['name']
                amount = ing.get('amount', 0)
                unit = ing.get('unit', 'g')

                if ing_name in ingredient_cache:
                    usda_ing = ingredient_cache[ing_name]
                    conn.execute("""
                        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order)
                        VALUES (?, ?, ?, ?, ?)
                    """, (recipe_id, usda_ing['id'], amount, unit, sort_idx))

                    factor = amount / 100.0
                    total_cal += (usda_ing['calories_per_100g'] or 0) * factor
                    total_pro += (usda_ing['protein_per_100g'] or 0) * factor
                    total_fiber += (usda_ing['fiber_per_100g'] or 0) * factor

            # Migrate tags
            for tag_name in recipe.get('tags', []):
                # Get or create tag inline
                tag_row = conn.execute("SELECT id FROM tags WHERE LOWER(name) = LOWER(?)", (tag_name,)).fetchone()
                if not tag_row:
                    cur = conn.execute("INSERT INTO tags (name) VALUES (?)", (tag_name,))
                    tag_id = cur.lastrowid
                else:
                    tag_id = tag_row['id']
                conn.execute(
                    "INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, parent_tag_id) VALUES (?, ?, 0)",
                    (recipe_id, tag_id)
                )

            conn.commit()
            migrated += 1

            # Discrepancy check
            orig_cal = recipe.get('calories', 0)
            calc_cal = round(total_cal, 1)
            if orig_cal > 0 and abs(calc_cal - orig_cal) / orig_cal > 0.10:
                discrepancies.append({
                    'recipe': recipe_name,
                    'original_cal': orig_cal,
                    'calculated_cal': calc_cal,
                    'diff_pct': round((calc_cal - orig_cal) / orig_cal * 100, 1),
                    'original_pro': recipe.get('protein', 0),
                    'calculated_pro': round(total_pro, 1),
                })

            print(f"  [{idx+1}/{len(recipes)}] {recipe_name} -> {round(total_cal,1)} cal (orig: {orig_cal})")

        except Exception as e:
            failed.append({'recipe': recipe_name, 'error': str(e)})
            print(f"  [{idx+1}/{len(recipes)}] {recipe_name} -> ERROR: {e}")
            conn.rollback()

    conn.close()

    # Report
    print(f"\n{'='*60}")
    print(f"MIGRATION REPORT")
    print(f"{'='*60}")
    print(f"Total recipes:     {len(recipes)}")
    print(f"Migrated:          {migrated}")
    print(f"Failed:            {len(failed)}")
    print(f"Ingredients found: {len(ingredient_cache)}")
    print(f"Ingredients lost:  {len(ingredient_errors)}")

    if failed:
        print(f"\n--- FAILED RECIPES ---")
        for f in failed:
            print(f"  {f['recipe']}: {f['error']}")

    if ingredient_errors:
        print(f"\n--- INGREDIENT LOOKUP ERRORS ({len(ingredient_errors)}) ---")
        for e in ingredient_errors:
            print(f"  '{e['ingredient']}' — tried: {e['searches_tried']}")

    if discrepancies:
        print(f"\n--- CALORIE DISCREPANCIES >10% ({len(discrepancies)}) ---")
        for d in discrepancies:
            print(f"  {d['recipe']}: orig={d['original_cal']} calc={d['calculated_cal']} ({d['diff_pct']:+.1f}%)")
    else:
        print(f"\nNo calorie discrepancies >10%")

    print(f"\n{'='*60}")
    print("Migration complete!")


if __name__ == '__main__':
    migrate()
