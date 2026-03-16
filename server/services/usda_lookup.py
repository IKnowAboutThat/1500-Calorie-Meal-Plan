"""USDA FoodData Central API client for ingredient nutritional data."""

import json
import re
import time
import requests
from db import get_connection
from config import USDA_API_BASE, USDA_API_KEY

# Common synonyms: search term -> USDA-friendly name
SYNONYMS = {
    # Alliums
    "scallion": "onions spring or scallions",
    "scallions": "onions spring or scallions",
    "spring onion": "onions spring or scallions",
    "spring onions": "onions spring or scallions",
    "red onion": "onions red raw",
    "shallot": "shallots raw",
    "shallots": "shallots raw",
    "garlic": "garlic raw",
    # Herbs & spices
    "cilantro": "coriander cilantro leaves raw",
    "coriander": "coriander cilantro leaves raw",
    "parsley": "parsley fresh",
    "dill": "dill weed fresh",
    "mint": "spearmint fresh",
    "thai basil": "basil fresh",
    "rosemary": "rosemary fresh",
    "thyme": "thyme fresh",
    "oregano": "spices oregano dried",
    "cumin": "spices cumin seed",
    "paprika": "spices paprika",
    "turmeric": "spices turmeric ground",
    "garam masala": "spices curry powder",
    "chili powder": "spices chili powder",
    "chili flakes": "peppers hot chili red raw",
    "red chili flakes": "peppers hot chili red raw",
    "chili": "peppers hot chili red raw",
    "lemon zest": "lemon peel raw",
    "ginger": "ginger root raw",
    "galangal": "ginger root raw",
    "lemongrass": "lemon grass citronella raw",
    "kaffir lime leaf": "lemon grass citronella raw",
    "italian herbs": "spices oregano dried",
    "herbs": "spices basil dried",
    "baharat spice blend": "spices allspice ground",
    "shawarma spices": "spices cumin seed",
    "annatto powder": "spices paprika",
    "fine sea salt": "salt table",
    "cracked black pepper": "spices pepper black",
    "garlic powder": "spices garlic powder",
    "onion powder": "spices onion powder",
    "ground cumin": "spices cumin seed",
    "dried oregano": "spices oregano dried",
    # Proteins
    "ground turkey, 93% lean": "turkey ground 93 lean raw",
    "ground turkey": "turkey ground raw",
    "turkey breast, roasted": "turkey breast roasted",
    "turkey breast, sliced": "turkey breast",
    "chicken breast": "chicken breast raw",
    "chicken breast, cooked": "chicken breast raw",
    "shrimp, cooked": "shrimp cooked",
    "salmon fillet": "salmon atlantic raw",
    "canned tuna in water": "tuna light canned water drained",
    # Vegetables
    "baby spinach": "spinach raw",
    "arugula": "arugula raw",
    "bell pepper": "peppers bell red raw",
    "bell pepper, roasted": "peppers bell red raw",
    "red bell pepper": "peppers sweet red raw",
    "green bell pepper": "peppers sweet green raw",
    "zucchini": "squash summer zucchini raw",
    "zucchini noodles": "squash summer zucchini raw",
    "zucchini, roasted": "squash summer zucchini raw",
    "cauliflower rice": "cauliflower raw",
    "bok choy": "cabbage bok choy raw",
    "baby bok choy": "cabbage bok choy raw",
    "romaine lettuce": "lettuce cos romaine raw",
    "romaine": "lettuce cos romaine raw",
    "butter lettuce": "lettuce butterhead raw",
    "diced tomato": "tomatoes red raw",
    "tomato paste": "tomato paste canned",
    "eggplant, roasted": "eggplant raw",
    "broccoli, roasted": "broccoli raw",
    "shredded cabbage": "cabbage raw",
    "shredded carrot": "carrots raw",
    "sweet potato": "sweet potato raw",
    "snap peas": "peas sugar snap raw",
    "snow peas": "peas edible-podded raw",
    "jalapeño": "peppers jalapeno raw",
    # Legumes & grains
    "chickpeas": "chickpeas garbanzo",
    "chickpeas, cooked": "chickpeas cooked boiled",
    "garbanzo beans": "chickpeas garbanzo",
    "edamame, shelled": "edamame frozen prepared",
    "red lentils, cooked": "lentils cooked boiled",
    "green lentils, cooked": "lentils cooked boiled",
    "black beans, cooked": "beans black cooked boiled",
    "white beans, cooked": "beans white cooked boiled",
    "quinoa, cooked": "quinoa cooked",
    "brown rice, cooked": "rice brown cooked",
    # Oils & fats
    "olive oil": "oil olive salad or cooking",
    "sesame oil": "oil sesame salad or cooking",
    "coconut oil": "oil coconut",
    "avocado oil": "oil avocado",
    "tahini": "seeds sesame butter tahini",
    # Condiments & sauces
    "coconut aminos": "soy sauce made from soy",
    "hot sauce": "sauce hot pepper",
    "dijon mustard": "mustard prepared yellow",
    "rice vinegar": "vinegar",
    "hummus": "hummus commercial",
    "gf miso paste": "miso",
    "miso paste": "miso",
    "gf bbq sauce": "sauce barbecue",
    "gf soy sauce": "soy sauce",
    "gf teriyaki sauce": "teriyaki sauce",
    "gf fish sauce": "fish sauce",
    "fish sauce": "fish sauce",
    "gf hoisin sauce": "hoisin sauce",
    "gf tamari": "soy sauce",
    "tamari": "soy sauce",
    "gf salsa roja": "salsa ready to serve",
    "gf salsa verde": "salsa verde ready to serve",
    "gf cocktail sauce": "sauce cocktail ready to serve",
    "gf thai chili paste": "peppers hot chili red raw",
    "harissa paste": "peppers hot raw",
    "aji amarillo paste": "peppers hot raw",
    "guacamole": "avocado raw",
    # Dairy & alternatives
    "coconut yogurt": "yogurt plain whole milk",
    "light coconut milk": "coconut milk raw",
    # Other
    "avocado": "avocado raw",
    "kalamata olives": "olives ripe canned",
    "capers": "capers canned",
    "egg whites": "egg white raw fresh",
    "pickled ginger": "ginger root raw",
    "sesame seeds": "seeds sesame whole dried",
    "toasted rice": "rice white cooked",
    "fresh mango": "mango raw",
}

# Manual nutrition overrides for items USDA can't match reliably.
# Values are per 100g: (calories, protein, fat, carbs, fiber, category)
MANUAL_OVERRIDES = {
    "gf curry paste": (90, 2, 4, 12, 2, "condiment"),
    "gf tikka masala paste": (90, 2, 4, 12, 2, "condiment"),
    "gf tikka paste": (90, 2, 4, 12, 2, "condiment"),
    "gochujang": (100, 3, 1, 20, 2, "condiment"),
    "fine sea salt": (0, 0, 0, 0, 0, "spice"),
    "salt": (0, 0, 0, 0, 0, "spice"),
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
    # Remove "gf " prefix
    if name.startswith('gf '):
        name = name[3:]
    # Remove trailing quantity notes like "30ml"
    name = re.sub(r'\s+\d+\s*(?:ml|g|oz)\s*$', '', name).strip()
    # Remove trailing 's' for simple depluralization
    if name.endswith('s') and not name.endswith('ss'):
        name = name[:-1]
    return name


def _sanitize_query(query):
    """Remove characters that cause USDA API 400 errors."""
    # Remove parentheses and their contents
    query = re.sub(r'\(.*?\)', '', query).strip()
    # Remove special characters: +, —, :, etc.
    query = re.sub(r'[+—:;]', ' ', query).strip()
    # Collapse multiple spaces
    query = re.sub(r'\s+', ' ', query).strip()
    return query


def _search_usda(query, data_types="SR Legacy,Foundation", retries=3):
    """Search USDA FoodData Central API with retry on rate limit."""
    query = _sanitize_query(query)
    if not query:
        return []
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
    query_words = [w for w in query_lower.split() if len(w) > 2]
    matches = sum(1 for w in query_words if w in desc)
    score += matches * 15

    # Penalize heavily if no query words match at all
    if query_words and matches == 0:
        score -= 100

    # Prefer "raw" items
    if 'raw' in desc:
        score += 15

    # Prefer shorter descriptions (less processed/specific)
    score -= len(desc) * 0.1

    # Penalize processed/breaded/fried items
    penalties = ['breaded', 'fried', 'battered', 'infant', 'baby food', 'supplement']
    for p in penalties:
        if p in desc:
            score -= 30

    # Penalize common false-positive matches
    false_positives = ['almond paste', 'taco shell', 'mayonnaise', 'table fat']
    for fp in false_positives:
        if fp in desc and fp not in query_lower:
            score -= 200

    # Prefer Foundation data type, then SR Legacy
    if food.get('dataType') == 'Foundation':
        score += 10
    elif food.get('dataType') == 'SR Legacy':
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


def _check_manual_override(name):
    """Check if ingredient has a manual nutrition override.

    Returns (calories, protein, fat, carbs, fiber, category) or None.
    """
    name_lower = name.lower().strip()
    # Strip (GF) and similar for lookup
    cleaned = re.sub(r'\(.*?\)', '', name_lower).strip()
    return MANUAL_OVERRIDES.get(name_lower) or MANUAL_OVERRIDES.get(cleaned)


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

    # Check manual overrides
    override = _check_manual_override(name)
    if override:
        cal, protein, fat, carbs, fiber, category = override
        conn.execute("""
            INSERT INTO ingredients (name, calories_per_100g, protein_per_100g,
                                     fat_per_100g, carbs_per_100g, fiber_per_100g,
                                     micronutrients, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (name, cal, protein, fat, carbs, fiber, json.dumps({}), category))
        conn.commit()
        row = conn.execute("SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
        result = dict(row)
        conn.close()
        return result

    # Build search terms to try — synonym first (most reliable), then normalized
    searches_tried = []
    name_lower = name.lower().strip()
    # Also try with (GF) and similar stripped for synonym lookup
    cleaned_lower = re.sub(r'\(.*?\)', '', name_lower).strip()

    synonym = SYNONYMS.get(name_lower) or SYNONYMS.get(cleaned_lower)

    search_terms = []
    if synonym:
        search_terms.append(synonym)

    search_terms.append(name)

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
        max(macros.get('calories', 0), 0),
        max(macros.get('protein', 0), 0),
        max(macros.get('fat', 0), 0),
        max(macros.get('carbs', 0), 0),
        max(macros.get('fiber', 0), 0),
        json.dumps(micros),
        category,
    ))
    conn.commit()

    # Fetch back the full row
    row = conn.execute("SELECT * FROM ingredients WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    result = dict(row)
    conn.close()
    return result


# ============================================================
# Blend detection and splitting
# ============================================================

# Qualifier patterns — ingredient names matching these are NOT blends
_QUALIFIER_SUFFIXES = [
    ", cooked", ", roasted", ", shelled", ", sliced", ", raw",
    ", 93% lean", ", unsweetened", ", diced", ", chopped",
    ", ground", ", dried", ", fresh", ", frozen",
]


def is_blend(name):
    """Return True if this ingredient name is a comma-separated blend to split."""
    if ',' not in name and ':' not in name:
        return False

    lower = name.lower().strip()

    for suffix in _QUALIFIER_SUFFIXES:
        if lower.endswith(suffix):
            return False

    return True


def _clean_sub_name(name):
    """Clean a sub-ingredient name parsed from a blend."""
    name = name.strip()
    name = re.sub(r'\s*\(.*?\)', '', name).strip()  # Remove (GF) etc.
    name = re.sub(r'\s+\d+\s*(?:ml|g|oz)\s*$', '', name, flags=re.IGNORECASE).strip()
    if name:
        name = name[0].upper() + name[1:]
    return name


def split_blend(name, total_grams):
    """Split a blend ingredient into individual sub-ingredients.

    Returns a list of dicts: [{'name': str, 'amount': int, 'section': str|None}, ...]
    The amounts are integers that sum to round(total_grams).
    """
    section = None

    # Sub-recipe case: "Chimichurri sauce (GF): parsley, cilantro, ..."
    if ':' in name:
        parts = name.split(':', 1)
        section = _clean_sub_name(parts[0])
        remainder = parts[1]
    else:
        remainder = name

    sub_names = [_clean_sub_name(p) for p in remainder.split(',')]
    sub_names = [n for n in sub_names if n]

    if not sub_names:
        return []

    # Equal split with remainder distribution
    total_int = round(total_grams)
    count = len(sub_names)
    base = total_int // count
    leftover = total_int - (base * count)

    result = []
    for i, sn in enumerate(sub_names):
        amt = base + (1 if i < leftover else 0)
        result.append({'name': sn, 'amount': amt, 'section': section})

    return result


def expand_ingredient(ing):
    """Expand a parsed ingredient dict, splitting blends if needed.

    Args:
        ing: dict with 'name', 'grams_equivalent' or 'amount', optionally 'unit'

    Returns:
        List of enriched ingredient dicts ready for recipe creation.
        Each has: ingredient_id, name, amount, unit, section, calories, protein, etc.

    Raises IngredientNotFoundError if any sub-ingredient can't be found.
    """
    ing_name = ing.get('name', '')
    amount_g = ing.get('grams_equivalent', ing.get('amount', 0))
    unit = ing.get('unit', 'g')

    if not is_blend(ing_name):
        # Single ingredient — standard lookup
        usda_data = get_or_create_ingredient(ing_name)
        factor = amount_g / 100.0
        return [{
            'ingredient_id': usda_data['id'],
            'name': ing_name,
            'amount': amount_g,
            'unit': unit,
            'section': None,
            'calories_per_100g': usda_data['calories_per_100g'],
            'protein_per_100g': usda_data['protein_per_100g'],
            'fat_per_100g': usda_data['fat_per_100g'],
            'carbs_per_100g': usda_data['carbs_per_100g'],
            'fiber_per_100g': usda_data['fiber_per_100g'],
            'category': usda_data['category'],
            'calories': round((usda_data['calories_per_100g'] or 0) * factor, 1),
            'protein': round((usda_data['protein_per_100g'] or 0) * factor, 1),
            'fat': round((usda_data['fat_per_100g'] or 0) * factor, 1),
            'carbs': round((usda_data['carbs_per_100g'] or 0) * factor, 1),
            'fiber': round((usda_data['fiber_per_100g'] or 0) * factor, 1),
        }]

    # Blend — split and look up each sub-ingredient
    parts = split_blend(ing_name, amount_g)
    results = []
    for part in parts:
        usda_data = get_or_create_ingredient(part['name'])
        factor = part['amount'] / 100.0
        results.append({
            'ingredient_id': usda_data['id'],
            'name': part['name'],
            'amount': part['amount'],
            'unit': unit,
            'section': part['section'],
            'calories_per_100g': usda_data['calories_per_100g'],
            'protein_per_100g': usda_data['protein_per_100g'],
            'fat_per_100g': usda_data['fat_per_100g'],
            'carbs_per_100g': usda_data['carbs_per_100g'],
            'fiber_per_100g': usda_data['fiber_per_100g'],
            'category': usda_data['category'],
            'calories': round((usda_data['calories_per_100g'] or 0) * factor, 1),
            'protein': round((usda_data['protein_per_100g'] or 0) * factor, 1),
            'fat': round((usda_data['fat_per_100g'] or 0) * factor, 1),
            'carbs': round((usda_data['carbs_per_100g'] or 0) * factor, 1),
            'fiber': round((usda_data['fiber_per_100g'] or 0) * factor, 1),
        })

    return results
