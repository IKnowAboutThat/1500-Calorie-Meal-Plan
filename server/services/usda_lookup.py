"""USDA FoodData Central API client for ingredient nutritional data."""

import json
import re
import time
import requests
from db import get_connection
from config import USDA_API_BASE, USDA_API_KEY

# Common synonyms: search term -> USDA-friendly name
SYNONYMS = {
    "scallion": "green onion",
    "scallions": "green onion",
    "spring onion": "green onion",
    "spring onions": "green onion",
    "gf miso paste": "miso",
    "miso paste": "miso",
    "gf curry paste": "curry paste",
    "gf bbq sauce": "barbecue sauce",
    "gf soy sauce": "soy sauce",
    "coconut aminos": "soy sauce",
    "gf teriyaki sauce": "teriyaki sauce",
    "gf fish sauce": "fish sauce",
    "fish sauce": "fish sauce",
    "gf hoisin sauce": "hoisin sauce",
    "gf tamari": "soy sauce",
    "tamari": "soy sauce",
    "cilantro": "coriander leaves",
    "arugula": "rocket salad",
    "bell pepper": "sweet pepper",
    "red bell pepper": "sweet red pepper",
    "green bell pepper": "sweet green pepper",
    "zucchini": "summer squash zucchini",
    "chickpeas": "chickpea",
    "garbanzo beans": "chickpea",
    "eggplant": "eggplant",
    "snow peas": "snow peas",
    "snap peas": "sugar snap peas",
    "bok choy": "bok choy",
    "baby bok choy": "bok choy",
    "romaine lettuce": "lettuce cos romaine",
    "romaine": "lettuce cos romaine",
    "baby spinach": "spinach",
    "ground turkey, 93% lean": "ground turkey",
    "ground turkey": "ground turkey",
    "turkey breast, roasted": "turkey breast roasted",
    "turkey breast, sliced": "turkey breast",
    "chicken breast": "chicken breast",
    "shrimp, cooked": "shrimp cooked",
    "salmon fillet": "salmon atlantic",
    "canned tuna in water": "tuna canned water",
    "cauliflower rice": "cauliflower",
    "sweet potato": "sweet potato",
    "red lentils, cooked": "lentils cooked",
    "green lentils, cooked": "lentils cooked",
    "black beans, cooked": "black beans cooked",
    "white beans, cooked": "white beans cooked",
    "quinoa, cooked": "quinoa cooked",
    "brown rice, cooked": "brown rice cooked",
    "broccoli, roasted": "broccoli",
    "edamame, shelled": "edamame",
    "avocado": "avocado",
    "hummus (gf)": "hummus",
    "hummus": "hummus",
    "hot sauce": "hot sauce",
    "lime juice": "lime juice",
    "lemon juice": "lemon juice",
    "olive oil": "olive oil",
    "sesame oil": "sesame oil",
    "coconut oil": "coconut oil",
    "avocado oil": "oil avocado",
}

# USDA nutrient IDs for extraction
MACRO_NUTRIENT_IDS = {
    1008: "calories",
    2048: "calories",  # Energy (Atwater Specific Factors) — Foundation foods
    2047: "calories",  # Energy (Atwater General Factors) — Foundation foods fallback
    1003: "protein",
    1004: "fat",
    1005: "carbs",
    1079: "fiber",
}

MICRO_NUTRIENT_IDS = {
    1087: "calcium_mg",
    1089: "iron_mg",
    1090: "magnesium_mg",
    1091: "phosphorus_mg",
    1092: "potassium_mg",
    1093: "sodium_mg",
    1095: "zinc_mg",
    1098: "copper_mg",
    1101: "manganese_mg",
    1103: "selenium_mcg",
    1106: "vitamin_a_mcg",
    1109: "vitamin_e_mg",
    1162: "vitamin_c_mg",
    1165: "thiamin_mg",
    1166: "riboflavin_mg",
    1167: "niacin_mg",
    1170: "pantothenic_acid_mg",
    1175: "vitamin_b6_mg",
    1177: "folate_mcg",
    1178: "vitamin_b12_mcg",
    1180: "choline_mg",
    1185: "vitamin_k_mcg",
}


class IngredientNotFoundError(Exception):
    """Raised when an ingredient cannot be found in USDA database."""
    def __init__(self, ingredient, searches_tried):
        self.ingredient = ingredient
        self.searches_tried = searches_tried
        msg = f"Could not find '{ingredient}' in USDA database after {len(searches_tried)} search attempts"
        super().__init__(msg)


def _normalize(name):
    """Normalize ingredient name for searching."""
    name = name.lower().strip()
    # Remove parenthetical notes like "(GF)"
    name = re.sub(r'\(.*?\)', '', name).strip()
    # Remove trailing 's' for simple depluralization
    if name.endswith('s') and not name.endswith('ss'):
        name = name[:-1]
    return name


def _search_usda(query, data_types="SR Legacy,Foundation", retries=3):
    """Search USDA FoodData Central API with retry on rate limit."""
    params = {
        'api_key': USDA_API_KEY,
        'query': query,
        'dataType': data_types,
        'pageSize': 25,
    }
    for attempt in range(retries):
        resp = requests.get(f"{USDA_API_BASE}foods/search", params=params, timeout=10)
        if resp.status_code == 429:
            wait = 2 ** attempt * 10  # 10s, 20s, 40s
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        data = resp.json()
        return data.get('foods', [])
    # All retries exhausted
    return []


def _score_result(food, query):
    """Score a USDA search result for relevance to the query.

    Higher score = better match. Prefers raw/plain items over processed.
    """
    desc = food.get('description', '').lower()
    query_lower = query.lower()
    score = 0

    # Exact match bonus
    if desc == query_lower:
        score += 100

    # Query words all present in description
    query_words = query_lower.split()
    matches = sum(1 for w in query_words if w in desc)
    score += matches * 10

    # Prefer "raw" items
    if 'raw' in desc:
        score += 15

    # Prefer shorter descriptions (less processed/specific)
    score -= len(desc) * 0.1

    # Penalize processed/breaded/fried items
    penalties = ['breaded', 'fried', 'battered', 'frozen', 'canned', 'dried',
                 'oil,', 'infant', 'baby food', 'supplement', 'powder']
    for p in penalties:
        if p in desc:
            score -= 20

    # Prefer Foundation data type
    if food.get('dataType') == 'Foundation':
        score += 5

    return score


def _best_usda_match(results, query):
    """Pick the best match from USDA search results using scoring."""
    if not results:
        return None
    scored = [(r, _score_result(r, query)) for r in results]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0]


def _extract_nutrients(food):
    """Extract macro and micronutrients from a USDA food item."""
    nutrients = {}
    micros = {}
    # Track calorie source priority: 2048 > 2047 > 1008
    calorie_priority = {2048: 3, 2047: 2, 1008: 1}
    calorie_source_priority = 0

    for n in food.get('foodNutrients', []):
        nid = n.get('nutrientId') or n.get('nutrientNumber')
        if nid in MACRO_NUTRIENT_IDS:
            key = MACRO_NUTRIENT_IDS[nid]
            if key == "calories":
                priority = calorie_priority.get(nid, 0)
                if priority > calorie_source_priority:
                    calorie_source_priority = priority
                    nutrients["calories"] = n.get('value', 0)
            else:
                nutrients[key] = n.get('value', 0)
        elif nid in MICRO_NUTRIENT_IDS:
            micros[MICRO_NUTRIENT_IDS[nid]] = n.get('value', 0)

    return nutrients, micros


def _guess_category(name, food=None):
    """Guess ingredient category from name."""
    name_lower = name.lower()
    if any(p in name_lower for p in ['chicken', 'turkey', 'beef', 'pork', 'shrimp', 'salmon',
                                      'tuna', 'fish', 'cod', 'tilapia', 'tofu', 'tempeh']):
        return 'protein'
    if any(g in name_lower for g in ['rice', 'quinoa', 'oat', 'bread', 'pasta', 'tortilla']):
        return 'grain'
    if any(v in name_lower for v in ['spinach', 'broccoli', 'cauliflower', 'pepper', 'tomato',
                                      'onion', 'garlic', 'zucchini', 'carrot', 'lettuce',
                                      'kale', 'cucumber', 'cabbage', 'bok choy', 'eggplant']):
        return 'vegetable'
    if any(f in name_lower for f in ['apple', 'banana', 'berry', 'mango', 'orange', 'lemon',
                                      'lime', 'avocado']):
        return 'fruit'
    if any(l in name_lower for l in ['lentil', 'bean', 'chickpea', 'edamame']):
        return 'legume'
    if any(o in name_lower for o in ['oil', 'butter', 'ghee']):
        return 'fat'
    if any(s in name_lower for s in ['sauce', 'paste', 'vinegar', 'mustard', 'mayo']):
        return 'condiment'
    if any(sp in name_lower for sp in ['salt', 'pepper', 'cumin', 'paprika', 'turmeric',
                                        'oregano', 'basil', 'thyme', 'cinnamon', 'ginger',
                                        'garlic', 'cilantro', 'parsley', 'garam masala']):
        return 'spice'
    if any(d in name_lower for d in ['milk', 'yogurt', 'cheese', 'cream']):
        return 'dairy'
    if 'nut' in name_lower or 'seed' in name_lower or 'almond' in name_lower:
        return 'nuts_seeds'
    if 'sweet potato' in name_lower or 'potato' in name_lower:
        return 'starch'
    return 'other'


def get_or_create_ingredient(name):
    """Look up or create a canonical ingredient with USDA nutritional data.

    Returns a dict with the ingredient record including full nutrition.
    Raises IngredientNotFoundError if USDA lookup fails.
    """
    conn = get_connection()

    # Check cache first
    row = conn.execute("SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if row:
        result = dict(row)
        conn.close()
        return result

    # Build search terms to try
    searches_tried = []
    name_lower = name.lower().strip()
    synonym = SYNONYMS.get(name_lower)

    search_terms = [name]
    if synonym and synonym.lower() != name_lower:
        search_terms.append(synonym)

    normalized = _normalize(name)
    if normalized not in [t.lower() for t in search_terms]:
        search_terms.append(normalized)

    # Try partial: last meaningful word
    words = normalized.split()
    if len(words) > 1:
        search_terms.append(words[-1])

    # Search USDA
    best_match = None
    for term in search_terms:
        searches_tried.append(term)
        try:
            results = _search_usda(term)
            if results:
                best_match = _best_usda_match(results, term)
                break
        except requests.RequestException:
            continue

    if not best_match:
        conn.close()
        raise IngredientNotFoundError(name, searches_tried)

    # Extract nutrients
    macros, micros = _extract_nutrients(best_match)
    category = _guess_category(name, best_match)

    # Insert into DB
    conn.execute("""
        INSERT INTO ingredients (name, usda_fdc_id, calories_per_100g, protein_per_100g,
                                 fat_per_100g, carbs_per_100g, fiber_per_100g,
                                 micronutrients, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name,
        best_match.get('fdcId'),
        macros.get('calories', 0),
        macros.get('protein', 0),
        macros.get('fat', 0),
        macros.get('carbs', 0),
        macros.get('fiber', 0),
        json.dumps(micros),
        category,
    ))
    conn.commit()

    # Fetch back the full row
    row = conn.execute("SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    result = dict(row)
    conn.close()
    return result
