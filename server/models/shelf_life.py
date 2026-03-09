"""Shelf life model — ingredient state/storage duration data."""

from db import get_connection


def get_shelf_life(ingredient_id):
    """Return all shelf life entries for an ingredient."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT sl.*, i.name as ingredient_name
        FROM ingredient_shelf_life sl
        JOIN ingredients i ON i.id = sl.ingredient_id
        WHERE sl.ingredient_id = ?
        ORDER BY sl.state, sl.storage_type
    """, (ingredient_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_shelf_life_days(ingredient_id, state='raw', storage_type='fridge'):
    """Return the shelf life in days for a specific state/storage combo, or None."""
    conn = get_connection()
    row = conn.execute("""
        SELECT shelf_life_days FROM ingredient_shelf_life
        WHERE ingredient_id = ? AND state = ? AND storage_type = ?
    """, (ingredient_id, state, storage_type)).fetchone()
    conn.close()
    return row['shelf_life_days'] if row else None


def set_shelf_life(ingredient_id, state, storage_type, days):
    """Upsert a shelf life entry."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO ingredient_shelf_life (ingredient_id, state, storage_type, shelf_life_days)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ingredient_id, state, storage_type)
        DO UPDATE SET shelf_life_days = excluded.shelf_life_days
    """, (ingredient_id, state, storage_type, days))
    conn.commit()
    conn.close()


def delete_shelf_life(shelf_life_id):
    """Delete a shelf life entry."""
    conn = get_connection()
    conn.execute("DELETE FROM ingredient_shelf_life WHERE id = ?", (shelf_life_id,))
    conn.commit()
    conn.close()


def get_all_shelf_life():
    """Return all shelf life data with ingredient names."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT sl.*, i.name as ingredient_name
        FROM ingredient_shelf_life sl
        JOIN ingredients i ON i.id = sl.ingredient_id
        ORDER BY i.name, sl.state
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]
