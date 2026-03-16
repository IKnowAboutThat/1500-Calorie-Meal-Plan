"""SQLite connection helper and schema initialization."""

import os
import sqlite3
from config import ALLOW_EMPTY_DB, DB_PATH

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
    sort_order INTEGER DEFAULT 0,
    section TEXT
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

-- Meal plans (weekly plans stored as JSON)
CREATE TABLE IF NOT EXISTS meal_plans (
    week_id TEXT PRIMARY KEY,
    plan_data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recipe tags with lineage context
-- parent_tag_id uses 0 instead of NULL for top-level tags so it can participate in PK
CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    parent_tag_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (recipe_id, tag_id, parent_tag_id)
);

-- How ingredients are sold at the store (multiple options per ingredient)
CREATE TABLE IF NOT EXISTS purchase_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    unit_type TEXT NOT NULL,
    package_quantity REAL NOT NULL,
    package_weight_g REAL,
    piece_weight_g REAL,
    is_preferred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Shelf life per ingredient state and storage type
CREATE TABLE IF NOT EXISTS ingredient_shelf_life (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    storage_type TEXT NOT NULL,
    shelf_life_days INTEGER NOT NULL,
    UNIQUE(ingredient_id, state, storage_type)
);

-- Current ingredient inventory (what's in the house)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'g',
    state TEXT NOT NULL DEFAULT 'raw',
    storage_type TEXT NOT NULL DEFAULT 'fridge',
    date_acquired DATE NOT NULL DEFAULT (date('now')),
    expiry_date DATE,
    purchase_unit_id INTEGER REFERENCES purchase_units(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Purchase history for learning preferred purchase units
CREATE TABLE IF NOT EXISTS purchase_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    purchase_unit_id INTEGER REFERENCES purchase_units(id) ON DELETE SET NULL,
    custom_label TEXT,
    custom_quantity REAL,
    custom_unit TEXT,
    date_purchased DATE NOT NULL DEFAULT (date('now')),
    store_name TEXT
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
    """Create all tables if they don't exist.

    Refuses to start if the database exists but has no recipes,
    since that likely means the file was recreated empty by accident.
    Creates a timestamped backup every 60 days.
    """
    import shutil
    import time

    db_exists = os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 0
    conn = get_connection()
    if db_exists:
        count = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        if count == 0 and not ALLOW_EMPTY_DB:
            conn.close()
            raise RuntimeError(
                f"Database at {DB_PATH} exists but has 0 recipes. "
                "This likely means the file was recreated empty. "
                "Restore from git or backup before starting the server."
            )
        _maybe_backup(DB_PATH)
    conn.executescript(SCHEMA_SQL)
    conn.commit()

    # Migration: add section column if it doesn't exist
    try:
        conn.execute("ALTER TABLE recipe_ingredients ADD COLUMN section TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists

    conn.close()


BACKUP_INTERVAL_DAYS = 60


def _maybe_backup(db_path):
    """Create a timestamped backup if the most recent one is older than BACKUP_INTERVAL_DAYS."""
    import shutil
    import glob
    import time

    backup_dir = os.path.join(os.path.dirname(db_path), 'backups')
    os.makedirs(backup_dir, exist_ok=True)

    existing = sorted(glob.glob(os.path.join(backup_dir, 'recipes_*.db')))
    if existing:
        newest_mtime = os.path.getmtime(existing[-1])
        days_since = (time.time() - newest_mtime) / 86400
        if days_since < BACKUP_INTERVAL_DAYS:
            return

    timestamp = time.strftime('%Y%m%d')
    backup_path = os.path.join(backup_dir, f'recipes_{timestamp}.db')
    shutil.copy2(db_path, backup_path)
    print(f"Database backed up to {backup_path}")
