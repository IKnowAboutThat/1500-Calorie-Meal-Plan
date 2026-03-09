"""Flask app entry point for the recipe API server."""

from flask import Flask
from flask_cors import CORS
from db import init_db

import os
APP_DIR = os.path.join(os.path.dirname(__file__), '..', 'app')

app = Flask(__name__, static_folder=APP_DIR, static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB for image uploads
CORS(app, origins="*")


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
    app.register_blueprint(recipes_bp, url_prefix='/api/recipes')
    app.register_blueprint(ingredients_bp, url_prefix='/api/ingredients')
    app.register_blueprint(tags_bp, url_prefix='/api/tags')


if __name__ == '__main__':
    init_db()
    register_blueprints()
    app.run(debug=True, port=5001, host='0.0.0.0')
