"""Flask app entry point for the recipe API server."""

from flask import Flask
from flask_cors import CORS
from db import init_db

import os
APP_DIR = os.path.join(os.path.dirname(__file__), '..', 'app')

app = Flask(__name__, static_folder=APP_DIR, static_url_path='')
app.url_map.strict_slashes = False
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB for image uploads
CORS(app, origins="*")


@app.after_request
def add_no_cache_headers(response):
    """Prevent Safari from serving stale JS/HTML files."""
    if response.content_type and ('javascript' in response.content_type or 'html' in response.content_type):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/health')
def health():
    return {'status': 'ok'}


def register_blueprints():
    from routes.recipes import recipes_bp
    from routes.ingredients import ingredients_bp
    from routes.tags import tags_bp
    from routes.meal_plans import meal_plans_bp
    app.register_blueprint(recipes_bp, url_prefix='/api/recipes')
    app.register_blueprint(ingredients_bp, url_prefix='/api/ingredients')
    app.register_blueprint(tags_bp, url_prefix='/api/tags')
    app.register_blueprint(meal_plans_bp, url_prefix='/api/meal-plans')
    from routes.inventory import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/api/inventory')
    from routes.purchase_units import purchase_units_bp
    app.register_blueprint(purchase_units_bp, url_prefix='/api/purchase-units')
    from routes.shelf_life import shelf_life_bp
    app.register_blueprint(shelf_life_bp, url_prefix='/api/shelf-life')


if __name__ == '__main__':
    init_db()
    register_blueprints()
    app.run(debug=True, port=5001, host='0.0.0.0')
