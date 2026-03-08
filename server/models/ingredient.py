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
