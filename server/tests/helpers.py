"""Test helpers for isolated server module imports and temp databases."""

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


SERVER_DIR = Path(__file__).resolve().parents[1]


def purge_server_modules():
    """Drop cached server modules so env-based config reloads cleanly."""
    prefixes = (
        'app',
        'backfill_usda',
        'config',
        'db',
        'models',
        'routes',
        'services',
        'split_blends',
    )
    for name in list(sys.modules):
        if name == 'test_api':
            continue
        if name.startswith(prefixes):
            sys.modules.pop(name, None)


class IsolatedDBTestCase(unittest.TestCase):
    """Base test case that points server code at a temporary SQLite DB."""

    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(prefix='meal-plan-test-')
        self.db_path = os.path.join(self._tmpdir.name, 'recipes.db')
        self._old_recipe_db = os.environ.get('RECIPE_DB_PATH')
        self._old_allow_empty = os.environ.get('ALLOW_EMPTY_DB')
        os.environ['RECIPE_DB_PATH'] = self.db_path
        os.environ['ALLOW_EMPTY_DB'] = '1'
        if str(SERVER_DIR) not in sys.path:
            sys.path.insert(0, str(SERVER_DIR))
        purge_server_modules()

    def tearDown(self):
        purge_server_modules()
        if self._old_recipe_db is None:
            os.environ.pop('RECIPE_DB_PATH', None)
        else:
            os.environ['RECIPE_DB_PATH'] = self._old_recipe_db
        if self._old_allow_empty is None:
            os.environ.pop('ALLOW_EMPTY_DB', None)
        else:
            os.environ['ALLOW_EMPTY_DB'] = self._old_allow_empty
        self._tmpdir.cleanup()

    def import_module(self, name):
        """Import a server module after env setup."""
        return importlib.import_module(name)
