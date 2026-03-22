"""Ingredient model — queries for canonical ingredients."""

from db import get_connection


def get_all_ingredients():
    """Return all ingredients ordered by name."""
    conn = get_connection()
    rows = conn.execute("SELECT * FROM ingredients ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_ingredient(ingredient_id):
    """Return a single ingredient by ID."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM ingredients WHERE id = ?", (ingredient_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def search_ingredients(query):
    """Search ingredients by name (case-insensitive, partial match). Limit 20."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM ingredients WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 20",
        (f"%{query.lower()}%",)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_ingredient(data):
    """Create a custom ingredient with user-provided nutrition values.

    Returns the created ingredient row as a dict.
    """
    conn = get_connection()

    # Check for existing ingredient with same name (case-insensitive)
    existing = conn.execute(
        "SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)",
        (data['name'],)
    ).fetchone()
    if existing:
        conn.close()
        return dict(existing)

    conn.execute("""
        INSERT INTO ingredients (name, usda_fdc_id, calories_per_100g, protein_per_100g,
                                 fat_per_100g, carbs_per_100g, fiber_per_100g,
                                 micronutrients, category)
        VALUES (?, NULL, ?, ?, ?, ?, ?, '{}', ?)
    """, (
        data['name'],
        data.get('calories_per_100g', 0),
        data.get('protein_per_100g', 0),
        data.get('fat_per_100g', 0),
        data.get('carbs_per_100g', 0),
        data.get('fiber_per_100g', 0),
        data.get('category', 'other'),
    ))
    conn.commit()

    row = conn.execute(
        "SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)",
        (data['name'],)
    ).fetchone()
    conn.close()
    return dict(row)
