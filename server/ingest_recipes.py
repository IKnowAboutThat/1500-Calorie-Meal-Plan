#!/usr/bin/env python3
"""Migrate all recipes from recipes.js into the SQLite database.

For each recipe:
1. Check if recipe already exists (by name). Skip if exists.
2. Create recipe record.
3. For each ingredient:
   3.1 Check if ingredient already exists (by name, case-insensitive).
   3.2 If not, create it with per-100g nutritional data derived from the
       per-amount data in recipes.js.
   3.3 Create recipe_ingredients junction row.

Idempotent: safe to run multiple times. Errors loudly on any problem.
"""

import json
import os
import sys

# Ensure server/ is on the path so we can import db, config
sys.path.insert(0, os.path.dirname(__file__))

from db import get_connection, init_db  # noqa: E402
from js_parser import js_to_json, extract_js_export  # noqa: E402

# ── Path to recipes.js ──────────────────────────────────────────────────────
RECIPES_JS = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "app", "js", "data", "recipes.js",
)


# ── JS parsing (same approach as check_recipe_schema.py) ────────────────────

def parse_recipes_js(filepath: str) -> list[dict]:
    """Extract the recipes array from recipes.js and parse into Python dicts."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    array_text = extract_js_export(content, "recipes", "[")
    json_text = js_to_json(array_text)

    try:
        recipes = json.loads(json_text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse recipes array as JSON: {e}") from e

    return recipes


def parse_ingredient_categories(filepath: str) -> dict[str, str]:
    """Extract ingredientCategories map from recipes.js.

    Returns {lowercase_ingredient_name: category_string}.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        obj_text = extract_js_export(content, "ingredientCategories", "{")
    except RuntimeError:
        print("WARNING: Could not find ingredientCategories export. Skipping categories.")
        return {}

    json_text = js_to_json(obj_text)

    try:
        categories = json.loads(json_text)
    except json.JSONDecodeError as e:
        print(f"WARNING: Could not parse ingredientCategories: {e}")
        return {}

    # Normalize keys to lowercase
    return {k.lower(): v for k, v in categories.items()}


# ── Nutrition conversion ────────────────────────────────────────────────────

def to_per_100g(value_for_amount: float, amount_g: float) -> float | None:
    """Convert a nutritional value for a given amount (in grams) to per-100g.

    Formula: per_100g = (value / amount_g) * 100

    Returns None if amount_g is zero or negative (should not happen with valid data).
    """
    if amount_g <= 0:
        return None
    return round((value_for_amount / amount_g) * 100, 4)


# ── Database operations ─────────────────────────────────────────────────────

def get_or_create_ingredient(
    conn,
    name: str,
    calories_for_amount: float,
    protein_for_amount: float,
    fiber_for_amount: float,
    amount_g: float,
    category: str | None,
) -> int:
    """Get existing ingredient ID or create new one. Returns ingredient ID.

    If the ingredient already exists, we check that its per-100g values are
    reasonably consistent with the new data and warn if not.
    """
    name_lower = name.lower().strip()

    # Check existing (case-insensitive)
    row = conn.execute(
        "SELECT id, calories_per_100g, protein_per_100g, fiber_per_100g FROM ingredients WHERE LOWER(name) = ?",
        (name_lower,),
    ).fetchone()

    cal_per_100 = to_per_100g(calories_for_amount, amount_g)
    pro_per_100 = to_per_100g(protein_for_amount, amount_g)
    fib_per_100 = to_per_100g(fiber_for_amount, amount_g)

    if row:
        # Ingredient exists — check consistency
        existing_id = row["id"]
        existing_cal = row["calories_per_100g"]
        existing_pro = row["protein_per_100g"]
        existing_fib = row["fiber_per_100g"]

        # Warn on significant differences (> 5% relative or > 2 absolute)
        for label, existing_val, new_val in [
            ("calories_per_100g", existing_cal, cal_per_100),
            ("protein_per_100g", existing_pro, pro_per_100),
            ("fiber_per_100g", existing_fib, fib_per_100),
        ]:
            if existing_val is None or new_val is None:
                continue
            abs_diff = abs(existing_val - new_val)
            ref = max(abs(existing_val), abs(new_val), 0.01)
            pct_diff = (abs_diff / ref) * 100
            if abs_diff > 2 and pct_diff > 5:
                print(
                    f"  WARNING: Ingredient '{name}' has inconsistent {label}: "
                    f"existing={existing_val:.2f}, new={new_val:.2f} "
                    f"(diff={abs_diff:.2f}, {pct_diff:.1f}%)"
                )

        return existing_id

    # Create new ingredient
    cursor = conn.execute(
        """INSERT INTO ingredients (name, calories_per_100g, protein_per_100g,
           fat_per_100g, carbs_per_100g, fiber_per_100g, category)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            name.strip(),
            cal_per_100,
            pro_per_100,
            None,  # fat — not available in recipes.js
            None,  # carbs — not available in recipes.js
            fib_per_100,
            category,
        ),
    )
    return cursor.lastrowid


def recipe_exists(conn, name: str) -> bool:
    """Check if a recipe with this name already exists."""
    row = conn.execute("SELECT id FROM recipes WHERE name = ?", (name,)).fetchone()
    return row is not None


def insert_recipe(conn, recipe: dict) -> int:
    """Insert a recipe record and return its ID."""
    cursor = conn.execute(
        """INSERT INTO recipes (name, meal_type, cuisine, main_protein, servings, phase)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            recipe["name"],
            recipe.get("mealType"),
            recipe.get("cuisine"),
            recipe.get("mainProtein"),
            recipe.get("servings", 1),
            recipe.get("phase"),
        ),
    )
    return cursor.lastrowid


def insert_recipe_ingredient(
    conn, recipe_id: int, ingredient_id: int, amount: float, unit: str, sort_order: int
):
    """Insert a recipe_ingredients junction row."""
    conn.execute(
        """INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order)
           VALUES (?, ?, ?, ?, ?)""",
        (recipe_id, ingredient_id, amount, unit, sort_order),
    )


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(RECIPES_JS):
        print(f"ERROR: recipes.js not found at {RECIPES_JS}")
        sys.exit(1)

    print(f"Reading recipes from: {RECIPES_JS}")
    recipes = parse_recipes_js(RECIPES_JS)
    print(f"Parsed {len(recipes)} recipes.")

    if len(recipes) == 0:
        print("ERROR: No recipes found in file.")
        sys.exit(1)

    # Parse ingredient categories for category field
    categories = parse_ingredient_categories(RECIPES_JS)
    print(f"Loaded {len(categories)} ingredient category mappings.")

    # Initialize DB schema
    print("Initializing database...")
    init_db()

    conn = get_connection()

    created_count = 0
    skipped_count = 0
    ingredient_created_count = 0
    junction_created_count = 0
    errors = []

    try:
        for i, recipe in enumerate(recipes):
            recipe_name = recipe.get("name")
            if not recipe_name:
                errors.append(f"Recipe at index {i} has no 'name' field.")
                continue

            # Check if recipe already exists
            if recipe_exists(conn, recipe_name):
                skipped_count += 1
                print(f"  SKIP: '{recipe_name}' (already exists)")
                continue

            # Validate recipe has ingredients
            ingredients = recipe.get("ingredients")
            if not ingredients or not isinstance(ingredients, list):
                errors.append(f"Recipe '{recipe_name}' has no valid ingredients array.")
                continue

            # Insert recipe
            try:
                recipe_id = insert_recipe(conn, recipe)
            except Exception as e:
                errors.append(f"Failed to insert recipe '{recipe_name}': {e}")
                conn.rollback()
                continue

            print(f"  CREATE: '{recipe_name}' (id={recipe_id})")
            created_count += 1

            # Process ingredients
            for sort_order, ing in enumerate(ingredients):
                ing_name = ing.get("name")
                if not ing_name:
                    errors.append(
                        f"Recipe '{recipe_name}', ingredient[{sort_order}] has no name."
                    )
                    continue

                amount = ing.get("amount", 0)
                unit = ing.get("unit", "g")
                cal = ing.get("calories", 0)
                pro = ing.get("protein", 0)
                fib = ing.get("fiber", 0)

                if amount <= 0:
                    errors.append(
                        f"Recipe '{recipe_name}', ingredient '{ing_name}' has "
                        f"non-positive amount: {amount}"
                    )
                    continue

                # Look up category
                category = categories.get(ing_name.lower().strip())

                try:
                    ing_id = get_or_create_ingredient(
                        conn, ing_name, cal, pro, fib, amount, category
                    )
                except Exception as e:
                    errors.append(
                        f"Failed to create/get ingredient '{ing_name}' "
                        f"for recipe '{recipe_name}': {e}"
                    )
                    conn.rollback()
                    continue

                # Track if this was a new ingredient (check if we just created it
                # by looking at the rowcount isn't reliable, so we check before)
                # We'll count via the get_or_create function output
                try:
                    insert_recipe_ingredient(
                        conn, recipe_id, ing_id, amount, unit, sort_order
                    )
                    junction_created_count += 1
                except Exception as e:
                    errors.append(
                        f"Failed to link ingredient '{ing_name}' to recipe "
                        f"'{recipe_name}': {e}"
                    )
                    conn.rollback()
                    continue

        # Commit all changes
        conn.commit()

    except Exception as e:
        conn.rollback()
        print(f"\nFATAL ERROR: {e}")
        conn.close()
        sys.exit(1)

    # Count total ingredients in DB
    total_ingredients = conn.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]

    conn.close()

    # ── Report ──
    print("\n" + "=" * 70)
    print("INGESTION REPORT")
    print("=" * 70)
    print(f"Recipes created:           {created_count}")
    print(f"Recipes skipped (exist):   {skipped_count}")
    print(f"Total recipes in source:   {len(recipes)}")
    print(f"Recipe-ingredient links:   {junction_created_count}")
    print(f"Total ingredients in DB:   {total_ingredients}")

    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")
        print(f"\nResult: COMPLETED WITH {len(errors)} ERROR(S)")
        sys.exit(1)
    else:
        print("\nResult: SUCCESS — All recipes ingested cleanly.")
        sys.exit(0)


if __name__ == "__main__":
    main()
