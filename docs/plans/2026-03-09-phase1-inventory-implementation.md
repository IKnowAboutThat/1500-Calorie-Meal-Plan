# Phase 1: Purchase Units + Inventory + Auto-Deduct Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add grocery purchase unit tracking, a real-time ingredient inventory, and automatic inventory deduction when recipes are marked as cooked.

**Architecture:** Four new database tables (purchase_units, ingredient_shelf_life, inventory, purchase_history) with corresponding Flask models, routes, and API endpoints. Frontend gets an upgraded Pantry page (now "Inventory Dashboard"), shopping list purchase-unit selection on check-off, and auto-deduct toast on the meal planner cooked button.

**Tech Stack:** SQLite (existing), Flask blueprints (existing pattern), vanilla JS ES modules (existing pattern), localStorage for UI state (existing pattern).

---

### Task 1: Add new database tables to schema

**Files:**
- Modify: `server/db.py:7-84` (SCHEMA_SQL string)

**Step 1: Write the new table definitions**

Add these tables to the end of `SCHEMA_SQL` (before the closing `"""`), after the `recipe_tags` table:

```sql
-- How ingredients are sold at the store (multiple options per ingredient)
CREATE TABLE IF NOT EXISTS purchase_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    package_quantity REAL NOT NULL,
    package_weight_g REAL,
    piece_weight_g REAL,
    is_preferred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Shelf life per ingredient state and storage type
CREATE TABLE IF NOT EXISTS ingredient_shelf_life (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    shelf_life_days INTEGER NOT NULL,
    UNIQUE(ingredient_id, state, storage_type)
);

-- Current ingredient inventory (what's in the house)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'g',
    state TEXT NOT NULL DEFAULT 'raw',
    storage_type TEXT NOT NULL DEFAULT 'fridge',
    date_acquired DATE NOT NULL DEFAULT (date('now')),
    expiry_date DATE,
    purchase_unit_id INTEGER REFERENCES purchase_units(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Purchase history for learning preferred purchase units
CREATE TABLE IF NOT EXISTS purchase_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    purchase_unit_id INTEGER REFERENCES purchase_units(id) ON DELETE SET NULL,
    custom_label TEXT,
    custom_quantity REAL,
    custom_unit TEXT,
    date_purchased DATE NOT NULL DEFAULT (date('now')),
    store_name TEXT
);
```

**Step 2: Verify the server starts without errors**

Run: `cd server && python -c "from db import init_db; init_db(); print('OK')"`
Expected: `OK` (tables created, no errors)

**Step 3: Commit**

```bash
git add server/db.py
git commit -m "feat: add purchase_units, ingredient_shelf_life, inventory, and purchase_history tables"
```

---

### Task 2: Create inventory model (CRUD)

**Files:**
- Create: `server/models/inventory.py`

**Step 1: Write the inventory model**

Follow the same pattern as `server/models/meal_plan.py` — import `get_connection` from `db`, write pure functions that open/close connections.

```python
"""Inventory model — tracks ingredients currently in the house."""

import json
from db import get_connection


def _row_to_dict(row):
    """Convert a sqlite3.Row to a dict with ingredient name included."""
    if not row:
        return None
    return dict(row)


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
    return _row_to_dict(row)


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
        data.get('date_acquired'),
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
    return _row_to_dict(row)


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
    return _row_to_dict(row)


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

    # Get recipe ingredients with amounts
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

        # Find inventory items for this ingredient, oldest expiry first
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
```

**Step 2: Verify the model imports cleanly**

Run: `cd server && python -c "from models.inventory import get_all_inventory; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server/models/inventory.py
git commit -m "feat: add inventory model with CRUD and recipe deduction"
```

---

### Task 3: Create purchase_units model

**Files:**
- Create: `server/models/purchase_unit.py`

**Step 1: Write the purchase_units model**

```python
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

    # Update preferred based on most frequently purchased
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
```

**Step 2: Verify import**

Run: `cd server && python -c "from models.purchase_unit import get_all_purchase_units; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server/models/purchase_unit.py
git commit -m "feat: add purchase_unit model with preference learning from history"
```

---

### Task 4: Create shelf_life model

**Files:**
- Create: `server/models/shelf_life.py`

**Step 1: Write the shelf_life model**

```python
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
```

**Step 2: Verify import**

Run: `cd server && python -c "from models.shelf_life import get_all_shelf_life; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add server/models/shelf_life.py
git commit -m "feat: add shelf_life model for ingredient state/storage durations"
```

---

### Task 5: Create inventory API routes

**Files:**
- Create: `server/routes/inventory.py`
- Modify: `server/app.py:35-43` (register_blueprints)

**Step 1: Write the inventory routes**

Follow the pattern from `server/routes/meal_plans.py`:

```python
"""API routes for ingredient inventory management."""

from flask import Blueprint, request, jsonify
from models.inventory import (
    get_all_inventory, get_inventory_item, add_inventory_item,
    update_inventory_item, delete_inventory_item, deduct_recipe_ingredients,
)

inventory_bp = Blueprint("inventory", __name__)


@inventory_bp.route("", methods=["GET"])
def list_inventory():
    """Return all inventory items."""
    return jsonify(get_all_inventory())


@inventory_bp.route("/<int:item_id>", methods=["GET"])
def get_item(item_id):
    """Return a single inventory item."""
    item = get_inventory_item(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item)


@inventory_bp.route("", methods=["POST"])
def create_item():
    """Add an item to inventory."""
    data = request.get_json(force=True)
    if not data.get("ingredient_id") or not data.get("quantity"):
        return jsonify({"error": "ingredient_id and quantity required"}), 400
    item = add_inventory_item(data)
    return jsonify(item), 201


@inventory_bp.route("/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    """Update an inventory item."""
    data = request.get_json(force=True)
    item = update_inventory_item(item_id, data)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item)


@inventory_bp.route("/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    """Delete an inventory item."""
    delete_inventory_item(item_id)
    return jsonify({"ok": True})


@inventory_bp.route("/deduct-recipe/<int:recipe_id>", methods=["POST"])
def deduct_recipe(recipe_id):
    """Deduct ingredients for a cooked recipe from inventory (FIFO by expiry)."""
    deductions = deduct_recipe_ingredients(recipe_id)
    return jsonify({"deductions": deductions})
```

**Step 2: Register the blueprint in app.py**

In `server/app.py`, inside `register_blueprints()` (line 35-43), add:

```python
from routes.inventory import inventory_bp
app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
```

**Step 3: Verify server starts**

Run: `cd server && python -c "from app import app; print('Routes:', [r.rule for r in app.url_map.iter_rules() if 'inventory' in r.rule])"`
Expected: Shows inventory routes

**Step 4: Commit**

```bash
git add server/routes/inventory.py server/app.py
git commit -m "feat: add inventory API routes with recipe deduction endpoint"
```

---

### Task 6: Create purchase_units API routes

**Files:**
- Create: `server/routes/purchase_units.py`
- Modify: `server/app.py:35-43` (register_blueprints)

**Step 1: Write the purchase_units routes**

```python
"""API routes for purchase unit management."""

from flask import Blueprint, request, jsonify
from models.purchase_unit import (
    get_purchase_units, get_all_purchase_units, create_purchase_unit,
    update_purchase_unit, delete_purchase_unit, set_preferred, record_purchase,
)

purchase_units_bp = Blueprint("purchase_units", __name__)


@purchase_units_bp.route("", methods=["GET"])
def list_all():
    """Return all purchase units (optionally filter by ingredient_id)."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    if ingredient_id:
        return jsonify(get_purchase_units(ingredient_id))
    return jsonify(get_all_purchase_units())


@purchase_units_bp.route("", methods=["POST"])
def create():
    """Create a new purchase unit."""
    data = request.get_json(force=True)
    required = ["ingredient_id", "label", "unit_type", "package_quantity"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"{field} is required"}), 400
    pu = create_purchase_unit(data)
    return jsonify(pu), 201


@purchase_units_bp.route("/<int:pu_id>", methods=["PUT"])
def update(pu_id):
    """Update a purchase unit."""
    data = request.get_json(force=True)
    pu = update_purchase_unit(pu_id, data)
    if not pu:
        return jsonify({"error": "Purchase unit not found"}), 404
    return jsonify(pu)


@purchase_units_bp.route("/<int:pu_id>", methods=["DELETE"])
def delete(pu_id):
    """Delete a purchase unit."""
    delete_purchase_unit(pu_id)
    return jsonify({"ok": True})


@purchase_units_bp.route("/set-preferred", methods=["POST"])
def prefer():
    """Set a purchase unit as preferred for its ingredient."""
    data = request.get_json(force=True)
    set_preferred(data["ingredient_id"], data["purchase_unit_id"])
    return jsonify({"ok": True})


@purchase_units_bp.route("/record-purchase", methods=["POST"])
def purchase():
    """Record a purchase and update preference learning."""
    data = request.get_json(force=True)
    record_purchase(data)
    return jsonify({"ok": True})
```

**Step 2: Register the blueprint in app.py**

Add to `register_blueprints()`:

```python
from routes.purchase_units import purchase_units_bp
app.register_blueprint(purchase_units_bp, url_prefix='/api/purchase-units')
```

**Step 3: Verify server starts**

Run: `cd server && python -c "from app import app; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add server/routes/purchase_units.py server/app.py
git commit -m "feat: add purchase_units API routes with preference learning"
```

---

### Task 7: Create shelf_life API routes

**Files:**
- Create: `server/routes/shelf_life.py`
- Modify: `server/app.py:35-43` (register_blueprints)

**Step 1: Write the shelf_life routes**

```python
"""API routes for ingredient shelf life data."""

from flask import Blueprint, request, jsonify
from models.shelf_life import (
    get_shelf_life, get_shelf_life_days, set_shelf_life,
    delete_shelf_life, get_all_shelf_life,
)

shelf_life_bp = Blueprint("shelf_life", __name__)


@shelf_life_bp.route("", methods=["GET"])
def list_all():
    """Return all shelf life data (optionally filter by ingredient_id)."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    if ingredient_id:
        return jsonify(get_shelf_life(ingredient_id))
    return jsonify(get_all_shelf_life())


@shelf_life_bp.route("", methods=["POST"])
def upsert():
    """Create or update a shelf life entry."""
    data = request.get_json(force=True)
    required = ["ingredient_id", "state", "storage_type", "shelf_life_days"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"{field} is required"}), 400
    set_shelf_life(
        data["ingredient_id"], data["state"],
        data["storage_type"], data["shelf_life_days"]
    )
    return jsonify({"ok": True})


@shelf_life_bp.route("/<int:shelf_life_id>", methods=["DELETE"])
def delete(shelf_life_id):
    """Delete a shelf life entry."""
    delete_shelf_life(shelf_life_id)
    return jsonify({"ok": True})


@shelf_life_bp.route("/lookup", methods=["GET"])
def lookup():
    """Look up shelf life days for a specific ingredient/state/storage combo."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    state = request.args.get("state", "raw")
    storage_type = request.args.get("storage_type", "fridge")
    if not ingredient_id:
        return jsonify({"error": "ingredient_id is required"}), 400
    days = get_shelf_life_days(ingredient_id, state, storage_type)
    return jsonify({"shelf_life_days": days})
```

**Step 2: Register the blueprint in app.py**

Add to `register_blueprints()`:

```python
from routes.shelf_life import shelf_life_bp
app.register_blueprint(shelf_life_bp, url_prefix='/api/shelf-life')
```

**Step 3: Verify all routes are registered**

Run: `cd server && python -c "from app import app; register_blueprints = None; exec(open('app.py').read()); print('OK')"`

**Step 4: Commit**

```bash
git add server/routes/shelf_life.py server/app.py
git commit -m "feat: add shelf_life API routes with lookup endpoint"
```

---

### Task 8: Add frontend API functions

**Files:**
- Modify: `app/js/api.js:156-158` (add after meal plans section)

**Step 1: Add inventory, purchase unit, and shelf life API functions**

Append to `app/js/api.js` after the meal plans section (line 158):

```javascript
// ---- Inventory ----

export async function getInventory() {
  return _fetch('/inventory');
}

export async function addInventoryItem(data) {
  return _fetch('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInventoryItem(id, data) {
  return _fetch(`/inventory/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInventoryItem(id) {
  return _fetch(`/inventory/${id}`, {
    method: 'DELETE',
  });
}

export async function deductRecipeFromInventory(recipeId) {
  return _fetch(`/inventory/deduct-recipe/${recipeId}`, {
    method: 'POST',
  });
}

// ---- Purchase Units ----

export async function getPurchaseUnits(ingredientId) {
  const query = ingredientId ? `?ingredient_id=${ingredientId}` : '';
  return _fetch(`/purchase-units${query}`);
}

export async function createPurchaseUnit(data) {
  return _fetch('/purchase-units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function recordPurchase(data) {
  return _fetch('/purchase-units/record-purchase', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---- Shelf Life ----

export async function getShelfLife(ingredientId) {
  const query = ingredientId ? `?ingredient_id=${ingredientId}` : '';
  return _fetch(`/shelf-life${query}`);
}

export async function lookupShelfLife(ingredientId, state, storageType) {
  return _fetch(`/shelf-life/lookup?ingredient_id=${ingredientId}&state=${state}&storage_type=${storageType}`);
}
```

**Step 2: Commit**

```bash
git add app/js/api.js
git commit -m "feat: add API functions for inventory, purchase units, and shelf life"
```

---

### Task 9: Add inventory store functions

**Files:**
- Modify: `app/js/store.js` (add new section after Shopping List Checked State, before Data Export)

**Step 1: Add inventory helper functions to store.js**

Add after the Shopping List section (after line 497, before the Data Export section at line 499):

```javascript
// ============================================================
// Inventory (server-backed via API)
// ============================================================

/**
 * Get all inventory items from the server.
 */
export async function getInventoryItems() {
  const { getInventory } = await import('./api.js');
  return await getInventory();
}

/**
 * Add an item to inventory on the server.
 */
export async function addToInventory(data) {
  const { addInventoryItem } = await import('./api.js');
  return await addInventoryItem(data);
}

/**
 * Update an inventory item on the server.
 */
export async function updateInventory(id, data) {
  const { updateInventoryItem } = await import('./api.js');
  return await updateInventoryItem(id, data);
}

/**
 * Delete an inventory item from the server.
 */
export async function deleteFromInventory(id) {
  const { deleteInventoryItem } = await import('./api.js');
  return await deleteInventoryItem(id);
}

/**
 * Deduct recipe ingredients from inventory (called when marking cooked).
 * Returns { deductions: [{ ingredient_name, amount_deducted, unit }] }
 */
export async function deductRecipeInventory(recipeId) {
  const { deductRecipeFromInventory } = await import('./api.js');
  return await deductRecipeFromInventory(recipeId);
}

/**
 * Get purchase units for an ingredient.
 */
export async function getIngredientPurchaseUnits(ingredientId) {
  const { getPurchaseUnits } = await import('./api.js');
  return await getPurchaseUnits(ingredientId);
}

/**
 * Record a purchase (updates preference learning).
 */
export async function recordIngredientPurchase(data) {
  const { recordPurchase } = await import('./api.js');
  return await recordPurchase(data);
}
```

**Step 2: Commit**

```bash
git add app/js/store.js
git commit -m "feat: add inventory and purchase unit functions to store"
```

---

### Task 10: Update meal planner cooked button to deduct inventory

**Files:**
- Modify: `app/js/meal-planner.js:759-793` (mark-cooked handler)

**Step 1: Update the mark-cooked handler**

The existing handler is at lines 759-793 in `meal-planner.js`. Replace the section starting at `// ---- Mark as cooked` with an updated version that also deducts inventory and shows a toast with deduction details and an "Adjust" option.

Find the existing cooked handler (lines 759-793):

```javascript
    // ---- Mark as cooked (checkmark button on filled slot) ----
    const cookedBtn = target.closest('[data-action="mark-cooked"]');
    if (cookedBtn) {
      e.stopPropagation();
      const dayKey = cookedBtn.dataset.day;
      const slotName = cookedBtn.dataset.slot;
      const recipeId = cookedBtn.dataset.recipeId;

      const plan = await loadOrCreatePlan(currentWeekId);
      const dayPlan = plan.days[dayKey];
      if (!dayPlan) return;

      const slot = dayPlan.slots.find((s) => s.slotName === slotName);
      if (!slot || !slot.recipeId) return;

      if (slot.cooked) {
        const { showToast } = await getApp();
        showToast('Already marked as cooked', 'info');
        return;
      }

      slot.cooked = true;
      await store.saveWeekPlan(currentWeekId, plan);

      const newCount = store.incrementCookCount(recipeId);
      const recipe = getRecipeById(recipeId);

      if (currentContainer) {
        renderMealPlanner(currentContainer);
      }

      const { showToast } = await getApp();
      const name = recipe ? recipe.name : 'Recipe';
      showToast(`"${name}" marked as cooked! (${newCount} total)`, 'success');
      return;
    }
```

Replace with:

```javascript
    // ---- Mark as cooked (checkmark button on filled slot) ----
    const cookedBtn = target.closest('[data-action="mark-cooked"]');
    if (cookedBtn) {
      e.stopPropagation();
      const dayKey = cookedBtn.dataset.day;
      const slotName = cookedBtn.dataset.slot;
      const recipeId = cookedBtn.dataset.recipeId;

      const plan = await loadOrCreatePlan(currentWeekId);
      const dayPlan = plan.days[dayKey];
      if (!dayPlan) return;

      const slot = dayPlan.slots.find((s) => s.slotName === slotName);
      if (!slot || !slot.recipeId) return;

      if (slot.cooked) {
        const { showToast } = await getApp();
        showToast('Already marked as cooked', 'info');
        return;
      }

      slot.cooked = true;
      await store.saveWeekPlan(currentWeekId, plan);

      const newCount = store.incrementCookCount(recipeId);
      const recipe = getRecipeById(recipeId);

      // Deduct ingredients from inventory (non-blocking)
      let deductions = [];
      try {
        const result = await store.deductRecipeInventory(parseInt(recipeId, 10));
        deductions = result.deductions || [];
      } catch (err) {
        console.warn('[meal-planner] Inventory deduction failed:', err);
      }

      if (currentContainer) {
        renderMealPlanner(currentContainer);
      }

      const { showToast } = await getApp();
      const name = recipe ? recipe.name : 'Recipe';

      if (deductions.length > 0) {
        const deductionSummary = deductions
          .filter(d => d.amount_deducted > 0)
          .map(d => `${d.amount_deducted}${d.unit} ${d.ingredient_name}`)
          .join(', ');
        if (deductionSummary) {
          showToast(`"${name}" cooked! Removed: ${deductionSummary}`, 'success');
        } else {
          showToast(`"${name}" marked as cooked! (${newCount} total)`, 'success');
        }
      } else {
        showToast(`"${name}" marked as cooked! (${newCount} total)`, 'success');
      }
      return;
    }
```

**Step 2: Commit**

```bash
git add app/js/meal-planner.js
git commit -m "feat: deduct inventory when marking recipe as cooked with toast summary"
```

---

### Task 11: Create seed data script for purchase units and shelf life

**Files:**
- Create: `server/seed_grocery_data.py`

**Step 1: Write the seed script**

This script pre-populates purchase units and shelf life data for common ingredients already in the database. It should be idempotent (safe to run multiple times).

```python
"""Seed purchase units and shelf life data for existing ingredients.

Run once: cd server && python seed_grocery_data.py

Safe to re-run — uses INSERT OR IGNORE for shelf life (UNIQUE constraint)
and checks for existing purchase_units before inserting.
"""

from db import get_connection, init_db

# ──────────────────────────────────────────────
# Purchase unit defaults: ingredient_name -> list of options
# Each option: (label, unit_type, package_quantity, package_weight_g, piece_weight_g, is_preferred)
# ──────────────────────────────────────────────

PURCHASE_UNITS = {
    'chicken breast': [
        ('Pack of 2 (~1.25 lb)', 'count', 2, 567, 283, 1),
        ('Pack of 7 (~4 lb)', 'count', 7, 1814, 259, 0),
    ],
    'ground turkey': [
        ('1 lb package', 'weight', 1, 454, None, 1),
    ],
    'ground beef': [
        ('1 lb package', 'weight', 1, 454, None, 1),
    ],
    'salmon fillet': [
        ('2-pack (~12 oz)', 'count', 2, 340, 170, 1),
    ],
    'shrimp': [
        ('1 lb bag (frozen)', 'weight', 1, 454, None, 1),
    ],
    'eggs': [
        ('Dozen (12)', 'count', 12, 720, 60, 1),
    ],
    'egg whites': [
        ('16 oz carton', 'volume', 1, 454, None, 1),
    ],
    'rice': [
        ('2 lb bag', 'weight', 1, 907, None, 1),
    ],
    'brown rice': [
        ('2 lb bag', 'weight', 1, 907, None, 1),
    ],
    'jasmine rice': [
        ('2 lb bag', 'weight', 1, 907, None, 1),
    ],
    'quinoa': [
        ('16 oz bag', 'weight', 1, 454, None, 1),
    ],
    'oats': [
        ('18 oz canister', 'weight', 1, 510, None, 1),
    ],
    'rolled oats': [
        ('18 oz canister', 'weight', 1, 510, None, 1),
    ],
    'black beans': [
        ('15 oz can', 'volume', 1, 425, None, 1),
    ],
    'kidney beans': [
        ('15 oz can', 'volume', 1, 425, None, 1),
    ],
    'chickpeas': [
        ('15 oz can', 'volume', 1, 425, None, 1),
    ],
    'lentils': [
        ('1 lb bag (dry)', 'weight', 1, 454, None, 1),
    ],
    'broccoli': [
        ('1 crown (~12 oz)', 'count', 1, 340, 340, 1),
    ],
    'carrots': [
        ('1 lb bag', 'weight', 1, 454, None, 1),
        ('2 lb bag', 'weight', 1, 907, None, 0),
    ],
    'celery': [
        ('1 stalk (~12 oz)', 'count', 1, 340, 340, 1),
    ],
    'bell pepper': [
        ('Single pepper', 'count', 1, 150, 150, 1),
        ('3-pack', 'count', 3, 450, 150, 0),
    ],
    'red bell pepper': [
        ('Single pepper', 'count', 1, 150, 150, 1),
    ],
    'onion': [
        ('3 lb bag', 'weight', 3, 1361, 227, 1),
        ('Single onion', 'count', 1, 227, 227, 0),
    ],
    'sweet potato': [
        ('Single (~8 oz)', 'count', 1, 227, 227, 1),
    ],
    'spinach': [
        ('5 oz bag', 'weight', 1, 142, None, 1),
        ('10 oz bag', 'weight', 1, 283, None, 0),
    ],
    'kale': [
        ('1 bunch', 'count', 1, 200, None, 1),
    ],
    'avocado': [
        ('Single avocado', 'count', 1, 170, 170, 1),
        ('Bag of 4', 'count', 4, 680, 170, 0),
    ],
    'tomatoes': [
        ('4-pack on vine', 'count', 4, 680, 170, 1),
    ],
    'garlic': [
        ('1 head', 'count', 1, 40, None, 1),
    ],
    'ginger': [
        ('1 piece (~2 oz)', 'weight', 1, 57, None, 1),
    ],
    'lemon': [
        ('Single lemon', 'count', 1, 85, 85, 1),
    ],
    'lime': [
        ('Single lime', 'count', 1, 67, 67, 1),
        ('Bag of 5', 'count', 5, 335, 67, 0),
    ],
    'banana': [
        ('Bunch of 5-6', 'count', 6, 720, 120, 1),
    ],
    'olive oil': [
        ('16.9 oz bottle', 'volume', 1, 500, None, 1),
    ],
    'coconut oil': [
        ('14 oz jar', 'volume', 1, 400, None, 1),
    ],
    'soy sauce': [
        ('10 oz bottle', 'volume', 1, 296, None, 1),
    ],
    'coconut aminos': [
        ('10 oz bottle', 'volume', 1, 296, None, 1),
    ],
    'fish sauce': [
        ('6.76 oz bottle', 'volume', 1, 200, None, 1),
    ],
    'tahini': [
        ('16 oz jar', 'volume', 1, 454, None, 1),
    ],
    'almond butter': [
        ('16 oz jar', 'volume', 1, 454, None, 1),
    ],
    'peanut butter': [
        ('16 oz jar', 'volume', 1, 454, None, 1),
    ],
    'gochujang': [
        ('7.5 oz tub', 'volume', 1, 213, None, 1),
    ],
    'miso paste': [
        ('13.2 oz tub', 'volume', 1, 375, None, 1),
    ],
    'tortillas': [
        ('Pack of 8', 'count', 8, 400, 50, 1),
    ],
    'canned tomatoes': [
        ('14.5 oz can', 'volume', 1, 411, None, 1),
        ('28 oz can', 'volume', 1, 794, None, 0),
    ],
    'diced tomatoes': [
        ('14.5 oz can', 'volume', 1, 411, None, 1),
    ],
    'coconut milk': [
        ('13.5 oz can', 'volume', 1, 400, None, 1),
    ],
    'Greek yogurt': [
        ('32 oz tub', 'weight', 1, 907, None, 1),
    ],
}

# ──────────────────────────────────────────────
# Shelf life defaults: ingredient_name -> list of (state, storage_type, days)
# ──────────────────────────────────────────────

SHELF_LIFE = {
    'chicken breast': [
        ('raw', 'fridge', 2),
        ('cooked', 'fridge', 4),
        ('raw', 'freezer', 180),
        ('cooked', 'freezer', 90),
    ],
    'ground turkey': [
        ('raw', 'fridge', 2),
        ('cooked', 'fridge', 4),
        ('raw', 'freezer', 120),
    ],
    'ground beef': [
        ('raw', 'fridge', 2),
        ('cooked', 'fridge', 4),
        ('raw', 'freezer', 120),
    ],
    'salmon fillet': [
        ('raw', 'fridge', 2),
        ('cooked', 'fridge', 3),
        ('raw', 'freezer', 90),
    ],
    'shrimp': [
        ('raw', 'fridge', 2),
        ('cooked', 'fridge', 3),
        ('raw', 'freezer', 180),
    ],
    'eggs': [
        ('raw', 'fridge', 35),
    ],
    'egg whites': [
        ('opened', 'fridge', 4),
        ('unopened', 'fridge', 14),
    ],
    'rice': [
        ('unopened', 'pantry', 730),
        ('cooked', 'fridge', 5),
    ],
    'brown rice': [
        ('unopened', 'pantry', 365),
        ('cooked', 'fridge', 5),
    ],
    'jasmine rice': [
        ('unopened', 'pantry', 730),
        ('cooked', 'fridge', 5),
    ],
    'quinoa': [
        ('unopened', 'pantry', 365),
        ('cooked', 'fridge', 5),
    ],
    'oats': [
        ('unopened', 'pantry', 365),
        ('opened', 'pantry', 180),
    ],
    'rolled oats': [
        ('unopened', 'pantry', 365),
        ('opened', 'pantry', 180),
    ],
    'black beans': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'kidney beans': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'chickpeas': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'lentils': [
        ('unopened', 'pantry', 730),
        ('cooked', 'fridge', 5),
    ],
    'broccoli': [
        ('raw', 'fridge', 5),
        ('cooked', 'fridge', 4),
    ],
    'carrots': [
        ('raw', 'fridge', 28),
        ('cooked', 'fridge', 5),
    ],
    'celery': [
        ('raw', 'fridge', 14),
    ],
    'bell pepper': [
        ('raw', 'fridge', 10),
    ],
    'red bell pepper': [
        ('raw', 'fridge', 10),
    ],
    'onion': [
        ('raw', 'pantry', 30),
    ],
    'sweet potato': [
        ('raw', 'pantry', 21),
        ('cooked', 'fridge', 5),
    ],
    'spinach': [
        ('raw', 'fridge', 5),
    ],
    'kale': [
        ('raw', 'fridge', 7),
    ],
    'avocado': [
        ('raw', 'fridge', 5),
    ],
    'tomatoes': [
        ('raw', 'fridge', 7),
    ],
    'garlic': [
        ('raw', 'pantry', 60),
    ],
    'ginger': [
        ('raw', 'fridge', 21),
    ],
    'lemon': [
        ('raw', 'fridge', 21),
    ],
    'lime': [
        ('raw', 'fridge', 21),
    ],
    'banana': [
        ('raw', 'pantry', 5),
    ],
    'olive oil': [
        ('unopened', 'pantry', 730),
        ('opened', 'pantry', 180),
    ],
    'coconut oil': [
        ('unopened', 'pantry', 730),
        ('opened', 'pantry', 365),
    ],
    'soy sauce': [
        ('unopened', 'pantry', 1095),
        ('opened', 'fridge', 180),
    ],
    'coconut aminos': [
        ('unopened', 'pantry', 365),
        ('opened', 'fridge', 30),
    ],
    'fish sauce': [
        ('unopened', 'pantry', 1095),
        ('opened', 'fridge', 365),
    ],
    'tahini': [
        ('unopened', 'pantry', 365),
        ('opened', 'fridge', 180),
    ],
    'almond butter': [
        ('unopened', 'pantry', 365),
        ('opened', 'fridge', 90),
    ],
    'peanut butter': [
        ('unopened', 'pantry', 365),
        ('opened', 'pantry', 90),
    ],
    'gochujang': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 90),
    ],
    'miso paste': [
        ('unopened', 'fridge', 365),
        ('opened', 'fridge', 90),
    ],
    'tortillas': [
        ('unopened', 'pantry', 14),
        ('opened', 'fridge', 7),
    ],
    'canned tomatoes': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'diced tomatoes': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'coconut milk': [
        ('unopened', 'pantry', 730),
        ('opened', 'fridge', 5),
    ],
    'Greek yogurt': [
        ('unopened', 'fridge', 14),
        ('opened', 'fridge', 7),
    ],
}


def seed():
    init_db()
    conn = get_connection()

    # Build ingredient name -> id lookup
    rows = conn.execute("SELECT id, name FROM ingredients").fetchall()
    name_to_id = {r['name'].lower(): r['id'] for r in rows}

    # Seed purchase units
    pu_count = 0
    for name, options in PURCHASE_UNITS.items():
        ing_id = name_to_id.get(name.lower())
        if not ing_id:
            continue
        # Skip if already has purchase units
        existing = conn.execute(
            "SELECT COUNT(*) as cnt FROM purchase_units WHERE ingredient_id = ?",
            (ing_id,)
        ).fetchone()['cnt']
        if existing > 0:
            continue
        for label, unit_type, pkg_qty, pkg_weight, piece_weight, preferred in options:
            conn.execute("""
                INSERT INTO purchase_units
                    (ingredient_id, label, unit_type, package_quantity,
                     package_weight_g, piece_weight_g, is_preferred)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (ing_id, label, unit_type, pkg_qty, pkg_weight, piece_weight, preferred))
            pu_count += 1

    # Seed shelf life
    sl_count = 0
    for name, entries in SHELF_LIFE.items():
        ing_id = name_to_id.get(name.lower())
        if not ing_id:
            continue
        for state, storage, days in entries:
            conn.execute("""
                INSERT OR IGNORE INTO ingredient_shelf_life
                    (ingredient_id, state, storage_type, shelf_life_days)
                VALUES (?, ?, ?, ?)
            """, (ing_id, state, storage, days))
            sl_count += 1

    conn.commit()
    conn.close()
    print(f"Seeded {pu_count} purchase units and {sl_count} shelf life entries.")


if __name__ == '__main__':
    seed()
```

**Step 2: Run the seed script**

Run: `cd server && python seed_grocery_data.py`
Expected: `Seeded N purchase units and M shelf life entries.`

**Step 3: Verify data was inserted**

Run: `cd server && python -c "from db import get_connection; c = get_connection(); print('PU:', c.execute('SELECT COUNT(*) FROM purchase_units').fetchone()[0]); print('SL:', c.execute('SELECT COUNT(*) FROM ingredient_shelf_life').fetchone()[0]); c.close()"`
Expected: Non-zero counts for both

**Step 4: Commit**

```bash
git add server/seed_grocery_data.py
git commit -m "feat: add seed script with purchase units and shelf life for common ingredients"
```

---

### Task 12: Rename Pantry nav tab to Inventory and update routing

**Files:**
- Modify: `app/index.html:27` (nav tab label)
- Modify: `app/js/app.js:16` (VALID_PAGES array)
- Modify: `app/js/app.js:46-49` (pantry case in loadPage)

**Step 1: Update the nav tab in index.html**

Change line 27 from:
```html
<button class="nav-tab" data-page="pantry">Pantry</button>
```
to:
```html
<button class="nav-tab" data-page="pantry">Inventory</button>
```

**Step 2: Commit**

```bash
git add app/index.html
git commit -m "feat: rename Pantry nav tab to Inventory"
```

---

### Task 13: Build the Inventory Dashboard UI

**Files:**
- Create: `app/js/inventory.js`
- Modify: `app/js/app.js:16` (add 'inventory' to VALID_PAGES)
- Modify: `app/js/app.js:46-49` (update pantry case to load inventory module)

**Step 1: Create the inventory dashboard module**

This replaces the pantry page with a tabbed inventory view: "In Stock", "Expiring Soon", and "Always Stocked" (legacy pantry). The In Stock tab groups items by storage location and shows color-coded expiry indicators.

```javascript
/**
 * inventory.js - Inventory dashboard with tabbed views.
 *
 * Replaces the simple pantry page with a full inventory tracking system.
 * Three tabs: In Stock (by storage location), Expiring Soon, Always Stocked.
 */

import { ingredientCategories } from './data/recipes.js';
import { getRecipes } from './recipe-cache.js';
import * as store from './store.js';

async function getApp() {
  return await import('./app.js');
}

// ============================================================
// Helpers
// ============================================================

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Calculate days until expiry. Returns null if no expiry date.
 */
function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + 'T00:00:00');
  return Math.ceil((expiry - now) / 86400000);
}

/**
 * Return CSS class for expiry badge: green (5+), yellow (2-4), red (0-1), expired (<0).
 */
function expiryClass(daysLeft) {
  if (daysLeft === null) return 'expiry-none';
  if (daysLeft < 0) return 'expiry-expired';
  if (daysLeft <= 1) return 'expiry-red';
  if (daysLeft <= 4) return 'expiry-yellow';
  return 'expiry-green';
}

/**
 * Format days until expiry as human-readable text.
 */
function expiryLabel(daysLeft) {
  if (daysLeft === null) return 'No expiry';
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)}d ago`;
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return 'Expires tomorrow';
  return `${daysLeft} days left`;
}

// ============================================================
// Module state
// ============================================================

let currentTab = 'in-stock'; // 'in-stock' | 'expiring' | 'always-stocked'
let searchQuery = '';
let currentContainer = null;
let inventoryItems = [];
let pantryItems = [];

// ============================================================
// Data loading
// ============================================================

async function loadData() {
  try {
    inventoryItems = await store.getInventoryItems();
  } catch {
    inventoryItems = [];
  }
  pantryItems = store.getPantryItems();
}

// ============================================================
// Render
// ============================================================

export async function renderInventory(container) {
  currentContainer = container;
  await loadData();
  container.innerHTML = buildPage();
  attachEvents(container);
}

function buildPage() {
  const expiringCount = inventoryItems.filter(item => {
    const days = daysUntilExpiry(item.expiry_date);
    return days !== null && days <= 3;
  }).length;

  return `
    <h2 style="margin-bottom: 1rem;">Inventory</h2>

    <div class="flex gap-1" style="margin-bottom: 1rem;">
      <button class="btn btn-sm ${currentTab === 'in-stock' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="in-stock">
        In Stock
      </button>
      <button class="btn btn-sm ${currentTab === 'expiring' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="expiring">
        Expiring Soon ${expiringCount > 0 ? `<span class="badge" style="background: var(--color-danger, #c0392b); color: #fff; margin-left: 0.25rem;">${expiringCount}</span>` : ''}
      </button>
      <button class="btn btn-sm ${currentTab === 'always-stocked' ? 'btn-primary' : 'btn-secondary'}" data-action="set-tab" data-tab="always-stocked">
        Always Stocked
      </button>
    </div>

    <div class="card">
      <div class="flex gap-1 mb-1">
        <input type="search" id="inventory-search" placeholder="Search inventory..." style="flex: 1;" value="${escapeHTML(searchQuery)}">
        <button class="btn btn-sm btn-primary" data-action="add-item">+ Add Item</button>
      </div>
      <div id="inventory-list">
        ${buildTabContent()}
      </div>
    </div>
  `;
}

function buildTabContent() {
  switch (currentTab) {
    case 'in-stock': return buildInStockTab();
    case 'expiring': return buildExpiringTab();
    case 'always-stocked': return buildAlwaysStockedTab();
    default: return '';
  }
}

function buildInStockTab() {
  let items = inventoryItems;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => (i.ingredient_name || '').toLowerCase().includes(q));
  }

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>No items in inventory.</p>
        <p class="text-sm">Items are added when you check off shopping list items or add them manually.</p>
      </div>
    `;
  }

  // Group by storage_type
  const groups = { fridge: [], freezer: [], pantry: [] };
  for (const item of items) {
    const storage = item.storage_type || 'fridge';
    if (!groups[storage]) groups[storage] = [];
    groups[storage].push(item);
  }

  const storageLabels = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' };
  let html = '';

  for (const [storage, storageItems] of Object.entries(groups)) {
    if (storageItems.length === 0) continue;
    storageItems.sort((a, b) => (a.ingredient_name || '').localeCompare(b.ingredient_name || ''));

    html += `
      <div class="shopping-category">
        <h3>${storageLabels[storage] || storage} <span class="badge badge-tag">${storageItems.length}</span></h3>
        ${storageItems.map(buildInventoryItemHTML).join('')}
      </div>
    `;
  }

  return html;
}

function buildExpiringTab() {
  const expiring = inventoryItems
    .map(item => ({ ...item, _daysLeft: daysUntilExpiry(item.expiry_date) }))
    .filter(item => item._daysLeft !== null && item._daysLeft <= 3)
    .sort((a, b) => a._daysLeft - b._daysLeft);

  if (expiring.length === 0) {
    return `
      <div class="empty-state">
        <p>Nothing expiring soon.</p>
      </div>
    `;
  }

  return expiring.map(item => buildInventoryItemHTML(item)).join('');
}

function buildAlwaysStockedTab() {
  let items = pantryItems.filter(i => i.alwaysStocked);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => (i.ingredientName || '').toLowerCase().includes(q));
  }

  if (items.length === 0) {
    return `
      <div class="empty-state">
        <p>No always-stocked items.</p>
        <p class="text-sm">These are pantry staples you always have on hand (salt, pepper, cooking oil, etc.)</p>
      </div>
    `;
  }

  return items.map(item => `
    <div class="pantry-item" data-pantry-id="${escapeHTML(item.id)}">
      <span class="pantry-item__name">${escapeHTML(item.ingredientName)}</span>
      <span class="pantry-item__qty">${escapeHTML(String(item.quantity || ''))}${escapeHTML(item.unit || '')}</span>
      <span class="badge badge-tag" style="background: var(--color-primary); color: #ffffff;">Always Stocked</span>
    </div>
  `).join('');
}

function buildInventoryItemHTML(item) {
  const daysLeft = daysUntilExpiry(item.expiry_date);
  const expClass = expiryClass(daysLeft);
  const expLabel = expiryLabel(daysLeft);
  const stateBadge = item.state && item.state !== 'raw'
    ? `<span class="badge badge-tag">${escapeHTML(item.state)}</span>`
    : '';

  return `
    <div class="pantry-item" data-inv-id="${item.id}">
      <span class="pantry-item__name">${escapeHTML(item.ingredient_name || '')}</span>
      <span class="pantry-item__qty">${item.quantity} ${escapeHTML(item.unit || 'g')}</span>
      ${stateBadge}
      <span class="badge ${expClass}">${expLabel}</span>
      <button class="btn btn-sm btn-secondary" data-action="edit-inv" data-id="${item.id}">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete-inv" data-id="${item.id}">&times;</button>
    </div>
  `;
}

// ============================================================
// Events
// ============================================================

function attachEvents(container) {
  // Tab switching
  container.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-action="set-tab"]');
    if (tabBtn) {
      currentTab = tabBtn.dataset.tab;
      renderInventory(container);
      return;
    }

    const addBtn = e.target.closest('[data-action="add-item"]');
    if (addBtn) {
      openAddItemModal();
      return;
    }

    const editBtn = e.target.closest('[data-action="edit-inv"]');
    if (editBtn) {
      openEditModal(parseInt(editBtn.dataset.id, 10));
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete-inv"]');
    if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id, 10);
      await store.deleteFromInventory(id);
      const { showToast } = await getApp();
      showToast('Item removed from inventory', 'info');
      await loadData();
      const listEl = container.querySelector('#inventory-list');
      if (listEl) listEl.innerHTML = buildTabContent();
      return;
    }
  });

  // Search
  const searchInput = container.querySelector('#inventory-search');
  if (searchInput) {
    const debouncedSearch = debounce((value) => {
      searchQuery = value;
      const listEl = container.querySelector('#inventory-list');
      if (listEl) listEl.innerHTML = buildTabContent();
    }, 250);
    searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
  }
}

async function openAddItemModal() {
  const { openModal } = await getApp();
  const { getIngredients } = await import('./api.js');
  const ingredients = await getIngredients();

  const options = ingredients
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(i => `<option value="${i.id}">${escapeHTML(i.name)}</option>`)
    .join('');

  const modalContent = document.getElementById('modal-content');
  openModal('');
  modalContent.innerHTML = `
    <h2>Add to Inventory</h2>
    <div class="form-group">
      <label>Ingredient</label>
      <select id="inv-ingredient">${options}</select>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>Quantity</label>
        <input type="number" id="inv-quantity" value="1" min="0" step="0.1">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Unit</label>
        <select id="inv-unit">
          <option value="g">g</option>
          <option value="oz">oz</option>
          <option value="lbs">lbs</option>
          <option value="count">count</option>
          <option value="cans">cans</option>
          <option value="cups">cups</option>
          <option value="ml">ml</option>
        </select>
      </div>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>State</label>
        <select id="inv-state">
          <option value="raw">Raw</option>
          <option value="cooked">Cooked</option>
          <option value="unopened">Unopened</option>
          <option value="opened">Opened</option>
          <option value="frozen">Frozen</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Storage</label>
        <select id="inv-storage">
          <option value="fridge">Fridge</option>
          <option value="freezer">Freezer</option>
          <option value="pantry">Pantry</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Expiry Date (optional)</label>
      <input type="date" id="inv-expiry">
    </div>
    <button class="btn btn-primary" id="inv-save">Add to Inventory</button>
  `;

  modalContent.querySelector('#inv-save').addEventListener('click', async () => {
    const data = {
      ingredient_id: parseInt(modalContent.querySelector('#inv-ingredient').value, 10),
      quantity: parseFloat(modalContent.querySelector('#inv-quantity').value) || 1,
      unit: modalContent.querySelector('#inv-unit').value,
      state: modalContent.querySelector('#inv-state').value,
      storage_type: modalContent.querySelector('#inv-storage').value,
      date_acquired: new Date().toISOString().slice(0, 10),
      expiry_date: modalContent.querySelector('#inv-expiry').value || null,
    };

    await store.addToInventory(data);
    const { closeModal, showToast } = await getApp();
    closeModal();
    showToast('Added to inventory', 'success');
    if (currentContainer) renderInventory(currentContainer);
  });
}

async function openEditModal(itemId) {
  const item = inventoryItems.find(i => i.id === itemId);
  if (!item) return;

  const { openModal } = await getApp();
  const modalContent = document.getElementById('modal-content');
  openModal('');

  modalContent.innerHTML = `
    <h2>Edit: ${escapeHTML(item.ingredient_name || '')}</h2>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>Quantity</label>
        <input type="number" id="inv-edit-qty" value="${item.quantity}" min="0" step="0.1">
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Unit</label>
        <select id="inv-edit-unit">
          ${['g', 'oz', 'lbs', 'count', 'cans', 'cups', 'ml'].map(u =>
            `<option value="${u}"${u === item.unit ? ' selected' : ''}>${u}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="flex gap-1">
      <div class="form-group" style="flex: 1;">
        <label>State</label>
        <select id="inv-edit-state">
          ${['raw', 'cooked', 'unopened', 'opened', 'frozen'].map(s =>
            `<option value="${s}"${s === item.state ? ' selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label>Storage</label>
        <select id="inv-edit-storage">
          ${['fridge', 'freezer', 'pantry'].map(s =>
            `<option value="${s}"${s === item.storage_type ? ' selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Expiry Date</label>
      <input type="date" id="inv-edit-expiry" value="${item.expiry_date || ''}">
    </div>
    <button class="btn btn-primary" id="inv-edit-save">Save Changes</button>
  `;

  modalContent.querySelector('#inv-edit-save').addEventListener('click', async () => {
    const updates = {
      quantity: parseFloat(modalContent.querySelector('#inv-edit-qty').value) || 0,
      unit: modalContent.querySelector('#inv-edit-unit').value,
      state: modalContent.querySelector('#inv-edit-state').value,
      storage_type: modalContent.querySelector('#inv-edit-storage').value,
      expiry_date: modalContent.querySelector('#inv-edit-expiry').value || null,
    };

    await store.updateInventory(itemId, updates);
    const { closeModal, showToast } = await getApp();
    closeModal();
    showToast('Inventory updated', 'success');
    if (currentContainer) renderInventory(currentContainer);
  });
}
```

**Step 2: Update app.js to load the inventory module instead of pantry**

In `app/js/app.js`, update the pantry case in `loadPage` (around line 46-49):

Change:
```javascript
      case 'pantry': {
        const { renderPantry } = await import('./pantry.js');
        renderPantry(container);
        break;
      }
```

To:
```javascript
      case 'pantry': {
        const { renderInventory } = await import('./inventory.js');
        await renderInventory(container);
        break;
      }
```

**Step 3: Add CSS for expiry badges**

Add these styles to `app/css/styles.css` (at the end of the file):

```css
/* Inventory expiry indicators */
.expiry-green { background: #27ae60; color: #fff; }
.expiry-yellow { background: #f39c12; color: #fff; }
.expiry-red { background: #c0392b; color: #fff; }
.expiry-expired { background: #7f1d1d; color: #fff; }
.expiry-none { background: var(--color-border); color: var(--color-text-secondary); }
```

**Step 4: Commit**

```bash
git add app/js/inventory.js app/js/app.js app/css/styles.css
git commit -m "feat: add Inventory Dashboard with In Stock, Expiring Soon, and Always Stocked tabs"
```

---

### Task 14: Integration test — manual verification checklist

This is not automated but serves as the verification step before calling Phase 1 complete.

**Step 1: Start the server**

Run: `cd server && python app.py`

**Step 2: Run the seed script**

Run: `cd server && python seed_grocery_data.py`

**Step 3: Verify in browser**

Open `http://localhost:5001` and check:

1. **Inventory tab** loads (was "Pantry") and shows three sub-tabs
2. **Add Item** button opens modal with ingredient dropdown, quantity, unit, state, storage, expiry fields
3. Adding an item shows it in the "In Stock" tab grouped by storage location
4. Expiry date shows color-coded badge (green/yellow/red)
5. **Expiring Soon** tab shows only items within 3 days of expiry
6. **Always Stocked** tab shows legacy pantry items
7. **Edit** button opens modal to change quantity/state/storage/expiry
8. **Delete** button removes item
9. **Planner page**: marking a recipe as cooked shows toast with deducted ingredients
10. Inventory updates after cooking (item quantities decrease or items removed)

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 — inventory tracking, purchase units, and auto-deduct on cook"
```

---

## Summary of all files

| Action | File |
|--------|------|
| Modify | `server/db.py` — add 4 new tables to schema |
| Create | `server/models/inventory.py` — inventory CRUD + recipe deduction |
| Create | `server/models/purchase_unit.py` — purchase unit CRUD + preference learning |
| Create | `server/models/shelf_life.py` — shelf life CRUD + lookup |
| Create | `server/routes/inventory.py` — inventory API endpoints |
| Create | `server/routes/purchase_units.py` — purchase unit API endpoints |
| Create | `server/routes/shelf_life.py` — shelf life API endpoints |
| Modify | `server/app.py` — register 3 new blueprints |
| Create | `server/seed_grocery_data.py` — pre-populate purchase units + shelf life |
| Modify | `app/js/api.js` — add inventory/purchase-unit/shelf-life API functions |
| Modify | `app/js/store.js` — add inventory store helpers |
| Modify | `app/js/meal-planner.js` — update cooked handler to deduct inventory |
| Modify | `app/index.html` — rename Pantry tab to Inventory |
| Modify | `app/js/app.js` — load inventory module instead of pantry |
| Create | `app/js/inventory.js` — full inventory dashboard UI |
| Modify | `app/css/styles.css` — expiry badge colors |
