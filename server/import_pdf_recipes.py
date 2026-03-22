"""Import 90 recipes from 30_day_meal_plan_v3.pdf into the database.

Strategy: split text into recipe blocks using "HOW TO MAKE IT" as delimiter,
then parse each block's name, ingredients, and instructions.
"""

import json
import re
import sqlite3
import subprocess
import sys
import os

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'recipes', '30_day_meal_plan_v3.pdf')
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'recipes.db')


def extract_text():
    result = subprocess.run(['pdftotext', PDF_PATH, '-'], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"pdftotext failed: {result.stderr}")
        sys.exit(1)
    return result.stdout


def parse_recipes(text):
    """Parse recipes by splitting on 'HOW TO MAKE IT' markers."""
    lines = text.split('\n')
    recipes = []

    # First pass: find all "HOW TO MAKE IT" line indices
    howto_indices = [i for i, line in enumerate(lines) if line.strip() == 'HOW TO MAKE IT']

    # Also find all meal slot markers for context
    meal_markers = []  # (line_idx, slot_type)
    day_markers = {}  # line_idx -> day_num
    week_at_line = {}  # line_idx -> week_num

    current_week = 1
    for i, line in enumerate(lines):
        stripped = line.strip()
        day_match = re.match(r'^Day (\d+)$', stripped)
        if day_match:
            day_markers[i] = int(day_match.group(1))

        week_match = re.match(r'^Week (\d+)', stripped)
        if week_match:
            current_week = int(week_match.group(1))
            week_at_line[i] = current_week

        if re.match(r'^(Meal [123]|Snack|Breakfast)$', stripped):
            meal_markers.append((i, stripped))

    # For each HOW TO MAKE IT, work backwards to find the recipe block
    for howto_idx in howto_indices:
        # Find the meal marker that precedes this HOW TO MAKE IT
        meal_line = None
        meal_slot = None
        for ml, ms in reversed(meal_markers):
            if ml < howto_idx:
                meal_line = ml
                meal_slot = ms
                break

        if meal_line is None:
            continue

        # Find the day for this recipe
        current_day = 0
        for dl in sorted(day_markers.keys()):
            if dl < meal_line:
                current_day = day_markers[dl]
            else:
                break

        # Find the week for this recipe
        current_week = 1
        for wl in sorted(week_at_line.keys()):
            if wl < howto_idx:
                current_week = week_at_line[wl]
            else:
                break

        # Extract the block between meal marker and HOW TO MAKE IT
        block_lines = [lines[j].strip() for j in range(meal_line, howto_idx)]

        # Parse recipe name: first try from the block after meal slot,
        # but if that fails (returns ingredient name), look backwards
        # from the meal marker for the name (PDF sometimes puts it before the slot)
        recipe_name = _extract_recipe_name(block_lines)

        # If the name looks like an ingredient (heuristic: matches a common ingredient pattern
        # or starts with lowercase), check lines before the meal marker
        if _looks_like_ingredient(recipe_name):
            pre_name = _find_name_before_marker(lines, meal_line)
            if pre_name:
                recipe_name = pre_name

        # Parse ingredients from the block
        ingredients = _extract_ingredients(block_lines)

        # Parse instructions after HOW TO MAKE IT
        instructions = _extract_instructions(lines, howto_idx + 1)

        # Determine meal_type
        if meal_slot == 'Snack':
            meal_type = 'snack'
        elif meal_slot == 'Breakfast':
            meal_type = 'breakfast'
        else:
            meal_type = 'meal'

        phase = 'standard' if current_week <= 3 else 'week4'

        recipes.append({
            'name': recipe_name,
            'meal_slot': meal_slot,
            'meal_type': meal_type,
            'day': current_day,
            'week': current_week,
            'phase': phase,
            'ingredients': ingredients,
            'instructions': instructions,
        })

    return recipes


def _looks_like_ingredient(name):
    """Check if a parsed 'name' looks like an ingredient rather than a recipe name."""
    # Known ingredient patterns that get misidentified as recipe names
    ingredient_indicators = [
        r'^Chicken breast$',
        r'^Canned tuna in water$',
        r'^Whole eggs$',
        r'^Vanilla protein powder$',
        r'^Chocolate protein powder$',
        r'^Steel cut oats$',
        r'^Rolled oats$',
        r'^Egg whites',
        r'^Urad dal, dry$',
        r'^Sardines',
    ]
    for pat in ingredient_indicators:
        if re.match(pat, name, re.IGNORECASE):
            return True
    return False


def _find_name_before_marker(lines, meal_line):
    """Look backwards from a meal slot marker to find the recipe name.

    The name is typically 1-3 lines before the meal marker, after
    skip patterns like cal totals and week info.
    """
    skip_patterns = [
        r'^$',
        r'^\d+ cal$',
        r'^\d+g (protein|fiber)$',
        r'^Week \d+',
        r'^Day \d+$',
        r'^[·]$',
        r'^\d+$',
        r'^\d+g$',
    ]

    i = meal_line - 1
    while i >= 0:
        stripped = lines[i].strip()
        if not stripped:
            i -= 1
            continue

        is_skip = False
        for pat in skip_patterns:
            if re.match(pat, stripped):
                is_skip = True
                break

        if is_skip:
            i -= 1
            continue

        # This should be the recipe name
        return stripped

    return None


def _extract_recipe_name(block_lines):
    """Extract recipe name from a block of lines between meal slot and HOW TO MAKE IT."""
    skip_patterns = [
        r'^$',                          # empty
        r'^Meal [123]$',                # meal slot
        r'^Snack$',
        r'^Breakfast$',
        r'^Week \d+',                   # week header
        r'^\d+ cal$',                   # calorie totals
        r'^\d+g (protein|fiber)$',      # macro totals
        r'^Ingredient$',                # table header
        r'^[·]$',                       # bullet
        r'^(g|cal|protein|fiber)$',     # column headers
        r'^\d+$',                       # bare numbers
        r'^\d+g$',                      # macro values
    ]

    for line in block_lines:
        if not line:
            continue
        is_skip = False
        for pat in skip_patterns:
            if re.match(pat, line):
                is_skip = True
                break
        if not is_skip:
            # This should be the recipe name — it's the first "real" text
            # But check it's not an ingredient name (those come after "Ingredient" header)
            # Recipe name comes before "Ingredient" header
            return line

    return "Unknown Recipe"


def _extract_ingredients(block_lines):
    """Extract ingredients from the block between meal slot and HOW TO MAKE IT.

    Ingredients are between the 'fiber' column header line and the 'Total' line.
    Pattern per ingredient: name, amount(num), calories(num), protein(Xg), fiber(Xg)
    """
    # Find the start: after the last "fiber" that's a column header
    # The column headers are: "g", "cal", "protein", "fiber" (each on own line)
    start_idx = None
    for i, line in enumerate(block_lines):
        if line == 'fiber':
            # Check if previous non-empty lines were the other column headers
            start_idx = i + 1

    if start_idx is None:
        return []

    # Find the end: "Total" line
    end_idx = len(block_lines)
    for i in range(start_idx, len(block_lines)):
        if block_lines[i] == 'Total':
            end_idx = i
            break

    # Now parse ingredients from start_idx to end_idx
    ing_lines = [block_lines[j] for j in range(start_idx, end_idx) if block_lines[j]]

    ingredients = []
    j = 0
    while j < len(ing_lines):
        line = ing_lines[j]

        # Skip the total row numbers at the end (cal_total, protein_total, fiber_total)
        # These are just numbers/Xg right before Total
        # We detect an ingredient name as text that doesn't match number patterns
        if re.match(r'^\d+g?$', line):
            j += 1
            continue

        # This should be an ingredient name
        ing_name = line
        j += 1

        # Read amount (integer)
        if j >= len(ing_lines) or not re.match(r'^\d+$', ing_lines[j]):
            continue
        amount_g = int(ing_lines[j])
        j += 1

        # Read calories (integer)
        if j >= len(ing_lines) or not re.match(r'^\d+$', ing_lines[j]):
            continue
        cal_val = int(ing_lines[j])
        j += 1

        # Read protein (Xg)
        if j >= len(ing_lines) or not re.match(r'^(\d+)g$', ing_lines[j]):
            continue
        protein_val = int(re.match(r'^(\d+)g$', ing_lines[j]).group(1))
        j += 1

        # Read fiber (Xg)
        if j >= len(ing_lines) or not re.match(r'^(\d+)g$', ing_lines[j]):
            continue
        fiber_val = int(re.match(r'^(\d+)g$', ing_lines[j]).group(1))
        j += 1

        ingredients.append({
            'name': ing_name,
            'amount_g': amount_g,
            'calories': cal_val,
            'protein': protein_val,
            'fiber': fiber_val,
        })

    return ingredients


def _extract_instructions(lines, start_idx):
    """Extract instructions starting after HOW TO MAKE IT."""
    instructions = []
    i = start_idx
    while i < len(lines):
        stripped = lines[i].strip()

        # Step number line
        if re.match(r'^\d+$', stripped):
            i += 1
            # Next non-empty line is the instruction
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i < len(lines):
                step_text = lines[i].strip()
                # Check if we've hit the next section
                if step_text in ('Meal 1', 'Meal 2', 'Meal 3', 'Snack', 'Breakfast', 'Day Total') or \
                   re.match(r'^Day \d+', step_text):
                    break
                instructions.append(step_text)
                i += 1
            continue

        # Stop if we hit the next section
        if stripped in ('Meal 1', 'Meal 2', 'Meal 3', 'Snack', 'Breakfast', 'Day Total') or \
           re.match(r'^Day \d+', stripped):
            break

        i += 1

    return instructions


def get_or_create_ingredient(conn, name, cal_per_amount, protein_per_amount, fiber_per_amount, amount_g):
    """Find or create an ingredient. Returns ingredient_id."""
    if amount_g == 0:
        amount_g = 1

    cal_per_100g = round(cal_per_amount / amount_g * 100, 2)
    protein_per_100g = round(protein_per_amount / amount_g * 100, 2)
    fiber_per_100g = round(fiber_per_amount / amount_g * 100, 2)

    row = conn.execute("SELECT id FROM ingredients WHERE name = ?", (name,)).fetchone()
    if row:
        return row[0]

    cursor = conn.execute("""
        INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fiber_per_100g,
                                 fat_per_100g, carbs_per_100g)
        VALUES (?, ?, ?, ?, 0, 0)
    """, (name, cal_per_100g, protein_per_100g, fiber_per_100g))
    return cursor.lastrowid


def import_recipes(recipes, dry_run=False):
    """Import parsed recipes into the database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    existing = set(
        row[0] for row in conn.execute("SELECT name FROM recipes").fetchall()
    )

    imported = 0
    skipped = 0
    errors = []

    for recipe in recipes:
        if recipe['name'] in existing:
            print(f"  SKIP (exists): {recipe['name']}")
            skipped += 1
            continue

        if not recipe['ingredients']:
            print(f"  SKIP (no ingredients): {recipe['name']}")
            errors.append(f"No ingredients parsed for: {recipe['name']}")
            continue

        if dry_run:
            print(f"  DRY RUN: {recipe['name']} ({len(recipe['ingredients'])} ingredients, {len(recipe['instructions'])} steps)")
            imported += 1
            continue

        try:
            ingredient_rows = []
            for idx, ing in enumerate(recipe['ingredients']):
                ing_id = get_or_create_ingredient(
                    conn, ing['name'],
                    ing['calories'], ing['protein'], ing['fiber'],
                    ing['amount_g']
                )
                ingredient_rows.append({
                    'ingredient_id': ing_id,
                    'amount': ing['amount_g'],
                    'unit': 'g',
                    'sort_order': idx,
                })

            instructions_json = json.dumps(recipe['instructions']) if recipe['instructions'] else '[]'
            cursor = conn.execute("""
                INSERT INTO recipes (name, instructions, meal_type, servings, phase,
                                    source_name)
                VALUES (?, ?, ?, 1, ?, '30-Day Meal Plan v3')
            """, (
                recipe['name'],
                instructions_json,
                recipe['meal_type'],
                recipe['phase'],
            ))
            recipe_id = cursor.lastrowid

            for ing_row in ingredient_rows:
                conn.execute("""
                    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order)
                    VALUES (?, ?, ?, ?, ?)
                """, (recipe_id, ing_row['ingredient_id'], ing_row['amount'],
                      ing_row['unit'], ing_row['sort_order']))

            conn.commit()
            existing.add(recipe['name'])
            imported += 1
            print(f"  OK: {recipe['name']} (id={recipe_id}, {len(ingredient_rows)} ingredients)")

        except Exception as e:
            conn.rollback()
            errors.append(f"{recipe['name']}: {e}")
            print(f"  ERROR: {recipe['name']}: {e}")

    conn.close()
    return imported, skipped, errors


def main():
    dry_run = '--dry-run' in sys.argv

    print("Extracting text from PDF...")
    text = extract_text()

    print("Parsing recipes...")
    recipes = parse_recipes(text)
    print(f"Found {len(recipes)} recipes\n")

    if len(recipes) == 0:
        print("ERROR: No recipes parsed. Check PDF format.")
        sys.exit(1)

    for r in recipes:
        ing_count = len(r['ingredients'])
        step_count = len(r['instructions'])
        flag = " !! NO INGREDIENTS" if ing_count == 0 else ""
        print(f"  Day {r['day']:2d} {r['meal_slot']:10s} {r['name'][:50]:50s} {ing_count:2d} ing, {step_count} steps{flag}")

    print(f"\n{'DRY RUN - ' if dry_run else ''}Importing into database...")
    imported, skipped, errors = import_recipes(recipes, dry_run=dry_run)

    print(f"\nDone! Imported: {imported}, Skipped: {skipped}, Errors: {len(errors)}")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"  - {e}")


if __name__ == '__main__':
    main()
