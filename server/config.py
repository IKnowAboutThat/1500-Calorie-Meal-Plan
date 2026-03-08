"""Configuration for the Flask recipe server."""

import os

# Database
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'recipes.db')

# USDA FoodData Central API
USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1/'
USDA_API_KEY = os.environ.get('USDA_API_KEY', 'DEMO_KEY')

# Claude fallback for ingredient nutrition (disabled by default)
CLAUDE_NUTRITION_FALLBACK = False
