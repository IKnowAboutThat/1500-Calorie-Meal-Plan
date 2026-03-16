"""Configuration for the Flask recipe server."""

import os
from pathlib import Path

# Load .env file if present
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, _, value = line.partition('=')
            os.environ.setdefault(key.strip(), value.strip())

# Database
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'recipes.db')
DB_PATH = os.environ.get('RECIPE_DB_PATH', DEFAULT_DB_PATH)
ALLOW_EMPTY_DB = os.environ.get('ALLOW_EMPTY_DB') == '1'

# USDA FoodData Central API
USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1/'
USDA_API_KEY = os.environ.get('USDA_API_KEY', 'DEMO_KEY')

# Claude fallback for ingredient nutrition (disabled by default)
CLAUDE_NUTRITION_FALLBACK = False
