"""Meal plan model – stores weekly plans as JSON keyed by week_id."""

import json
from db import get_connection


def get_plan(week_id):
    """Return the plan dict for a week, or None."""
    conn = get_connection()
    row = conn.execute(
        "SELECT plan_data FROM meal_plans WHERE week_id = ?", (week_id,)
    ).fetchone()
    conn.close()
    if row:
        return json.loads(row["plan_data"])
    return None


def save_plan(week_id, plan_data):
    """Upsert a week plan (dict -> JSON)."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO meal_plans (week_id, plan_data, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(week_id) DO UPDATE
           SET plan_data = excluded.plan_data,
               updated_at = CURRENT_TIMESTAMP""",
        (week_id, json.dumps(plan_data)),
    )
    conn.commit()
    conn.close()


def delete_plan(week_id):
    """Delete a week plan."""
    conn = get_connection()
    conn.execute("DELETE FROM meal_plans WHERE week_id = ?", (week_id,))
    conn.commit()
    conn.close()


def list_plan_ids():
    """Return a sorted list of all week_ids that have plans."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT week_id FROM meal_plans ORDER BY week_id"
    ).fetchall()
    conn.close()
    return [r["week_id"] for r in rows]
