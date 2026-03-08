"""Quick API integration test."""
import json
import time
import subprocess
import sys
import requests

BASE = "http://127.0.0.1:5001/api"

# Reset DB
import os
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'recipes.db')
if os.path.exists(db_path):
    os.remove(db_path)

from db import init_db, get_connection
init_db()

# Seed test ingredients
conn = get_connection()
conn.execute("INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, micronutrients, category) VALUES ('chicken breast', 133, 21.4, 4.78, 0, 0, '{}', 'protein')")
conn.execute("INSERT INTO ingredients (name, calories_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g, fiber_per_100g, micronutrients, category) VALUES ('broccoli', 31, 2.57, 0.34, 6.27, 2.4, '{}', 'vegetable')")
conn.commit()
conn.close()

# Start server
server = subprocess.Popen([sys.executable, "app.py"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

try:
    # Health
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    print("OK: Health check")

    # Create recipe
    r = requests.post(f"{BASE}/recipes", json={
        "name": "Test Chicken Bowl",
        "meal_type": "meal",
        "cuisine": "American",
        "main_protein": "chicken",
        "servings": 1,
        "instructions": ["Cook chicken", "Add broccoli"],
        "ingredients": [
            {"ingredient_id": 1, "amount": 150, "unit": "g"},
            {"ingredient_id": 2, "amount": 100, "unit": "g"},
        ]
    })
    assert r.status_code == 201, f"Create recipe failed: {r.status_code} {r.text}"
    recipe = r.json()
    print(f"OK: Created recipe '{recipe['name']}' (id={recipe['id']})")
    print(f"    Macros: {recipe['calories']} cal, {recipe['protein']}g pro, {recipe['fat']}g fat")

    # Verify calculated macros
    # 150g chicken: 133*1.5=199.5 cal, 21.4*1.5=32.1g pro
    # 100g broccoli: 31*1.0=31 cal, 2.57*1.0=2.57g pro
    expected_cal = round(133 * 1.5 + 31 * 1.0, 1)
    assert abs(recipe['calories'] - expected_cal) < 1, f"Calories mismatch: {recipe['calories']} vs {expected_cal}"
    print(f"    Calories verified: {recipe['calories']} == {expected_cal}")

    # Create tags
    r = requests.post(f"{BASE}/tags", json={"name": "high-protein"})
    assert r.status_code == 201
    tag1 = r.json()
    r = requests.post(f"{BASE}/tags", json={"name": "dairy-free"})
    assert r.status_code == 201
    tag2 = r.json()
    print(f"OK: Created tags '{tag1['name']}' and '{tag2['name']}'")

    # Tag recipe
    r = requests.post(f"{BASE}/recipes/1/tags", json={"tag_id": tag1['id']})
    assert r.status_code == 201
    print("OK: Tagged recipe")

    # Get recipe with tags
    r = requests.get(f"{BASE}/recipes/1")
    recipe = r.json()
    assert len(recipe['tags']) == 1
    print(f"OK: Recipe has {len(recipe['tags'])} tag(s): {[t['tag_name'] for t in recipe['tags']]}")

    # Build hierarchy
    r = requests.post(f"{BASE}/tags/hierarchy", json={"parent_tag_id": tag1['id'], "child_tag_id": tag2['id']})
    assert r.status_code == 201
    print("OK: Added hierarchy link")

    # Cycle detection
    r = requests.post(f"{BASE}/tags/hierarchy", json={"parent_tag_id": tag2['id'], "child_tag_id": tag1['id']})
    assert r.status_code == 400
    print(f"OK: Cycle detected: {r.json()['error']}")

    # Update recipe
    r = requests.put(f"{BASE}/recipes/1", json={"name": "Updated Chicken Bowl"})
    assert r.json()['name'] == "Updated Chicken Bowl"
    print("OK: Updated recipe name")

    # List ingredients
    r = requests.get(f"{BASE}/ingredients")
    assert len(r.json()) == 2
    print(f"OK: Listed {len(r.json())} ingredients")

    # Delete recipe
    r = requests.delete(f"{BASE}/recipes/1")
    assert r.status_code == 200
    r = requests.get(f"{BASE}/recipes/1")
    assert r.status_code == 404
    print("OK: Deleted recipe and verified 404")

    print("\n=== ALL TESTS PASSED ===")

finally:
    server.terminate()
    server.wait()
