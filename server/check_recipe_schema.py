#!/usr/bin/env python3
"""Validate that all recipes in recipes.js conform to a consistent schema.

Parses the JS export, defines expected fields/types, checks every recipe,
and prints a clear pass/fail report. Exits with code 1 if any recipe fails.
"""

import json
import os
import sys

from js_parser import js_to_json, extract_js_export

# ── Path to recipes.js ──────────────────────────────────────────────────────
RECIPES_JS = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "app", "js", "data", "recipes.js",
)

# ── Expected schema ─────────────────────────────────────────────────────────

# Recipe-level fields: (field_name, expected_type, required)
RECIPE_SCHEMA = [
    ("id",          str,   True),
    ("name",        str,   True),
    ("mealType",    str,   True),
    ("cuisine",     str,   True),
    ("mainProtein", str,   True),
    ("calories",    (int, float), True),
    ("protein",     (int, float), True),
    ("fiber",       (int, float), True),
    ("ingredients", list,  True),
    ("tags",        list,  True),
    ("dayOrigin",   (int, float), True),
    ("mealSlot",    str,   True),
    ("phase",       str,   True),
    ("servings",    (int, float), True),
]

# Ingredient-level fields: (field_name, expected_type, required)
INGREDIENT_SCHEMA = [
    ("name",     str,           True),
    ("amount",   (int, float),  True),
    ("unit",     str,           True),
    ("calories", (int, float),  True),
    ("protein",  (int, float),  True),
    ("fiber",    (int, float),  True),
]

# Allowed values for enum-like fields
VALID_MEAL_TYPES = {"meal", "snack"}
VALID_PHASES = {"standard", "luteal"}
VALID_MEAL_SLOTS = {"Meal 1", "Meal 2", "Meal 3", "Snack"}


# ── JS parsing ──────────────────────────────────────────────────────────────

def parse_recipes_js(filepath: str) -> list[dict]:
    """Extract the recipes array from recipes.js and parse into Python dicts."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        array_text = extract_js_export(content, "recipes", "[")
    except RuntimeError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    json_text = js_to_json(array_text)

    try:
        recipes = json.loads(json_text)
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse recipes array as JSON: {e}")
        lines = json_text.splitlines()
        start_line = max(0, e.lineno - 3)
        end_line = min(len(lines), e.lineno + 2)
        print(f"  Context (lines {start_line+1}-{end_line}):")
        for i in range(start_line, end_line):
            marker = " >>>" if i == e.lineno - 1 else "    "
            print(f"  {marker} {i+1}: {lines[i][:120]}")
        sys.exit(1)

    if not isinstance(recipes, list):
        print(f"ERROR: Parsed recipes is not a list, got {type(recipes).__name__}")
        sys.exit(1)

    return recipes


# ── Validation ──────────────────────────────────────────────────────────────

def validate_recipe(recipe: dict, index: int) -> list[str]:
    """Validate a single recipe against the schema. Returns list of error strings."""
    errors = []
    recipe_label = recipe.get("name", f"recipe[{index}]")

    # Check recipe-level fields
    for field, expected_type, required in RECIPE_SCHEMA:
        if field not in recipe:
            if required:
                errors.append(f"Missing required field '{field}'")
            continue
        value = recipe[field]
        if not isinstance(value, expected_type):
            errors.append(
                f"Field '{field}' has type {type(value).__name__}, "
                f"expected {expected_type}"
            )

    # Check for unexpected top-level fields
    known_fields = {f[0] for f in RECIPE_SCHEMA}
    for key in recipe:
        if key not in known_fields:
            errors.append(f"Unexpected field '{key}'")

    # Validate enum-like fields
    meal_type = recipe.get("mealType")
    if meal_type and meal_type not in VALID_MEAL_TYPES:
        errors.append(f"Invalid mealType '{meal_type}', expected one of {VALID_MEAL_TYPES}")

    phase = recipe.get("phase")
    if phase and phase not in VALID_PHASES:
        errors.append(f"Invalid phase '{phase}', expected one of {VALID_PHASES}")

    meal_slot = recipe.get("mealSlot")
    if meal_slot and meal_slot not in VALID_MEAL_SLOTS:
        errors.append(f"Invalid mealSlot '{meal_slot}', expected one of {VALID_MEAL_SLOTS}")

    # Validate numeric ranges
    if isinstance(recipe.get("calories"), (int, float)) and recipe["calories"] < 0:
        errors.append(f"calories is negative: {recipe['calories']}")
    if isinstance(recipe.get("protein"), (int, float)) and recipe["protein"] < 0:
        errors.append(f"protein is negative: {recipe['protein']}")
    if isinstance(recipe.get("fiber"), (int, float)) and recipe["fiber"] < 0:
        errors.append(f"fiber is negative: {recipe['fiber']}")
    if isinstance(recipe.get("servings"), (int, float)) and recipe["servings"] < 1:
        errors.append(f"servings is less than 1: {recipe['servings']}")
    if isinstance(recipe.get("dayOrigin"), (int, float)):
        if recipe["dayOrigin"] < 1 or recipe["dayOrigin"] > 31:
            errors.append(f"dayOrigin out of range: {recipe['dayOrigin']}")

    # Validate tags array
    tags = recipe.get("tags", [])
    if isinstance(tags, list):
        for i, tag in enumerate(tags):
            if not isinstance(tag, str):
                errors.append(f"tags[{i}] is {type(tag).__name__}, expected str")

    # Validate ingredients
    ingredients = recipe.get("ingredients", [])
    if isinstance(ingredients, list):
        if len(ingredients) == 0:
            errors.append("ingredients array is empty")

        for i, ing in enumerate(ingredients):
            ing_errors = validate_ingredient(ing, i)
            for err in ing_errors:
                errors.append(f"ingredients[{i}] ({ing.get('name', '?')}): {err}")
    else:
        errors.append(f"ingredients is not a list: {type(ingredients).__name__}")

    return errors


def validate_ingredient(ing: dict, index: int) -> list[str]:
    """Validate a single ingredient against the schema. Returns list of error strings."""
    errors = []

    for field, expected_type, required in INGREDIENT_SCHEMA:
        if field not in ing:
            if required:
                errors.append(f"Missing required field '{field}'")
            continue
        value = ing[field]
        if not isinstance(value, expected_type):
            errors.append(
                f"Field '{field}' has type {type(value).__name__}, "
                f"expected {expected_type}"
            )

    # Check for unexpected fields
    known_fields = {f[0] for f in INGREDIENT_SCHEMA}
    for key in ing:
        if key not in known_fields:
            errors.append(f"Unexpected field '{key}'")

    # Validate numeric ranges
    if isinstance(ing.get("amount"), (int, float)) and ing["amount"] <= 0:
        errors.append(f"amount must be positive, got {ing['amount']}")
    if isinstance(ing.get("calories"), (int, float)) and ing["calories"] < 0:
        errors.append(f"calories is negative: {ing['calories']}")
    if isinstance(ing.get("protein"), (int, float)) and ing["protein"] < 0:
        errors.append(f"protein is negative: {ing['protein']}")
    if isinstance(ing.get("fiber"), (int, float)) and ing["fiber"] < 0:
        errors.append(f"fiber is negative: {ing['fiber']}")

    # Validate unit
    unit = ing.get("unit")
    if unit and unit != "g":
        errors.append(f"unit is '{unit}', expected 'g' (only grams supported)")

    # Validate name is non-empty
    name = ing.get("name")
    if isinstance(name, str) and not name.strip():
        errors.append("name is empty string")

    return errors


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(RECIPES_JS):
        print(f"ERROR: recipes.js not found at {RECIPES_JS}")
        sys.exit(1)

    print(f"Reading recipes from: {RECIPES_JS}")
    recipes = parse_recipes_js(RECIPES_JS)
    print(f"Parsed {len(recipes)} recipes.\n")

    if len(recipes) == 0:
        print("ERROR: No recipes found in file.")
        sys.exit(1)

    passed = 0
    failed = 0
    all_errors: dict[str, list[str]] = {}

    for i, recipe in enumerate(recipes):
        recipe_name = recipe.get("name", f"recipe[{i}]")
        errors = validate_recipe(recipe, i)
        if errors:
            failed += 1
            all_errors[recipe_name] = errors
        else:
            passed += 1

    # ── Report ──
    print("=" * 70)
    print("SCHEMA VALIDATION REPORT")
    print("=" * 70)

    if all_errors:
        print(f"\nFAILED RECIPES ({failed}):\n")
        for recipe_name, errors in all_errors.items():
            print(f"  ✗ {recipe_name}")
            for err in errors:
                print(f"      - {err}")
            print()
    else:
        print("\nNo failures found.\n")

    print(f"PASSED: {passed}")
    print(f"FAILED: {failed}")
    print(f"TOTAL:  {len(recipes)}")

    if failed > 0:
        print(f"\nResult: FAIL — {failed} recipe(s) have schema violations.")
        sys.exit(1)
    else:
        print("\nResult: PASS — All recipes conform to the schema.")
        sys.exit(0)


if __name__ == "__main__":
    main()
