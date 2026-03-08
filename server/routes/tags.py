"""Tag API endpoints."""

from flask import Blueprint, request, jsonify
from models.tag import (
    get_all_tags, create_tag, rename_tag, delete_tag,
    add_hierarchy, remove_hierarchy, tag_recipe, untag_recipe,
)

tags_bp = Blueprint('tags', __name__)


@tags_bp.route('/', methods=['GET'])
def list_tags():
    tags = get_all_tags()
    return jsonify(tags)


@tags_bp.route('/', methods=['POST'])
def create_new_tag():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Tag name is required'}), 400
    try:
        tag = create_tag(name)
    except Exception:
        return jsonify({'error': 'Tag already exists'}), 409
    return jsonify(tag), 201


@tags_bp.route('/<int:tag_id>', methods=['PUT'])
def update_tag(tag_id):
    data = request.get_json()
    new_name = data.get('name', '').strip()
    if not new_name:
        return jsonify({'error': 'Tag name is required'}), 400
    rename_tag(tag_id, new_name)
    return jsonify({'id': tag_id, 'name': new_name})


@tags_bp.route('/<int:tag_id>', methods=['DELETE'])
def delete_single_tag(tag_id):
    delete_tag(tag_id)
    return jsonify({'status': 'deleted'})


@tags_bp.route('/hierarchy', methods=['POST'])
def add_hierarchy_link():
    data = request.get_json()
    parent_id = data.get('parent_tag_id')
    child_id = data.get('child_tag_id')
    if not parent_id or not child_id:
        return jsonify({'error': 'parent_tag_id and child_tag_id required'}), 400

    error = add_hierarchy(parent_id, child_id)
    if error:
        return jsonify({'error': error}), 400
    return jsonify({'status': 'linked'}), 201


@tags_bp.route('/hierarchy', methods=['DELETE'])
def remove_hierarchy_link():
    data = request.get_json()
    parent_id = data.get('parent_tag_id')
    child_id = data.get('child_tag_id')
    if not parent_id or not child_id:
        return jsonify({'error': 'parent_tag_id and child_tag_id required'}), 400

    remove_hierarchy(parent_id, child_id)
    return jsonify({'status': 'unlinked'})


