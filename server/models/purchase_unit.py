"""Purchase unit model — tracks how ingredients are sold at stores."""

from db import get_connection


def get_purchase_units(ingredient_id):
    """Return all purchase unit options for an ingredient, preferred first."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT pu.*, i.name as ingredient_name
        FROM purchase_units pu
        JOIN ingredients i ON i.id = pu.ingredient_id
        WHERE pu.ingredient_id = ?
        ORDER BY pu.is_preferred DESC, pu.id ASC
    """, (ingredient_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_purchase_units():
    """Return all purchase units grouped by ingredient."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT pu.*, i.name as ingredient_name
        FROM purchase_units pu
        JOIN ingredients i ON i.id = pu.ingredient_id
        ORDER BY i.name, pu.is_preferred DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_purchase_unit(data):
    """Create a new purchase unit option for an ingredient."""
    conn = get_connection()
    cursor = conn.execute("""
        INSERT INTO purchase_units (ingredient_id, label, unit_type,
                                    package_quantity, package_weight_g,
                                    piece_weight_g, is_preferred)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data['ingredient_id'],
        data['label'],
        data['unit_type'],
        data['package_quantity'],
        data.get('package_weight_g'),
        data.get('piece_weight_g'),
        data.get('is_preferred', 0),
    ))
    conn.commit()
    pu_id = cursor.lastrowid
    row = conn.execute("SELECT * FROM purchase_units WHERE id = ?", (pu_id,)).fetchone()
    conn.close()
    return dict(row)


def update_purchase_unit(pu_id, data):
    """Update a purchase unit."""
    conn = get_connection()
    fields = []
    values = []
    updatable = ['label', 'unit_type', 'package_quantity',
                 'package_weight_g', 'piece_weight_g', 'is_preferred']
    for field in updatable:
        if field in data:
            fields.append(f"{field} = ?")
            values.append(data[field])
    if fields:
        values.append(pu_id)
        conn.execute(
            f"UPDATE purchase_units SET {', '.join(fields)} WHERE id = ?",
            values
        )
        conn.commit()
    row = conn.execute("SELECT * FROM purchase_units WHERE id = ?", (pu_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_purchase_unit(pu_id):
    """Delete a purchase unit."""
    conn = get_connection()
    conn.execute("DELETE FROM purchase_units WHERE id = ?", (pu_id,))
    conn.commit()
    conn.close()


def set_preferred(ingredient_id, pu_id):
    """Set one purchase unit as preferred, clearing others for the same ingredient."""
    conn = get_connection()
    conn.execute(
        "UPDATE purchase_units SET is_preferred = 0 WHERE ingredient_id = ?",
        (ingredient_id,)
    )
    conn.execute(
        "UPDATE purchase_units SET is_preferred = 1 WHERE id = ? AND ingredient_id = ?",
        (pu_id, ingredient_id)
    )
    conn.commit()
    conn.close()


def record_purchase(data):
    """Record a purchase in history and update preferred unit."""
    conn = get_connection()
    conn.execute("""
        INSERT INTO purchase_history (ingredient_id, purchase_unit_id,
                                      custom_label, custom_quantity,
                                      custom_unit, date_purchased, store_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data['ingredient_id'],
        data.get('purchase_unit_id'),
        data.get('custom_label'),
        data.get('custom_quantity'),
        data.get('custom_unit'),
        data.get('date_purchased'),
        data.get('store_name'),
    ))
    conn.commit()
    conn.close()

    if data.get('purchase_unit_id'):
        _update_preferred_from_history(data['ingredient_id'])


def _update_preferred_from_history(ingredient_id):
    """Set the most frequently purchased unit as preferred."""
    conn = get_connection()
    row = conn.execute("""
        SELECT purchase_unit_id, COUNT(*) as cnt
        FROM purchase_history
        WHERE ingredient_id = ? AND purchase_unit_id IS NOT NULL
        GROUP BY purchase_unit_id
        ORDER BY cnt DESC, MAX(date_purchased) DESC
        LIMIT 1
    """, (ingredient_id,)).fetchone()
    if row and row['purchase_unit_id']:
        conn.execute(
            "UPDATE purchase_units SET is_preferred = 0 WHERE ingredient_id = ?",
            (ingredient_id,)
        )
        conn.execute(
            "UPDATE purchase_units SET is_preferred = 1 WHERE id = ?",
            (row['purchase_unit_id'],)
        )
        conn.commit()
    conn.close()
