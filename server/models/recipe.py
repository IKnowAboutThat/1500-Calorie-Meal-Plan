"""Recipe model — CRUD with calculated macros from ingredients."""

import json
from db import get_connection


def _calculate_macros(ingredients_with_nutrition):
    """Calculate total macros from ingredient list with per-100g nutrition data."""
    totals = {'calories': 0, 'protein': 0, 'fat': 0, 'carbs': 0, 'fiber': 0}
    micronutrient_totals = {}

    for item in ingredients_with_nutrition:
        # amount is in the unit specified, but nutrition is per 100g
        # We assume amounts are in grams for calculation
        amount_g = item.get('amount', 0)
        factor = amount_g / 100.0

        totals['calories'] += (item.get('calories_per_100g', 0) or 0) * factor
        totals['protein'] += (item.get('protein_per_100g', 0) or 0) * factor
        totals['fat'] += (item.get('fat_per_100g', 0) or 0) * factor
        totals['carbs'] += (item.get('carbs_per_100g', 0) or 0) * factor
        totals['fiber'] += (item.get('fiber_per_100g', 0) or 0) * factor

        # Micronutrients
        micros = item.get('micronutrients')
        if isinstance(micros, str):
            try:
                micros = json.loads(micros)
            except (json.JSONDecodeError, TypeError):
                micros = {}
        if micros:
            for key, val in micros.items():
                micronutrient_totals[key] = micronutrient_totals.get(key, 0) + (val or 0) * factor

    # Round values
    for key in totals:
        totals[key] = round(totals[key], 1)
    for key in micronutrient_totals:
        micronutrient_totals[key] = round(micronutrient_totals[key], 2)

    totals['micronutrients'] = micronutrient_totals
    return totals


def _enrich_recipe(row, conn):
    """Add ingredients, macros, and tags to a recipe row dict."""
    recipe = dict(row)
    recipe_id = recipe['id']

    # Get ingredients with nutrition
    ing_rows = conn.execute("""
        SELECT ri.amount, ri.unit, ri.sort_order, ri.section,
               i.id as ingredient_id, i.name, i.calories_per_100g,
               i.protein_per_100g, i.fat_per_100g, i.carbs_per_100g,
               i.fiber_per_100g, i.micronutrients, i.category
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
        ORDER BY ri.sort_order
    """, (recipe_id,)).fetchall()

    ingredients = []
    for ir in ing_rows:
        ing = dict(ir)
        # Calculate per-ingredient macros
        factor = ing['amount'] / 100.0
        ing['calories'] = round((ing.get('calories_per_100g', 0) or 0) * factor, 1)
        ing['protein'] = round((ing.get('protein_per_100g', 0) or 0) * factor, 1)
        ing['fat'] = round((ing.get('fat_per_100g', 0) or 0) * factor, 1)
        ing['carbs'] = round((ing.get('carbs_per_100g', 0) or 0) * factor, 1)
        ing['fiber'] = round((ing.get('fiber_per_100g', 0) or 0) * factor, 1)
        ingredients.append(ing)

    recipe['ingredients'] = ingredients
    macros = _calculate_macros([dict(ir) for ir in ing_rows])
    recipe['calories'] = macros['calories']
    recipe['protein'] = macros['protein']
    recipe['fat'] = macros['fat']
    recipe['carbs'] = macros['carbs']
    recipe['fiber'] = macros['fiber']
    recipe['micronutrients'] = macros['micronutrients']

    # Per-serving macros
    servings = recipe.get('servings', 1) or 1
    if servings > 1:
        recipe['calories_per_serving'] = round(macros['calories'] / servings, 1)
        recipe['protein_per_serving'] = round(macros['protein'] / servings, 1)
        recipe['fat_per_serving'] = round(macros['fat'] / servings, 1)
        recipe['carbs_per_serving'] = round(macros['carbs'] / servings, 1)
        recipe['fiber_per_serving'] = round(macros['fiber'] / servings, 1)
    else:
        recipe['calories_per_serving'] = macros['calories']
        recipe['protein_per_serving'] = macros['protein']
        recipe['fat_per_serving'] = macros['fat']
        recipe['carbs_per_serving'] = macros['carbs']
        recipe['fiber_per_serving'] = macros['fiber']

    # Normalize instructions: ensure always a list
    raw_instructions = recipe.get('instructions')
    if raw_instructions:
        if isinstance(raw_instructions, str):
            try:
                parsed = json.loads(raw_instructions)
                recipe['instructions'] = parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, TypeError):
                recipe['instructions'] = []
        elif not isinstance(raw_instructions, list):
            recipe['instructions'] = []
    else:
        recipe['instructions'] = []

    # Normalize description: ensure always a string
    recipe['description'] = recipe.get('description') or ''

    # Get tags
    tag_rows = conn.execute("""
        SELECT rt.tag_id, rt.parent_tag_id, t.name as tag_name
        FROM recipe_tags rt
        JOIN tags t ON t.id = rt.tag_id
        WHERE rt.recipe_id = ?
    """, (recipe_id,)).fetchall()
    recipe['tags'] = [dict(tr) for tr in tag_rows]

    return recipe


def get_all_recipes():
    """Return all recipes with calculated macros."""
    conn = get_connection()
    rows = conn.execute("SELECT * FROM recipes ORDER BY name").fetchall()
    recipes = [_enrich_recipe(r, conn) for r in rows]
    conn.close()
    return recipes


def get_recipe(recipe_id):
    """Return a single recipe with full detail."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not row:
        conn.close()
        return None
    recipe = _enrich_recipe(row, conn)
    conn.close()
    return recipe


def create_recipe(data, ingredient_rows):
    """Create a recipe with ingredients and tags.

    Args:
        data: dict with recipe fields (name, description, etc.)
        ingredient_rows: list of dicts with ingredient_id, amount, unit, sort_order

    Returns:
        The created recipe dict with calculated macros.
    """
    conn = get_connection()

    cursor = conn.execute("""
        INSERT INTO recipes (name, description, instructions, notes, meal_type,
                            cuisine, main_protein, servings, phase,
                            prep_time_min, marinate_time_min, cook_time_min,
                            total_time_min, source_name, source_url, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get('name'),
        data.get('description'),
        data.get('instructions'),
        data.get('notes'),
        data.get('meal_type'),
        data.get('cuisine'),
        data.get('main_protein'),
        data.get('servings', 1),
        data.get('phase'),
        data.get('prep_time_min'),
        data.get('marinate_time_min'),
        data.get('cook_time_min'),
        data.get('total_time_min'),
        data.get('source_name'),
        data.get('source_url'),
        data.get('rating'),
    ))
    recipe_id = cursor.lastrowid

    # Insert recipe_ingredients
    for idx, ing in enumerate(ingredient_rows):
        conn.execute("""
            INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order, section)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (recipe_id, ing['ingredient_id'], ing['amount'], ing.get('unit', 'g'), ing.get('sort_order', idx), ing.get('section')))

    # Insert tags
    for tag in data.get('tags', []):
        tag_id = tag.get('tag_id') or tag.get('id')
        parent_tag_id = tag.get('parent_tag_id', 0)
        if tag_id:
            conn.execute(
                "INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, parent_tag_id) VALUES (?, ?, ?)",
                (recipe_id, tag_id, parent_tag_id)
            )

    conn.commit()

    # Return enriched recipe
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    recipe = _enrich_recipe(row, conn)
    conn.close()
    return recipe


def update_recipe(recipe_id, data, ingredient_rows=None):
    """Update recipe fields and optionally replace ingredients.

    Args:
        recipe_id: ID of the recipe to update.
        data: dict with recipe fields to update.
        ingredient_rows: optional list of dicts with ingredient_id, amount, unit,
                         sort_order, section. When provided, replaces all existing
                         recipe_ingredients rows.

    Returns:
        The updated recipe dict with calculated macros, or None if not found.
    """
    conn = get_connection()

    fields = []
    values = []
    updatable = ['name', 'description', 'instructions', 'notes', 'meal_type',
                 'cuisine', 'main_protein', 'servings', 'phase',
                 'prep_time_min', 'marinate_time_min', 'cook_time_min',
                 'total_time_min', 'source_name', 'source_url', 'rating']

    for field in updatable:
        if field in data:
            val = data[field]
            # Store instructions as JSON text if given as a list
            if field == 'instructions' and isinstance(val, list):
                val = json.dumps(val)
            fields.append(f"{field} = ?")
            values.append(val)

    if fields:
        values.append(recipe_id)
        conn.execute(f"UPDATE recipes SET {', '.join(fields)} WHERE id = ?", values)

    # Replace ingredients if provided
    if ingredient_rows is not None:
        conn.execute("DELETE FROM recipe_ingredients WHERE recipe_id = ?", (recipe_id,))
        for idx, ing in enumerate(ingredient_rows):
            conn.execute("""
                INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order, section)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (recipe_id, ing['ingredient_id'], ing['amount'],
                  ing.get('unit', 'g'), ing.get('sort_order', idx), ing.get('section')))

    conn.commit()

    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if not row:
        conn.close()
        return None
    recipe = _enrich_recipe(row, conn)
    conn.close()
    return recipe


def delete_recipe(recipe_id):
    """Delete a recipe (CASCADE handles recipe_ingredients and recipe_tags)."""
    conn = get_connection()
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    conn.close()
