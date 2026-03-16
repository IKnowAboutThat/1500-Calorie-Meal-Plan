"""API tests for parse warnings and partial lookup failures."""

from unittest.mock import patch

from server.tests.helpers import IsolatedDBTestCase


class ParseWarningsTest(IsolatedDBTestCase):
    def test_parse_returns_lookup_warnings_for_missing_ingredients(self):
        db = self.import_module('db')
        db.init_db()

        app_module = self.import_module('app')
        app_module.register_blueprints()
        client = app_module.app.test_client()

        routes = self.import_module('routes.recipes')
        usda_lookup = self.import_module('services.usda_lookup')

        parsed_recipe = {
            'name': 'Test Bowl',
            'servings': 2,
            'ingredients': [
                {'name': 'Chicken breast', 'grams_equivalent': 100, 'unit': 'g'},
                {'name': 'Mystery paste', 'grams_equivalent': 20, 'unit': 'g'},
            ],
            'instructions': ['Cook it'],
        }

        found = [{
            'ingredient_id': 1,
            'name': 'Chicken breast',
            'amount': 100,
            'unit': 'g',
            'section': None,
            'calories': 165.0,
            'protein': 31.0,
            'fat': 3.6,
            'carbs': 0.0,
            'fiber': 0.0,
        }]

        with patch.object(routes, 'parse_recipe_text', return_value=parsed_recipe), patch.object(
            routes,
            'expand_ingredient',
            side_effect=[
                found,
                usda_lookup.IngredientNotFoundError('Mystery paste', ['Mystery paste', 'mystery paste', 'paste']),
            ],
        ):
            response = client.post('/api/recipes/parse/', json={'text': 'raw recipe'})

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['name'], 'Test Bowl')
        self.assertEqual(len(body['ingredients']), 1)
        self.assertEqual(body['ingredients'][0]['name'], 'Chicken breast')
        self.assertEqual(len(body['lookup_errors']), 1)
        self.assertEqual(body['lookup_errors'][0]['ingredient'], 'Mystery paste')
        self.assertEqual(
            body['lookup_errors'][0]['searches_tried'],
            ['Mystery paste', 'mystery paste', 'paste'],
        )
        self.assertEqual(
            body['parse_warnings'],
            [{'field': 'description', 'message': 'No description was detected. You can add one before saving.'}],
        )

    def test_parse_fails_when_no_ingredients_are_detected(self):
        db = self.import_module('db')
        db.init_db()

        app_module = self.import_module('app')
        app_module.register_blueprints()
        client = app_module.app.test_client()

        routes = self.import_module('routes.recipes')

        parsed_recipe = {
            'name': 'Empty Bowl',
            'description': '',
            'servings': 1,
            'ingredients': [],
            'instructions': [],
        }

        with patch.object(routes, 'parse_recipe_text', return_value=parsed_recipe):
            response = client.post('/api/recipes/parse/', json={'text': 'raw recipe'})

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.get_json()['error'],
            'Failed to parse recipe: no ingredients were detected',
        )
