"""Split compound seasoning-blend ingredients into individual ingredient rows.

Handles two cases:
1. Seasoning blends ("Garlic, ginger, cilantro" at 12g -> 4g each)
2. Sub-recipes ("Chimichurri sauce (GF): parsley, cilantro, ..." -> section grouping)
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from db import get_connection


# Qualifier patterns — ingredient names matching these are NOT blends
QUALIFIER_SUFFIXES = [
    ", cooked", ", roasted", ", shelled", ", sliced", ", raw",
    ", 93% lean", ", unsweetened", ", diced", ", chopped",
    ", ground", ", dried", ", fresh", ", frozen",
]

# Specific names that look like blends but aren't
SAFELIST = {
    "bell pepper, roasted",
    "bell pepper shells (2 peppers, roasted + eaten)",
    "ground turkey, 93% lean",
    "turkey breast, roasted",
    "turkey breast, sliced",
    "chicken breast, cooked",
    "eggplant, roasted",
    "zucchini, roasted",
    "broccoli, roasted",
    "black beans, cooked",
    "brown rice, cooked",
    "chickpeas, cooked",
    "edamame, shelled",
    "green lentils, cooked",
    "red lentils, cooked",
    "quinoa, cooked",
    "shrimp, cooked",
    "diced tomato",
    "fresh mango",
}


def is_blend(name):
    """Return True if this comma-containing ingredient name is a blend to split."""
    lower = name.lower().strip()

    # Check safelist
    if lower in SAFELIST:
        return False

    # Check qualifier suffixes
    for suffix in QUALIFIER_SUFFIXES:
        if lower.endswith(suffix):
            return False

    # Must contain a comma to be a blend
    if ',' not in name:
        return False

    return True


def clean_sub_ingredient(name):
    """Clean a sub-ingredient name for lookup/creation."""
    name = name.strip()
    # Remove parenthetical notes like (GF)
    name = re.sub(r'\s*\(.*?\)', '', name).strip()
    # Remove trailing quantity notes like "30ml"
    name = re.sub(r'\s+\d+\s*(?:ml|g|oz)\s*$', '', name, flags=re.IGNORECASE).strip()
    # Capitalize first letter
    if name:
        name = name[0].upper() + name[1:]
    return name


def find_or_create_ingredient(conn, name):
    """Find an existing ingredient by case-insensitive name, or create a new one."""
    row = conn.execute(
        "SELECT id, name FROM ingredients WHERE LOWER(name) = LOWER(?)", (name,)
    ).fetchone()
    if row:
        return row['id'], False

    # Create new ingredient with NULL nutrition (backfill later)
    cursor = conn.execute(
        "INSERT INTO ingredients (name) VALUES (?)", (name,)
    )
    return cursor.lastrowid, True


def parse_blend(name):
    """Parse a blend ingredient name into section label and sub-ingredient names.

    Returns (section, [sub_names]) where section is None for plain blends
    and a string for sub-recipes (colon-separated).
    """
    section = None

    # Sub-recipe case: "Chimichurri sauce (GF): parsley, cilantro, ..."
    if ':' in name:
        parts = name.split(':', 1)
        section = clean_sub_ingredient(parts[0])
        remainder = parts[1]
    else:
        remainder = name

    # Split on commas
    sub_names = []
    for part in remainder.split(','):
        cleaned = clean_sub_ingredient(part)
        if cleaned:
            sub_names.append(cleaned)

    return section, sub_names


def split_amount(total, count):
    """Split total grams equally, distributing remainder.

    Returns list of integer amounts summing to total (rounded).
    """
    total_int = round(total)
    if count == 0:
        return []
    base = total_int // count
    remainder = total_int - (base * count)
    amounts = []
    for i in range(count):
        amt = base + (1 if i < remainder else 0)
        amounts.append(amt)
    return amounts


def run():
    conn = get_connection()

    # Find all blend ingredients that are used in recipes
    all_ingredients = conn.execute(
        "SELECT id, name FROM ingredients WHERE name LIKE '%,%' OR name LIKE '%:%'"
    ).fetchall()

    blends = [(r['id'], r['name']) for r in all_ingredients if is_blend(r['name'])]
    print(f"Found {len(blends)} blend ingredients to split.\n")

    total_splits = 0
    new_ingredients = []
    errors = []

    for blend_id, blend_name in blends:
        # Find all recipe_ingredients rows using this blend
        ri_rows = conn.execute(
            "SELECT id, recipe_id, amount, unit, sort_order FROM recipe_ingredients WHERE ingredient_id = ?",
            (blend_id,)
        ).fetchall()

        if not ri_rows:
            continue

        section, sub_names = parse_blend(blend_name)

        if not sub_names:
            errors.append(f"Could not parse sub-ingredients from: {blend_name}")
            continue

        print(f"Splitting: {blend_name}")
        print(f"  -> {sub_names}" + (f" [section: {section}]" if section else ""))

        # Resolve sub-ingredient IDs
        sub_ids = []
        for sn in sub_names:
            ing_id, is_new = find_or_create_ingredient(conn, sn)
            sub_ids.append(ing_id)
            if is_new:
                new_ingredients.append(sn)
                print(f"  Created new ingredient: {sn} (id={ing_id})")

        # Process each recipe that uses this blend
        for ri in ri_rows:
            ri_id = ri['id']
            recipe_id = ri['recipe_id']
            total_amount = ri['amount']
            unit = ri['unit']
            sort_order = ri['sort_order']

            amounts = split_amount(total_amount, len(sub_names))

            # Insert individual rows
            for idx, (sub_id, amt) in enumerate(zip(sub_ids, amounts)):
                conn.execute(
                    """INSERT INTO recipe_ingredients
                       (recipe_id, ingredient_id, amount, unit, sort_order, section)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (recipe_id, sub_id, amt, unit, sort_order, section)
                )

            # Delete the original blend row
            conn.execute("DELETE FROM recipe_ingredients WHERE id = ?", (ri_id,))
            total_splits += 1

        conn.commit()

    # Clean up orphaned blend ingredients (no longer referenced)
    orphans_deleted = 0
    for blend_id, blend_name in blends:
        remaining = conn.execute(
            "SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id = ?", (blend_id,)
        ).fetchone()[0]
        if remaining == 0:
            # Check no other tables reference this ingredient
            inv_count = conn.execute(
                "SELECT COUNT(*) FROM inventory WHERE ingredient_id = ?", (blend_id,)
            ).fetchone()[0]
            pu_count = conn.execute(
                "SELECT COUNT(*) FROM purchase_units WHERE ingredient_id = ?", (blend_id,)
            ).fetchone()[0]
            if inv_count == 0 and pu_count == 0:
                conn.execute("DELETE FROM ingredients WHERE id = ?", (blend_id,))
                orphans_deleted += 1

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"Done!")
    print(f"  Recipe-ingredient rows split: {total_splits}")
    print(f"  New ingredients created: {len(new_ingredients)}")
    if new_ingredients:
        for ni in sorted(set(new_ingredients)):
            print(f"    - {ni}")
    print(f"  Orphaned blend ingredients deleted: {orphans_deleted}")
    if errors:
        print(f"\n  Errors ({len(errors)}):")
        for e in errors:
            print(f"    - {e}")


if __name__ == '__main__':
    run()
