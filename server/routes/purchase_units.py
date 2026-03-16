"""API routes for purchase unit management."""

from flask import Blueprint, request, jsonify
from models.purchase_unit import (
    get_purchase_units, get_all_purchase_units, create_purchase_unit,
    update_purchase_unit, delete_purchase_unit, set_preferred, record_purchase,
)

purchase_units_bp = Blueprint("purchase_units", __name__)


@purchase_units_bp.route("/", methods=["GET"])
def list_all():
    """Return all purchase units (optionally filter by ingredient_id)."""
    ingredient_id = request.args.get("ingredient_id", type=int)
    if ingredient_id:
        return jsonify(get_purchase_units(ingredient_id))
    return jsonify(get_all_purchase_units())


@purchase_units_bp.route("/", methods=["POST"])
def create():
    """Create a new purchase unit."""
    data = request.get_json(force=True)
    required = ["ingredient_id", "label", "unit_type", "package_quantity"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"{field} is required"}), 400
    pu = create_purchase_unit(data)
    return jsonify(pu), 201


@purchase_units_bp.route("/<int:pu_id>", methods=["PUT"])
def update(pu_id):
    """Update a purchase unit."""
    data = request.get_json(force=True)
    pu = update_purchase_unit(pu_id, data)
    if not pu:
        return jsonify({"error": "Purchase unit not found"}), 404
    return jsonify(pu)


@purchase_units_bp.route("/<int:pu_id>", methods=["DELETE"])
def delete(pu_id):
    """Delete a purchase unit."""
    delete_purchase_unit(pu_id)
    return jsonify({"ok": True})


@purchase_units_bp.route("/set-preferred", methods=["POST"])
def prefer():
    """Set a purchase unit as preferred for its ingredient."""
    data = request.get_json(force=True)
    set_preferred(data["ingredient_id"], data["purchase_unit_id"])
    return jsonify({"ok": True})


@purchase_units_bp.route("/record-purchase", methods=["POST"])
def purchase():
    """Record a purchase and update preference learning."""
    data = request.get_json(force=True)
    record_purchase(data)
    return jsonify({"ok": True})
