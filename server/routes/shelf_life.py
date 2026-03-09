"""API routes for ingredient shelf life data."""

from flask import Blueprint, request, jsonify
from models.shelf_life import (
    get_shelf_life, get_shelf_life_days, set_shelf_life,
    delete_shelf_life, get_all_shelf_life,
)

shelf_life_bp = Blueprint("shelf_life", __name__)


@shelf_life_bp.route("", methods=["GET"])
def list_all():
    """Return all shelf life data (optionally filter by ingredient_id)."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    if ingredient_id:
        return jsonify(get_shelf_life(ingredient_id))
    return jsonify(get_all_shelf_life())


@shelf_life_bp.route("", methods=["POST"])
def upsert():
    """Create or update a shelf life entry."""
    data = request.get_json(force=True)
    required = ["ingredient_id", "state", "storage_type", "shelf_life_days"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"{field} is required"}), 400
    set_shelf_life(
        data["ingredient_id"], data["state"],
        data["storage_type"], data["shelf_life_days"]
    )
    return jsonify({"ok": True})


@shelf_life_bp.route("/<int:shelf_life_id>", methods=["DELETE"])
def delete(shelf_life_id):
    """Delete a shelf life entry."""
    delete_shelf_life(shelf_life_id)
    return jsonify({"ok": True})


@shelf_life_bp.route("/lookup", methods=["GET"])
def lookup():
    """Look up shelf life days for a specific ingredient/state/storage combo."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    state = request.args.get("state", "raw")
    storage_type = request.args.get("storage_type", "fridge")
    if not ingredient_id:
        return jsonify({"error": "ingredient_id is required"}), 400
    days = get_shelf_life_days(ingredient_id, state, storage_type)
    return jsonify({"shelf_life_days": days})
