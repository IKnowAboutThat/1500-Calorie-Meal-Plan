"""SQLite connection helper and schema initialization."""

import os
import sqlite3
from config import DB_PATH

SCHEMA_SQL = """
-- Canonical ingredients with USDA nutritional data
CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    usda_fdc_id INTEGER,
    calories_per_100g REAL,
    protein_per_100g REAL,
    fat_per_100g REAL,
    carbs_per_100g REAL,
    fiber_per_100g REAL,
    micronutrients TEXT,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recipes
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    notes TEXT,
    meal_type TEXT,
    cuisine TEXT,
    main_protein TEXT,
    servings INTEGER DEFAULT 1,
    phase TEXT,
    prep_time_min INTEGER,
    marinate_time_min INTEGER,
    cook_time_min INTEGER,
    total_time_min INTEGER,
    source_name TEXT,
    source_url TEXT,
    thumbnail_path TEXT,
    rating INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Junction: recipes <-> ingredients
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    amount REAL NOT NULL,
    unit TEXT DEFAULT 'g',
    sort_order INTEGER DEFAULT 0
);

-- Tags (flat entities)
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Tag hierarchy (many-to-many self-join for multi-parent)
CREATE TABLE IF NOT EXISTS tag_hierarchy (
    parent_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    child_tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (parent_tag_id, child_tag_id)
);

-- Recipe tags with lineage context
-- parent_tag_id uses 0 instead of NULL for top-level tags so it can participate in PK
CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    parent_tag_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_id, tag_id, parent_tag_id)
);
"""


def get_connection():
    """Return a new SQLite connection with WAL mode and foreign keys enabled."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    conn.close()
