"""Fill in cuisine and main_protein for imported v3 recipes based on name/ingredients."""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'recipes.db')

# Map recipe keywords to cuisine
CUISINE_MAP = {
    'Gochujang': 'Korean',
    'Thai': 'Thai',
    'Miso': 'Japanese',
    'Pollo Asado': 'Mexican',
    'Teriyaki': 'Japanese',
    'Ponzu': 'Japanese',
    'Hoisin': 'Chinese',
    'Korean': 'Korean',
    'Kimchi': 'Korean',
    'Berbere': 'Ethiopian',
    'Ethiopian': 'Ethiopian',
    'Harissa': 'North African',
    'Carne Asada': 'Mexican',
    'Chipotle': 'Mexican',
    'Chana Dal': 'Indian',
    'Toor Dal': 'Indian',
    'Matar Dal': 'Indian',
    'Urad Dal': 'Indian',
    'Red Lentil Dal': 'Indian',
    'Masala': 'Indian',
    'Tikka': 'Indian',
    'Tandoori': 'Indian',
    'Tamarind': 'Indian',
    'Ajika': 'Georgian',
    'Cajun': 'American/Cajun',
    'Buffalo': 'American',
    'BBQ': 'American/BBQ',
    'Shakshuka': 'Middle Eastern',
    'Lima Bean Chili Verde': 'Mexican',
    'Lima Bean Rosemary': 'Mediterranean',
    'French Lentil': 'French',
    'Pad Thai': 'Thai',
    'Tom Yum': 'Thai',
    'Souvlaki': 'Greek',
    'Mediterranean': 'Mediterranean',
    'Poke': 'Hawaiian',
    'Split Pea Soup': 'American',
    'Brown Lentil Soup': 'Middle Eastern',
    'Black Soybean': 'American',
    'Mayocoba Bean': 'Mexican',
    'Chickpea Masala': 'Indian',
}

# Map recipe name keywords to main protein
PROTEIN_MAP = {
    'Chicken': 'chicken',
    'Tuna': 'tuna',
    'Sardine': 'sardine',
    'Salmon': 'salmon',
    'Shrimp': 'shrimp',
    'Turkey': 'turkey',
    'Egg': 'egg',
    'Tofu': 'tofu',
}


def infer_cuisine(name):
    """Infer cuisine from recipe name."""
    # Check longer/more specific patterns first
    for keyword, cuisine in sorted(CUISINE_MAP.items(), key=lambda x: -len(x[0])):
        if keyword.lower() in name.lower():
            return cuisine
    return None


def infer_protein(name, ingredients):
    """Infer main protein from recipe name, falling back to ingredients."""
    # Check name first
    name_lower = name.lower()
    for keyword, protein in PROTEIN_MAP.items():
        if keyword.lower() in name_lower:
            return protein

    # Check ingredients
    for ing_name in ingredients:
        ing_lower = ing_name.lower()
        if 'chicken' in ing_lower:
            return 'chicken'
        if 'tuna' in ing_lower:
            return 'tuna'
        if 'sardine' in ing_lower:
            return 'sardine'
        if 'egg' in ing_lower and 'egg white' not in ing_lower:
            return 'egg'
        if 'egg white' in ing_lower:
            return 'egg'
        if 'tofu' in ing_lower:
            return 'tofu'
        if 'protein powder' in ing_lower:
            return 'protein powder'

    return None


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    recipes = conn.execute("""
        SELECT r.id, r.name FROM recipes r
        WHERE r.source_name = '30-Day Meal Plan v3'
          AND (r.cuisine IS NULL OR r.cuisine = ''
               OR r.main_protein IS NULL OR r.main_protein = '')
    """).fetchall()

    updated = 0
    for r in recipes:
        recipe_id = r['id']
        name = r['name']

        # Get ingredient names for this recipe
        ing_rows = conn.execute("""
            SELECT i.name FROM recipe_ingredients ri
            JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = ?
        """, (recipe_id,)).fetchall()
        ing_names = [row['name'] for row in ing_rows]

        cuisine = infer_cuisine(name)
        protein = infer_protein(name, ing_names)

        updates = []
        values = []
        if cuisine:
            updates.append("cuisine = ?")
            values.append(cuisine)
        if protein:
            updates.append("main_protein = ?")
            values.append(protein)

        if updates:
            values.append(recipe_id)
            conn.execute(f"UPDATE recipes SET {', '.join(updates)} WHERE id = ?", values)
            updated += 1
            print(f"  {name:50s} cuisine={cuisine or '':20s} protein={protein or ''}")

    conn.commit()
    conn.close()
    print(f"\nUpdated {updated} recipes")


if __name__ == '__main__':
    main()
