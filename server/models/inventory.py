"""Inventory model — tracks ingredients currently in the house."""

from db import get_connection


def get_all_inventory():
    """Return all inventory items with ingredient names."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT inv.*, i.name as ingredient_name, i.category
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        ORDER BY inv.expiry_date ASC NULLS LAST, i.name
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_inventory_item(item_id):
    """Return a single inventory item."""
    conn = get_connection()
    row = conn.execute("""
        SELECT inv.*, i.name as ingredient_name, i.category
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        WHERE inv.id = ?
    """, (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def add_inventory_item(data):
    """Add a new inventory item. Returns the created item dict."""
    conn = get_connection()
    cursor = conn.execute("""
        INSERT INTO inventory (ingredient_id, quantity, unit, state, storage_type,
                              date_acquired, expiry_date, purchase_unit_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data['ingredient_id'],
        data['quantity'],
        data.get('unit', 'g'),
        data.get('state', 'raw'),
        data.get('storage_type', 'fridge'),
        data.get('date_acquired') or __import__('datetime').date.today().isoformat(),
        data.get('expiry_date'),
        data.get('purchase_unit_id'),
    ))
    conn.commit()
    item_id = cursor.lastrowid
    row = conn.execute("""
        SELECT inv.*, i.name as ingredient_name, i.category
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        WHERE inv.id = ?
    """, (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_inventory_item(item_id, data):
    """Update an inventory item. Returns the updated item or None."""
    conn = get_connection()
    fields = []
    values = []
    updatable = ['quantity', 'unit', 'state', 'storage_type',
                 'expiry_date', 'purchase_unit_id']
    for field in updatable:
        if field in data:
            fields.append(f"{field} = ?")
            values.append(data[field])

    if fields:
        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(item_id)
        conn.execute(
            f"UPDATE inventory SET {', '.join(fields)} WHERE id = ?",
            values
        )
        conn.commit()

    row = conn.execute("""
        SELECT inv.*, i.name as ingredient_name, i.category
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        WHERE inv.id = ?
    """, (item_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_inventory_item(item_id):
    """Delete an inventory item."""
    conn = get_connection()
    conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


def deduct_recipe_ingredients(recipe_id):
    """Deduct ingredients for a recipe from inventory.

    For each ingredient in the recipe, finds the oldest matching inventory
    item (FIFO by expiry_date) and subtracts the recipe amount. Removes
    items that reach zero. Returns a list of deductions made.
    """
    conn = get_connection()

    recipe_ings = conn.execute("""
        SELECT ri.ingredient_id, ri.amount, ri.unit, i.name as ingredient_name
        FROM recipe_ingredients ri
        JOIN ingredients i ON i.id = ri.ingredient_id
        WHERE ri.recipe_id = ?
    """, (recipe_id,)).fetchall()

    deductions = []

    for ring in recipe_ings:
        amount_needed = ring['amount']
        ingredient_id = ring['ingredient_id']

        inv_items = conn.execute("""
            SELECT id, quantity, unit FROM inventory
            WHERE ingredient_id = ?
            ORDER BY expiry_date ASC NULLS LAST, date_acquired ASC
        """, (ingredient_id,)).fetchall()

        amount_deducted = 0
        for inv in inv_items:
            if amount_needed <= 0:
                break
            available = inv['quantity']
            take = min(available, amount_needed)
            remaining = available - take
            amount_needed -= take
            amount_deducted += take

            if remaining <= 0:
                conn.execute("DELETE FROM inventory WHERE id = ?", (inv['id'],))
            else:
                conn.execute(
                    "UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (remaining, inv['id'])
                )

        deductions.append({
            'ingredient_name': ring['ingredient_name'],
            'amount_deducted': round(amount_deducted, 1),
            'unit': ring['unit'],
        })

    conn.commit()
    conn.close()
    return deductions


def get_inventory_by_ingredient(ingredient_id):
    """Get all inventory items for a specific ingredient."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT inv.*, i.name as ingredient_name, i.category
        FROM inventory inv
        JOIN ingredients i ON i.id = inv.ingredient_id
        WHERE inv.ingredient_id = ?
        ORDER BY inv.expiry_date ASC NULLS LAST
    """, (ingredient_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
