"""API routes for ingredient inventory management."""

from flask import Blueprint, request, jsonify
from models.inventory import (
    get_all_inventory, get_inventory_item, add_inventory_item,
    update_inventory_item, delete_inventory_item, deduct_recipe_ingredients,
)

inventory_bp = Blueprint("inventory", __name__)


@inventory_bp.route("", methods=["GET"])
def list_inventory():
    """Return all inventory items."""
    return jsonify(get_all_inventory())


@inventory_bp.route("/<int:item_id>", methods=["GET"])
def get_item(item_id):
    """Return a single inventory item."""
    item = get_inventory_item(item_id)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item)


@inventory_bp.route("", methods=["POST"])
def create_item():
    """Add an item to inventory."""
    data = request.get_json(force=True)
    if not data.get("ingredient_id") or not data.get("quantity"):
        return jsonify({"error": "ingredient_id and quantity required"}), 400
    item = add_inventory_item(data)
    return jsonify(item), 201


@inventory_bp.route("/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    """Update an inventory item."""
    data = request.get_json(force=True)
    item = update_inventory_item(item_id, data)
    if not item:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item)


@inventory_bp.route("/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    """Delete an inventory item."""
    delete_inventory_item(item_id)
    return jsonify({"ok": True})


@inventory_bp.route("/deduct-recipe/<int:recipe_id>", methods=["POST"])
def deduct_recipe(recipe_id):
    """Deduct ingredients for a cooked recipe from inventory (FIFO by expiry)."""
    deductions = deduct_recipe_ingredients(recipe_id)
    return jsonify({"deductions": deductions})
