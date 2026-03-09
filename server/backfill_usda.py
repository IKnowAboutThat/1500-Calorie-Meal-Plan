"""Backfill USDA nutritional data for ingredients missing it."""

import json
import sys
import time
import os

# Ensure server/ is on the path
sys.path.insert(0, os.path.dirname(__file__))

from db import get_connection
from services.usda_lookup import (
    _search_usda, _best_usda_match, _extract_nutrients, _guess_category,
    SYNONYMS, _normalize, IngredientNotFoundError
)


def backfill():
    conn = get_connection()

    # Get all ingredients without USDA data
    rows = conn.execute(
        "SELECT id, name FROM ingredients WHERE usda_fdc_id IS NULL ORDER BY name"
    ).fetchall()

    total = len(rows)
    print(f"Found {total} ingredients without USDA data.\n")

    if total == 0:
        print("Nothing to do!")
        conn.close()
        return

    success = 0
    failed = []

    for i, row in enumerate(rows):
        ing_id = row['id']
        name = row['name']
        print(f"[{i+1}/{total}] Looking up: {name}")

        # Build search terms
        name_lower = name.lower().strip()
        synonym = SYNONYMS.get(name_lower)
        search_terms = [name]
        if synonym and synonym.lower() != name_lower:
            search_terms.append(synonym)
        normalized = _normalize(name)
        if normalized not in [t.lower() for t in search_terms]:
            search_terms.append(normalized)
        words = normalized.split()
        if len(words) > 1:
            search_terms.append(words[-1])

        # Search USDA
        best_match = None
        for term in search_terms:
            try:
                results = _search_usda(term)
                if results:
                    best_match = _best_usda_match(results, term)
                    break
            except Exception as e:
                print(f"  Error searching '{term}': {e}")
                continue

        if not best_match:
            print(f"  FAILED - no match found")
            failed.append(name)
            time.sleep(0.5)
            continue

        # Extract nutrients
        macros, micros = _extract_nutrients(best_match)
        category = _guess_category(name, best_match)

        # Update existing row
        conn.execute("""
            UPDATE ingredients
            SET usda_fdc_id = ?,
                calories_per_100g = ?,
                protein_per_100g = ?,
                fat_per_100g = ?,
                carbs_per_100g = ?,
                fiber_per_100g = ?,
                micronutrients = ?,
                category = ?
            WHERE id = ?
        """, (
            best_match.get('fdcId'),
            max(macros.get('calories', 0), 0),
            max(macros.get('protein', 0), 0),
            max(macros.get('fat', 0), 0),
            max(macros.get('carbs', 0), 0),
            max(macros.get('fiber', 0), 0),
            json.dumps(micros),
            category,
            ing_id,
        ))
        conn.commit()

        usda_desc = best_match.get('description', '?')
        cals = max(macros.get('calories', 0), 0)
        print(f"  OK -> {usda_desc} ({cals} cal/100g)")
        success += 1

        # Rate limit: ~1 second between API calls
        time.sleep(1)

    conn.close()

    print(f"\n{'='*60}")
    print(f"Done! {success}/{total} ingredients updated.")
    if failed:
        print(f"\n{len(failed)} failed lookups:")
        for f in failed:
            print(f"  - {f}")


if __name__ == '__main__':
    backfill()
