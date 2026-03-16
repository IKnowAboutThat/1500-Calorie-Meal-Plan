"""API routes for meal plan persistence."""

from flask import Blueprint, request, jsonify
from models.meal_plan import get_plan, save_plan, delete_plan, list_plan_ids

meal_plans_bp = Blueprint("meal_plans", __name__)


@meal_plans_bp.route("/", methods=["GET"])
def list_plans():
    """Return all stored week IDs."""
    return jsonify(list_plan_ids())


@meal_plans_bp.route("/<week_id>", methods=["GET"])
def get_week_plan(week_id):
    """Return a single week plan or 404."""
    plan = get_plan(week_id)
    if plan is None:
        return jsonify(None), 200  # Not an error, just no plan yet
    return jsonify(plan)


@meal_plans_bp.route("/<week_id>", methods=["PUT"])
def save_week_plan(week_id):
    """Create or update a week plan."""
    data = request.get_json(force=True)
    save_plan(week_id, data)
    return jsonify({"ok": True})


@meal_plans_bp.route("/<week_id>", methods=["DELETE"])
def delete_week_plan(week_id):
    """Delete a week plan."""
    delete_plan(week_id)
    return jsonify({"ok": True})
