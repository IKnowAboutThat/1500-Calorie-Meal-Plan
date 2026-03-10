"""Recipe API endpoints."""

from flask import Blueprint, request, jsonify
from models.recipe import get_all_recipes, get_recipe, create_recipe, update_recipe, delete_recipe
from models.tag import tag_recipe, untag_recipe
from services.claude_parser import parse_recipe_text, parse_recipe_image
from services.usda_lookup import get_or_create_ingredient, expand_ingredient, IngredientNotFoundError

recipes_bp = Blueprint('recipes', __name__)


@recipes_bp.route('/', methods=['GET'])
def list_recipes():
    recipes = get_all_recipes()
    return jsonify(recipes)


@recipes_bp.route('/<int:recipe_id>', methods=['GET'])
def get_single_recipe(recipe_id):
    recipe = get_recipe(recipe_id)
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404
    return jsonify(recipe)


@recipes_bp.route('/parse', methods=['POST'])
def parse_recipe():
    """Parse raw recipe text via Claude, then enrich with USDA nutrition."""
    data = request.get_json()
    text = data.get('text', '')
    image_base64 = data.get('image_base64')
    image_media_type = data.get('image_media_type', 'image/jpeg')

    if not text.strip() and not image_base64:
        return jsonify({'error': 'No recipe text or image provided'}), 400

    # Step 1: Claude parse
    try:
        if image_base64:
            parsed = parse_recipe_image(image_base64, image_media_type, text.strip())
        else:
            parsed = parse_recipe_text(text)
    except Exception as e:
        return jsonify({'error': f'Failed to parse recipe: {str(e)}'}), 500

    # Step 2: USDA lookup for each ingredient (auto-splits blends)
    enriched_ingredients = []
    lookup_errors = []

    for ing in parsed.get('ingredients', []):
        try:
            expanded = expand_ingredient(ing)
            enriched_ingredients.extend(expanded)
        except IngredientNotFoundError as e:
            lookup_errors.append({
                'ingredient': e.ingredient,
                'searches_tried': e.searches_tried,
                'message': str(e),
            })

    # Calculate totals
    totals = {'calories': 0, 'protein': 0, 'fat': 0, 'carbs': 0, 'fiber': 0}
    for ing in enriched_ingredients:
        for key in totals:
            totals[key] += ing[key]
    for key in totals:
        totals[key] = round(totals[key], 1)

    servings = parsed.get('servings', 1) or 1
    per_serving = {k: round(v / servings, 1) for k, v in totals.items()}

    result = {
        'name': parsed.get('name', ''),
        'description': parsed.get('description', ''),
        'servings': servings,
        'ingredients': enriched_ingredients,
        'instructions': parsed.get('instructions', []),
        'prep_time_min': parsed.get('prep_time_min'),
        'cook_time_min': parsed.get('cook_time_min'),
        'marinate_time_min': parsed.get('marinate_time_min'),
        'cuisine': parsed.get('cuisine', ''),
        'meal_type': parsed.get('meal_type', 'meal'),
        'main_protein': parsed.get('main_protein', ''),
        'totals': totals,
        'per_serving': per_serving,
        'lookup_errors': lookup_errors,
    }

    return jsonify(result)


@recipes_bp.route('/', methods=['POST'])
def save_recipe():
    """Save a reviewed recipe to the database."""
    data = request.get_json()

    # Instructions: store as JSON string if list
    instructions = data.get('instructions', [])
    if isinstance(instructions, list):
        import json
        instructions = json.dumps(instructions)

    recipe_data = {
        'name': data.get('name'),
        'description': data.get('description'),
        'instructions': instructions,
        'notes': data.get('notes'),
        'meal_type': data.get('meal_type'),
        'cuisine': data.get('cuisine'),
        'main_protein': data.get('main_protein'),
        'servings': data.get('servings', 1),
        'phase': data.get('phase'),
        'prep_time_min': data.get('prep_time_min'),
        'marinate_time_min': data.get('marinate_time_min'),
        'cook_time_min': data.get('cook_time_min'),
        'total_time_min': data.get('total_time_min'),
        'source_name': data.get('source_name'),
        'source_url': data.get('source_url'),
        'rating': data.get('rating'),
        'tags': data.get('tags', []),
    }

    ingredient_rows = []
    for idx, ing in enumerate(data.get('ingredients', [])):
        ingredient_rows.append({
            'ingredient_id': ing['ingredient_id'],
            'amount': ing['amount'],
            'unit': ing.get('unit', 'g'),
            'sort_order': idx,
            'section': ing.get('section'),
        })

    recipe = create_recipe(recipe_data, ingredient_rows)
    return jsonify(recipe), 201


@recipes_bp.route('/<int:recipe_id>', methods=['PUT'])
def update_single_recipe(recipe_id):
    data = request.get_json()
    recipe = update_recipe(recipe_id, data)
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404
    return jsonify(recipe)


@recipes_bp.route('/<int:recipe_id>', methods=['DELETE'])
def delete_single_recipe(recipe_id):
    delete_recipe(recipe_id)
    return jsonify({'status': 'deleted'}), 200


@recipes_bp.route('/<int:recipe_id>/tags', methods=['POST'])
def tag_a_recipe(recipe_id):
    data = request.get_json()
    tag_id = data.get('tag_id')
    parent_tag_id = data.get('parent_tag_id', 0)
    if not tag_id:
        return jsonify({'error': 'tag_id is required'}), 400
    tag_recipe(recipe_id, tag_id, parent_tag_id)
    return jsonify({'status': 'tagged'}), 201


@recipes_bp.route('/<int:recipe_id>/tags', methods=['DELETE'])
def untag_a_recipe(recipe_id):
    data = request.get_json()
    tag_id = data.get('tag_id')
    parent_tag_id = data.get('parent_tag_id', 0)
    if not tag_id:
        return jsonify({'error': 'tag_id is required'}), 400
    untag_recipe(recipe_id, tag_id, parent_tag_id)
    return jsonify({'status': 'untagged'})
