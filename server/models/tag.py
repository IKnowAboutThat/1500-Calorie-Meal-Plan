"""Tag model — CRUD + hierarchy with cycle detection."""

from collections import deque
from db import get_connection


def get_all_tags():
    """Return full tag tree: { all: [...], roots: [...] } with recipe counts."""
    conn = get_connection()

    # All tags with recipe counts
    rows = conn.execute("""
        SELECT t.id, t.name,
               COUNT(DISTINCT rt.recipe_id) as recipe_count
        FROM tags t
        LEFT JOIN recipe_tags rt ON rt.tag_id = t.id
        GROUP BY t.id
        ORDER BY t.name
    """).fetchall()
    all_tags = [dict(r) for r in rows]

    # Hierarchy relationships
    hier_rows = conn.execute("SELECT parent_tag_id, child_tag_id FROM tag_hierarchy").fetchall()
    children_map = {}
    child_ids = set()
    for h in hier_rows:
        parent_id = h['parent_tag_id']
        child_id = h['child_tag_id']
        children_map.setdefault(parent_id, []).append(child_id)
        child_ids.add(child_id)

    # Add children info to each tag
    tag_map = {t['id']: t for t in all_tags}
    for tag in all_tags:
        tag['children'] = [tag_map[cid] for cid in children_map.get(tag['id'], []) if cid in tag_map]
        tag['parent_ids'] = []

    # Add parent info
    for h in hier_rows:
        if h['child_tag_id'] in tag_map:
            tag_map[h['child_tag_id']]['parent_ids'].append(h['parent_tag_id'])

    # Root tags = tags that are not children of anything
    roots = [t for t in all_tags if t['id'] not in child_ids]

    conn.close()
    return {'all': all_tags, 'roots': roots}


def create_tag(name):
    """Create a new tag. Returns the created tag dict."""
    conn = get_connection()
    cursor = conn.execute("INSERT INTO tags (name) VALUES (?)", (name,))
    conn.commit()
    tag_id = cursor.lastrowid
    conn.close()
    return {'id': tag_id, 'name': name, 'recipe_count': 0, 'children': [], 'parent_ids': []}


def rename_tag(tag_id, new_name):
    """Rename a tag."""
    conn = get_connection()
    conn.execute("UPDATE tags SET name = ? WHERE id = ?", (new_name, tag_id))
    conn.commit()
    conn.close()


def delete_tag(tag_id):
    """Delete a tag (CASCADE removes hierarchy and recipe_tags entries)."""
    conn = get_connection()
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()
    conn.close()


def _would_create_cycle(conn, parent_id, child_id):
    """BFS check: would adding parent_id -> child_id create a cycle?"""
    if parent_id == child_id:
        return True

    # Walk ancestors of parent_id — if we find child_id, it's a cycle
    visited = set()
    queue = deque([parent_id])
    while queue:
        current = queue.popleft()
        if current == child_id:
            return True
        if current in visited:
            continue
        visited.add(current)
        # Find parents of current
        rows = conn.execute(
            "SELECT parent_tag_id FROM tag_hierarchy WHERE child_tag_id = ?",
            (current,)
        ).fetchall()
        for r in rows:
            queue.append(r['parent_tag_id'])
    return False


def add_hierarchy(parent_tag_id, child_tag_id):
    """Add a parent-child link. Returns error string if cycle detected, else None."""
    conn = get_connection()

    if _would_create_cycle(conn, parent_tag_id, child_tag_id):
        conn.close()
        return "Adding this relationship would create a cycle"

    try:
        conn.execute(
            "INSERT OR IGNORE INTO tag_hierarchy (parent_tag_id, child_tag_id) VALUES (?, ?)",
            (parent_tag_id, child_tag_id)
        )
        conn.commit()
    finally:
        conn.close()
    return None


def remove_hierarchy(parent_tag_id, child_tag_id):
    """Remove a parent-child link."""
    conn = get_connection()
    conn.execute(
        "DELETE FROM tag_hierarchy WHERE parent_tag_id = ? AND child_tag_id = ?",
        (parent_tag_id, child_tag_id)
    )
    conn.commit()
    conn.close()


def tag_recipe(recipe_id, tag_id, parent_tag_id=0):
    """Tag a recipe with lineage context. parent_tag_id=0 means top-level."""
    conn = get_connection()
    conn.execute(
        "INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, parent_tag_id) VALUES (?, ?, ?)",
        (recipe_id, tag_id, parent_tag_id)
    )
    conn.commit()
    conn.close()


def untag_recipe(recipe_id, tag_id, parent_tag_id=0):
    """Remove a tag from a recipe."""
    conn = get_connection()
    conn.execute(
        "DELETE FROM recipe_tags WHERE recipe_id = ? AND tag_id = ? AND parent_tag_id = ?",
        (recipe_id, tag_id, parent_tag_id)
    )
    conn.commit()
    conn.close()


def get_or_create_tag(name):
    """Get a tag by name, creating it if it doesn't exist. Returns tag dict."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM tags WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if row:
        result = dict(row)
        conn.close()
        return result
    cursor = conn.execute("INSERT INTO tags (name) VALUES (?)", (name,))
    conn.commit()
    tag_id = cursor.lastrowid
    conn.close()
    return {'id': tag_id, 'name': name}
