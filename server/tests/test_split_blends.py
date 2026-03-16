"""Tests for the blend-splitting migration script."""

from server.tests.helpers import IsolatedDBTestCase


class SplitBlendsMigrationTest(IsolatedDBTestCase):
    def test_split_blends_replaces_compound_rows_and_sets_sections(self):
        db = self.import_module('db')
        db.init_db()
        conn = db.get_connection()

        recipe_id = conn.execute(
            "INSERT INTO recipes (name, servings) VALUES (?, ?)",
            ('Blend Test', 1),
        ).lastrowid

        garlic_blend_id = conn.execute(
            "INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, micronutrients, category) "
            "VALUES (?, 20, 1, 0, 3, 1, '{}', 'spice')",
            ('Garlic, ginger, cilantro',),
        ).lastrowid
        chimichurri_id = conn.execute(
            "INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, micronutrients, category) "
            "VALUES (?, 80, 0, 8, 1, 0, '{}', 'condiment')",
            ('Chimichurri sauce (GF): parsley, cilantro, olive oil, garlic, vinegar',),
        ).lastrowid
        chicken_id = conn.execute(
            "INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, micronutrients, category) "
            "VALUES (?, 165, 31, 4, 0, 0, '{}', 'protein')",
            ('Chicken breast',),
        ).lastrowid

        conn.execute(
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order) VALUES (?, ?, ?, ?, ?)",
            (recipe_id, chicken_id, 150, 'g', 0),
        )
        conn.execute(
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order) VALUES (?, ?, ?, ?, ?)",
            (recipe_id, garlic_blend_id, 12, 'g', 1),
        )
        conn.execute(
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, unit, sort_order) VALUES (?, ?, ?, ?, ?)",
            (recipe_id, chimichurri_id, 10, 'g', 2),
        )
        conn.commit()
        conn.close()

        split_blends = self.import_module('split_blends')
        split_blends.run()

        conn = db.get_connection()
        remaining = conn.execute(
            "SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id IN (?, ?)",
            (garlic_blend_id, chimichurri_id),
        ).fetchone()[0]
        self.assertEqual(remaining, 0)

        split_rows = conn.execute(
            """
            SELECT i.name, ri.amount, ri.section, ri.sort_order
            FROM recipe_ingredients ri
            JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = ?
            ORDER BY ri.sort_order, i.name
            """,
            (recipe_id,),
        ).fetchall()
        conn.close()

        names = [row['name'] for row in split_rows]
        self.assertIn('Garlic', names)
        self.assertIn('Ginger', names)
        self.assertIn('Cilantro', names)
        self.assertIn('Parsley', names)
        self.assertIn('Olive oil', names)
        self.assertIn('Vinegar', names)

        plain_split = [row for row in split_rows if row['sort_order'] == 1]
        self.assertEqual(sum(row['amount'] for row in plain_split), 12)
        self.assertTrue(all(row['section'] is None for row in plain_split))

        sectioned = [row for row in split_rows if row['sort_order'] == 2]
        self.assertEqual(sum(row['amount'] for row in sectioned), 10)
        self.assertEqual({row['section'] for row in sectioned}, {'Chimichurri sauce'})
