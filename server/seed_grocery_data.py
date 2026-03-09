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
