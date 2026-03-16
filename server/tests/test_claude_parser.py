"""Tests for Claude parser structured output handling."""

import unittest
from unittest.mock import patch

from server.tests.helpers import IsolatedDBTestCase


def _result_message(**overrides):
    defaults = {
        "subtype": "success",
        "duration_ms": 1,
        "duration_api_ms": 1,
        "is_error": False,
        "num_turns": 1,
        "session_id": "sess_test",
        "stop_reason": "end_turn",
        "total_cost_usd": 0.0,
        "usage": {},
        "result": None,
        "structured_output": None,
    }
    defaults.update(overrides)
    return defaults


class ClaudeParserTest(IsolatedDBTestCase):
    def test_parse_recipe_prefers_structured_output(self):
        claude_parser = self.import_module('services.claude_parser')
        result_cls = self.import_module('claude_agent_sdk').ResultMessage

        async def fake_query(*, prompt, options, transport=None):
            self.assertEqual(options.output_format["type"], "json_schema")
            yield result_cls(**_result_message(structured_output={
                "name": "Structured Bowl",
                "description": "Test recipe",
                "servings": 2,
                "ingredients": [
                    {"name": "chicken breast", "amount": 150, "unit": "g", "grams_equivalent": 150},
                ],
                "instructions": ["Cook"],
                "prep_time_min": 5,
                "cook_time_min": 10,
                "marinate_time_min": 0,
                "cuisine": "American",
                "meal_type": "meal",
                "main_protein": "chicken",
            }))

        with patch.object(claude_parser, 'query', fake_query):
            parsed = claude_parser.parse_recipe_text("recipe text")

        self.assertEqual(parsed["name"], "Structured Bowl")
        self.assertEqual(parsed["servings"], 2)
        self.assertEqual(parsed["ingredients"][0]["name"], "chicken breast")
        self.assertEqual(parsed["ingredients"][0]["grams_equivalent"], 150.0)

    def test_parse_recipe_fails_without_structured_output(self):
        claude_parser = self.import_module('services.claude_parser')
        result_cls = self.import_module('claude_agent_sdk').ResultMessage

        async def fake_query(*, prompt, options, transport=None):
            yield result_cls(**_result_message(
                result='{"name":"Fallback Bowl"}',
                structured_output=None,
            ))

        with patch.object(claude_parser, 'query', fake_query):
            with self.assertRaises(claude_parser.RecipeParseError) as ctx:
                claude_parser.parse_recipe_text("recipe text")

        self.assertIn("no structured_output", str(ctx.exception))

    def test_parse_recipe_fails_on_sdk_error_result(self):
        claude_parser = self.import_module('services.claude_parser')
        result_cls = self.import_module('claude_agent_sdk').ResultMessage

        async def fake_query(*, prompt, options, transport=None):
            yield result_cls(**_result_message(
                subtype='error_max_structured_output_retries',
                is_error=True,
                stop_reason='max_retries',
                result='model could not satisfy schema',
            ))

        with patch.object(claude_parser, 'query', fake_query):
            with self.assertRaises(claude_parser.RecipeParseError) as ctx:
                claude_parser.parse_recipe_text("recipe text")

        self.assertIn("error_max_structured_output_retries", str(ctx.exception))

    def test_parse_recipe_fails_on_malformed_structured_output(self):
        claude_parser = self.import_module('services.claude_parser')
        result_cls = self.import_module('claude_agent_sdk').ResultMessage

        async def fake_query(*, prompt, options, transport=None):
            yield result_cls(**_result_message(structured_output={
                "name": "Broken Bowl",
                "description": "Test recipe",
                "servings": 1,
                "ingredients": [
                    {"name": "", "amount": 100, "unit": "g", "grams_equivalent": 100},
                ],
                "instructions": ["Cook"],
                "prep_time_min": 5,
                "cook_time_min": 10,
                "marinate_time_min": 0,
                "cuisine": "American",
                "meal_type": "meal",
                "main_protein": "chicken",
            }))

        with patch.object(claude_parser, 'query', fake_query):
            with self.assertRaises(claude_parser.RecipeParseError) as ctx:
                claude_parser.parse_recipe_text("recipe text")

        self.assertIn("ingredients[0].name is required", str(ctx.exception))
