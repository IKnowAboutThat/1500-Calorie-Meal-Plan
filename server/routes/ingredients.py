"""Ingredient API endpoints."""

from flask import Blueprint, jsonify, request
from models.ingredient import get_all_ingredients, get_ingredient, search_ingredients, create_ingredient
from services.usda_lookup import get_or_create_ingredient, IngredientNotFoundError

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


@ingredients_bp.route('/search', methods=['GET'])
def search():
    """Search existing ingredients by name."""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    results = search_ingredients(q)
    return jsonify(results)


@ingredients_bp.route('/lookup', methods=['POST'])
def usda_lookup():
    """Retry USDA lookup with a user-provided search term."""
    data = request.get_json(force=True)
    search_term = data.get('search_term', '').strip()
    amount = data.get('amount', 0)
    unit = data.get('unit', 'g')

    if not search_term:
        return jsonify({'error': 'search_term is required'}), 400

    try:
        ingredient = get_or_create_ingredient(search_term)
    except IngredientNotFoundError:
        return jsonify({
            'found': False,
            'search_term': search_term,
            'error': 'No USDA match found'
        }), 200

    # Calculate nutrition for the given amount
    factor = amount / 100.0 if amount else 0
    result = dict(ingredient)
    result['found'] = True
    result['ingredient_id'] = result.get('id')
    result['amount'] = amount
    result['unit'] = unit
    result['calories'] = round((result.get('calories_per_100g') or 0) * factor, 1)
    result['protein'] = round((result.get('protein_per_100g') or 0) * factor, 1)
    result['fat'] = round((result.get('fat_per_100g') or 0) * factor, 1)
    result['carbs'] = round((result.get('carbs_per_100g') or 0) * factor, 1)
    result['fiber'] = round((result.get('fiber_per_100g') or 0) * factor, 1)

    return jsonify(result)


@ingredients_bp.route('/', methods=['POST'])
def create():
    """Create a custom ingredient with user-provided nutrition values."""
    data = request.get_json(force=True)
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': 'name is required'}), 400

    data['name'] = name
    ingredient = create_ingredient(data)
    return jsonify(ingredient), 201
