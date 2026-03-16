"""Tests for the USDA backfill script."""

from unittest.mock import patch

from server.tests.helpers import IsolatedDBTestCase


class BackfillUSDATest(IsolatedDBTestCase):
    def test_backfill_updates_successes_and_leaves_failures_reported(self):
        db = self.import_module('db')
        db.init_db()
        conn = db.get_connection()
        conn.execute("INSERT INTO ingredients (name, micronutrients) VALUES (?, ?)", ('Chicken breast', '{}'))
        conn.execute("INSERT INTO ingredients (name, micronutrients) VALUES (?, ?)", ('Unknown spice', '{}'))
        conn.commit()
        conn.close()

        backfill_usda = self.import_module('backfill_usda')

        def fake_search(term):
            if term in {'Chicken breast', 'chicken breast'}:
                return [{'fdcId': 1001, 'description': 'Chicken breast, raw', 'dataType': 'Foundation'}]
            return []

        with patch.object(backfill_usda, '_search_usda', side_effect=fake_search), patch.object(
            backfill_usda,
            '_best_usda_match',
            return_value={'fdcId': 1001, 'description': 'Chicken breast, raw', 'dataType': 'Foundation'},
        ), patch.object(
            backfill_usda,
            '_extract_nutrients',
            return_value=(
                {'calories': 120, 'protein': 22, 'fat': 3, 'carbs': 0, 'fiber': 0},
                {'iron_mg': 0.7},
            ),
        ), patch.object(backfill_usda, '_guess_category', return_value='protein'), patch.object(
            backfill_usda.time,
            'sleep',
            return_value=None,
        ):
            backfill_usda.backfill()

        conn = db.get_connection()
        chicken = conn.execute(
            "SELECT usda_fdc_id, calories_per_100g, protein_per_100g, category FROM ingredients WHERE name = ?",
            ('Chicken breast',),
        ).fetchone()
        unknown = conn.execute(
            "SELECT usda_fdc_id FROM ingredients WHERE name = ?",
            ('Unknown spice',),
        ).fetchone()
        conn.close()

        self.assertEqual(chicken['usda_fdc_id'], 1001)
        self.assertEqual(chicken['calories_per_100g'], 120)
        self.assertEqual(chicken['protein_per_100g'], 22)
        self.assertEqual(chicken['category'], 'protein')
        self.assertIsNone(unknown['usda_fdc_id'])
