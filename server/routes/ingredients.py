"""Ingredient API endpoints."""

from flask import Blueprint, jsonify
from models.ingredient import get_all_ingredients, get_ingredient

ingredients_bp = Blueprint('ingredients', __name__)


@ingredients_bp.route('/', methods=['GET'])
def list_ingredients():
    ingredients = get_all_ingredients()
    return jsonify(ingredients)


@ingredients_bp.route('/<int:ingredient_id>', methods=['GET'])
def get_single_ingredient(ingredient_id):
    ingredient = get_ingredient(ingredient_id)
    if not ingredient:
        return jsonify({'error': 'Ingredient not found'}), 404
    return jsonify(ingredient)
