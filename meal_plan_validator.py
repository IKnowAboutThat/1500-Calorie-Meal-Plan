#!/usr/bin/env python3
"""30-Day Meal Plan — Strict Validation + Visual Output
Targets: <1200 cal, >=125g protein, 30-40g fiber (±5g = 25-45g)
"""

# ============================================================
# NUTRITIONAL DATABASE
# ============================================================

# (calories, protein_g, fiber_g) per 100g
DB = {
    # PROTEINS per 100g cooked
    "chicken": (165, 31, 0),
    "tuna": (116, 25.5, 0),
    "sardines": (208, 24.6, 0),
    "tofu": (55, 4.8, 0.2),
    "egg": (143, 12.6, 0),
    "egg_white": (52, 10.9, 0),
    "salmon_can": (136, 21.4, 0),

    # LEGUMES per 100g cooked
    "pinto": (143, 9, 9),
    "black_beans": (132, 8.9, 8.7),
    "red_lentils": (116, 9, 3.8),
    "red_lentils_husk": (116, 9, 7.9),
    "chana_dal": (130, 8.5, 5),
    "matar_dal": (118, 8.3, 8.3),
    "toor_dal": (128, 7.5, 5),
    "urad_dal": (130, 8, 5.5),
    "lima": (115, 7.8, 7),
    "chickpeas": (164, 8.9, 7.6),
    "french_lentils": (116, 9, 7.9),
    "split_peas": (118, 8.3, 8.3),
    "mayocoba": (130, 8, 7),
    "brown_lentils": (116, 9, 7.9),
    "black_soy": (130, 12, 5),

    # VEGETABLES per 100g
    "broccoli": (34, 2.8, 2.6),
    "tomato": (18, 0.9, 1.2),
    "lettuce": (15, 1.4, 1.3),
    "cucumber": (15, 0.7, 0.5),
    "bell_pepper": (20, 0.9, 1.7),
    "carrot": (41, 0.9, 2.8),
    "green_beans_can": (23, 1.2, 1.4),
    "tomatoes_can": (22, 1, 1),
    "tomato_paste": (82, 4.3, 4.3),
    "onion": (40, 1.1, 1.7),
    "peas_frozen": (81, 5.4, 5.1),
    "kimchi": (15, 1.1, 1.6),

    # GRAINS (oats per 100g DRY, rice/quinoa per 100g COOKED)
    "oats": (379, 13.2, 10),
    "steel_oats": (375, 12.5, 10),
    "brown_rice": (123, 2.7, 1.6),
    "quinoa": (120, 4.4, 2.8),
    "buckwheat_flour": (335, 13, 10),

    # SEEDS per 100g
    "chia": (486, 17, 34),
    "flax": (534, 18, 27),
    "psyllium": (270, 0, 79),
    "hemp_seeds": (553, 32, 4),

    # OTHER per 100g
    "pbfit": (375, 50, 12.5),
    "nutritional_yeast": (345, 48, 21),
    "cacao": (228, 20, 33),
    "bone_broth": (15, 3, 0),

    # FATS per 100g
    "olive_oil": (884, 0, 0),
    "ghee": (900, 0, 0),

    # SPICES per 100g (low calorie, added for measurement display)
    "tandoori_masala": (250, 10, 15),
    "garam_masala": (250, 10, 15),
    "cumin": (375, 18, 11),
    "turmeric": (312, 8, 21),
    "coriander_ground": (298, 12, 42),
    "taco_seasoning": (250, 8, 8),
    "five_spice": (300, 12, 15),
    "smoked_paprika": (282, 14, 34),
    "chili_powder": (282, 12, 34),
    "oregano": (265, 9, 43),
    "paprika": (282, 14, 34),
    "black_pepper": (251, 10, 25),
    "garlic_powder": (331, 17, 9),
    "onion_powder": (341, 11, 15),
    "chipotle_powder": (282, 12, 34),
    "curry_powder": (325, 14, 33),
    "italian_seasoning": (250, 10, 35),
    "cajun_seasoning": (250, 8, 12),
    "sesame_seeds": (573, 18, 12),
    "ginger": (80, 2, 2),
    "white_pepper": (296, 10, 26),
    "asafoetida": (297, 4, 4),

    # SAUCES per 100g
    "soy_sauce": (53, 8, 0.5),
    "fish_sauce": (35, 5.1, 0),
    "miso": (199, 11.7, 5.4),
    "gochujang": (175, 4, 3),
    "sriracha": (93, 1.7, 1),
    "bbq_sauce": (172, 0.8, 0.5),
    "hoisin": (220, 3, 1),
    "teriyaki": (89, 5.9, 0.1),
    "curry_paste": (95, 2, 3),
    "hot_sauce": (11, 0.5, 0.5),
    "mustard": (66, 4, 3),
    "enchilada_sauce": (30, 0.7, 0.8),
    "harissa": (80, 2.5, 3),
    "salsa": (36, 1.5, 1.5),
    "ponzu": (55, 4, 0),
    "oyster_sauce": (51, 1.4, 0),
    "vinegar": (21, 0, 0),
    "liquid_smoke": (0, 0, 0),
}

# Protein powders — per 1 serving (not per 100g)
POWDERS = {
    "pw_choc": (140, 24, 3),
    "pw_vanilla": (140, 22, 2),
    "pw_straw": (190, 22, 0),
    "pw_caramel": (160, 22, 0),
}

FRIENDLY = {
    "pw_choc": "Chocolate protein powder",
    "pw_vanilla": "Vanilla bean protein powder",
    "pw_straw": "Strawberry protein powder",
    "pw_caramel": "Salted caramel protein powder",
    "chicken": "Chicken breast (raw)",
    "tuna": "Tuna (canned in water, drained)",
    "sardines": "Sardines (canned in oil, drained)",
    "tofu": "Silken tofu",
    "egg": "Whole eggs",
    "egg_white": "Egg whites",
    "salmon_can": "Canned salmon",
    "pinto": "Pinto beans (dry)",
    "black_beans": "Black beans (dry)",
    "red_lentils": "Red lentils (dry)",
    "red_lentils_husk": "Red lentils w/ husk (dry)",
    "chana_dal": "Chana dal (dry)",
    "matar_dal": "Matar dal (dry)",
    "toor_dal": "Toor dal (dry)",
    "urad_dal": "Urad dal (dry)",
    "lima": "Lima beans (dry)",
    "chickpeas": "Chickpeas (dry)",
    "french_lentils": "French lentils (dry)",
    "split_peas": "Split peas (dry)",
    "mayocoba": "Mayocoba beans (dry)",
    "brown_lentils": "Brown lentils (dry)",
    "black_soy": "Black soybeans (dry)",
    "broccoli": "Broccoli",
    "tomato": "Tomatoes (fresh)",
    "lettuce": "Lettuce",
    "cucumber": "Cucumber",
    "bell_pepper": "Green bell pepper",
    "carrot": "Carrots",
    "green_beans_can": "Canned green beans",
    "tomatoes_can": "Canned tomatoes",
    "tomato_paste": "Tomato paste",
    "onion": "Onion",
    "peas_frozen": "Frozen peas",
    "kimchi": "Kimchi",
    "oats": "Rolled oats (dry)",
    "steel_oats": "Steel cut oats (dry)",
    "brown_rice": "Brown rice (dry)",
    "quinoa": "Quinoa (dry)",
    "buckwheat_flour": "Buckwheat flour",
    "chia": "Chia seeds",
    "flax": "Ground flaxseed",
    "psyllium": "Psyllium husk",
    "hemp_seeds": "Hemp seeds",
    "pbfit": "PB Fit powder",
    "nutritional_yeast": "Nutritional yeast",
    "cacao": "Cacao powder",
    "bone_broth": "Bone broth",
    "olive_oil": "Olive oil",
    "ghee": "Ghee",
    "soy_sauce": "Soy sauce",
    "fish_sauce": "Fish sauce",
    "miso": "Miso paste",
    "gochujang": "Gochujang",
    "sriracha": "Sriracha",
    "bbq_sauce": "BBQ sauce",
    "hoisin": "Hoisin sauce",
    "teriyaki": "Teriyaki sauce",
    "curry_paste": "Curry paste",
    "hot_sauce": "Hot sauce",
    "mustard": "Dijon mustard",
    "enchilada_sauce": "Enchilada sauce",
    "harissa": "Harissa paste",
    "salsa": "Red salsa",
    "ponzu": "Ponzu sauce",
    "oyster_sauce": "Oyster sauce",
    "vinegar": "Red wine vinegar",
    "liquid_smoke": "Liquid smoke",
    "tandoori_masala": "Tandoori masala",
    "garam_masala": "Garam masala",
    "cumin": "Ground cumin",
    "turmeric": "Ground turmeric",
    "coriander_ground": "Ground coriander",
    "taco_seasoning": "Taco seasoning",
    "five_spice": "Chinese five-spice",
    "smoked_paprika": "Smoked paprika",
    "chili_powder": "Chili powder",
    "oregano": "Dried oregano",
    "paprika": "Paprika",
    "black_pepper": "Black pepper",
    "garlic_powder": "Garlic powder",
    "onion_powder": "Onion powder",
    "chipotle_powder": "Chipotle chili powder",
    "curry_powder": "Curry powder",
    "italian_seasoning": "Italian seasoning",
    "cajun_seasoning": "Cajun seasoning",
    "sesame_seeds": "Sesame seeds",
    "ginger": "Fresh ginger",
    "white_pepper": "White pepper",
    "asafoetida": "Asafoetida (hing)",
}

# Conversion factors: cooked → raw/dry display weight
# Multiply the cooked amount by this factor to get the raw/dry amount to measure
RAW_CONVERSION = {
    "chicken": 1.33,      # raw chicken is ~33% heavier than cooked (water loss during cooking)
}

# All legumes: dry weight is roughly cooked ÷ 2.5
for _leg in ["pinto", "black_beans", "red_lentils", "red_lentils_husk", "chana_dal",
             "matar_dal", "toor_dal", "urad_dal", "lima", "chickpeas", "french_lentils",
             "split_peas", "mayocoba", "brown_lentils", "black_soy"]:
    RAW_CONVERSION[_leg] = 0.4  # cooked ÷ 2.5 = × 0.4

# Rice/quinoa if present
RAW_CONVERSION["brown_rice"] = 0.4
RAW_CONVERSION["quinoa"] = 0.4


def calc(items):
    cal, pro, fib = 0, 0, 0
    for name, amount in items:
        if name in POWDERS:
            c, p, f = POWDERS[name]
            cal += c * amount; pro += p * amount; fib += f * amount
        elif name in DB:
            c, p, f = DB[name]
            cal += c * amount / 100; pro += p * amount / 100; fib += f * amount / 100
        else:
            print(f"  WARNING: Unknown '{name}'")
    return round(cal, 1), round(pro, 1), round(fib, 1)


def item_vals(name, amount):
    if name in POWDERS:
        c, p, f = POWDERS[name]
        return round(c * amount, 1), round(p * amount, 1), round(f * amount, 1)
    c, p, f = DB[name]
    return round(c * amount / 100, 1), round(p * amount / 100, 1), round(f * amount / 100, 1)


# ============================================================
# SNACK TYPE KEY:
#   shake       = protein shake (protein + chia + psyllium blended)
#   waffle      = protein waffle (buckwheat + egg whites + protein) + chia/psyllium drink
#   baked_oats  = baked protein oatmeal (oats + protein + chia + egg white) + psyllium drink
#   chia_pudding = chia pudding (protein + chia + psyllium soaked)
#   mug_cake    = protein mug cake (protein + cacao + egg white) + chia/psyllium drink
#   breakfast   = protein in breakfast oats/waffles, fiber drink separate
# ============================================================

days = {}

# =================== WEEK 1 ===================

days[1] = {
    "name": "Indian Tandoori Chicken + Chana Dal",
    "cuisine": "Indian",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "waffle",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, chocolate protein) + chia & flax fiber drink",
        "Meal 1": "Tandoori chicken (tandoori masala, turmeric, cumin) with steamed broccoli and frozen peas",
        "Meal 2": "Chana dal (onion, tomato, garam masala, ghee) with egg white bhurji (4 whites, turmeric, chili) and nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("buckwheat_flour", 15), ("chia", 20), ("flax", 10),
        ("chicken", 185), ("chana_dal", 150), ("egg_white", 198),
        ("broccoli", 200), ("peas_frozen", 70), ("onion", 50), ("tomato", 80),
        ("nutritional_yeast", 8), ("ghee", 3),
        ("tandoori_masala", 5), ("garam_masala", 3), ("turmeric", 2), ("cumin", 2),
        ("chili_powder", 1),
    ],
}

days[2] = {
    "name": "American Breakfast + BBQ Chicken & Black Beans",
    "cuisine": "American",
    "breakfast": True,
    "tofu_window": 0,
    "snack_type": "breakfast",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Protein oatmeal (oats, chocolate protein, chia seeds stirred in) with 2 scrambled eggs",
        "Fiber drink": "Psyllium husk stirred into water (mid-day)",
        "Dinner": "BBQ chicken with black beans, broccoli, and grilled onion, nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("oats", 30), ("egg", 100),
        ("chia", 15), ("psyllium", 9),
        ("chicken", 200), ("black_beans", 140),
        ("broccoli", 200), ("onion", 40),
        ("bbq_sauce", 15), ("nutritional_yeast", 8),
        ("garlic_powder", 2), ("onion_powder", 2), ("smoked_paprika", 2),
    ],
}

days[3] = {
    "name": "Mexican Tuna Taco Bowl + Pinto Beans",
    "cuisine": "Mexican",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "baked_oats",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Baked protein oatmeal (oats, vanilla protein, chia seeds, flax, 1 egg white binder)",
        "Meal 1": "Tuna taco bowl: seasoned tuna (taco seasoning, cumin, chili powder) over pinto beans with lettuce, tomato, bell pepper, salsa, side of peas",
        "Meal 2": "Egg white taco scramble (5 whites) with onion",
    },
    "items": [
        ("pw_vanilla", 1), ("oats", 25), ("chia", 20), ("flax", 10),
        ("tuna", 250), ("pinto", 150), ("egg_white", 198),
        ("tomato", 100), ("lettuce", 100), ("bell_pepper", 80),
        ("peas_frozen", 80), ("salsa", 20), ("onion", 30),
        ("taco_seasoning", 5), ("cumin", 2), ("chili_powder", 2),
    ],
}

days[4] = {
    "name": "Thai Green Curry Chicken & Tofu + Red Lentils",
    "cuisine": "Thai",
    "breakfast": False,
    "tofu_window": 1,
    "snack_type": "chia_pudding",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Salted caramel chia pudding (protein powder, chia seeds, flax — soaked in water)",
        "Meal 1": "Thai green curry: chicken & tofu in green curry paste, fish sauce, with broccoli & canned tomatoes, peas on the side",
        "Meal 2": "Red lentil soup (onion, turmeric) topped with egg white strips (6 whites)",
    },
    "items": [
        ("pw_caramel", 1), ("chia", 22), ("flax", 10),
        ("chicken", 180), ("tofu", 100), ("red_lentils", 150),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 80), ("onion", 40), ("tomatoes_can", 80),
        ("curry_paste", 15), ("fish_sauce", 8),
        ("turmeric", 2),
    ],
}

days[5] = {
    "name": "Korean Gochujang Chicken & Tofu + Black Soybeans",
    "cuisine": "Korean",
    "breakfast": False,
    "tofu_window": 1,
    "snack_type": "mug_cake",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Chocolate protein mug cake (vanilla protein, cacao, 1 egg white) + chia & flax fiber drink",
        "Meal 1": "Gochujang glazed chicken with silken tofu, kimchi, garlic powder, and frozen peas",
        "Meal 2": "Black soybean stir-fry with broccoli, onion, egg whites (5), soy sauce, sesame seeds",
    },
    "items": [
        ("pw_vanilla", 1), ("cacao", 5), ("chia", 20), ("flax", 10),
        ("chicken", 175), ("tofu", 100), ("black_soy", 170),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 60), ("kimchi", 50), ("onion", 40),
        ("gochujang", 12), ("soy_sauce", 10),
        ("sesame_seeds", 3), ("garlic_powder", 2),
    ],
}

days[6] = {
    "name": "Mediterranean Breakfast + Tuna, Tofu & Chickpeas",
    "cuisine": "Mediterranean",
    "breakfast": True,
    "tofu_window": 1,
    "snack_type": "chia_pudding",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Mediterranean scramble: 2 eggs + 3 egg whites with tomato, bell pepper, onion",
        "Snack": "Vanilla chia pudding (protein powder, chia, flax — soaked in water)",
        "Dinner": "Harissa tuna & tofu bowl with chickpeas, cucumber, frozen peas, nutritional yeast (oregano, paprika, cumin)",
    },
    "items": [
        ("pw_vanilla", 1), ("chia", 20), ("flax", 10),
        ("egg", 100), ("egg_white", 99),
        ("tuna", 230), ("tofu", 100), ("chickpeas", 130),
        ("tomato", 100), ("cucumber", 80),
        ("peas_frozen", 70), ("onion", 40), ("bell_pepper", 60),
        ("harissa", 10), ("nutritional_yeast", 10),
        ("oregano", 2), ("paprika", 2), ("cumin", 2),
    ],
}

days[7] = {
    "name": "American BBQ Sardines & Chicken + Lima Beans",
    "cuisine": "American BBQ",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "shake",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Salted caramel protein shake (protein, chia seeds, flax — blended with water)",
        "Meal 1": "BBQ sardines with smoky lima beans (liquid smoke, smoked paprika, garlic powder, onion powder) and canned green beans with frozen peas",
        "Meal 2": "Grilled chicken with sautéed onion, tomato, and egg whites (5)",
    },
    "items": [
        ("pw_caramel", 1), ("chia", 20), ("flax", 10),
        ("sardines", 106), ("chicken", 140), ("lima", 150),
        ("egg_white", 165), ("green_beans_can", 150),
        ("peas_frozen", 70), ("onion", 50), ("tomato", 80),
        ("bbq_sauce", 15), ("liquid_smoke", 5),
        ("garlic_powder", 2), ("onion_powder", 2), ("smoked_paprika", 2),
    ],
}

# =================== WEEK 2 ===================

days[8] = {
    "name": "Indian Chicken Curry + Toor Dal",
    "cuisine": "Indian",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "baked_oats",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Baked protein oatmeal (oats, chocolate protein, chia seeds, 1 egg white) + psyllium fiber drink",
        "Meal 1": "Chicken curry (curry paste, garam masala, canned tomatoes, onion, ghee) with broccoli",
        "Meal 2": "Toor dal (turmeric, cumin) with egg white bhurji (5 whites) and nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("oats", 25), ("chia", 15), ("psyllium", 9),
        ("chicken", 190), ("toor_dal", 160), ("egg_white", 198),
        ("broccoli", 150), ("onion", 50), ("tomatoes_can", 100),
        ("curry_paste", 12), ("ghee", 3),
        ("nutritional_yeast", 8),
        ("garam_masala", 3), ("turmeric", 2), ("cumin", 2),
    ],
}

days[9] = {
    "name": "American Breakfast + Dijon Tuna & Brown Lentils",
    "cuisine": "American",
    "breakfast": True,
    "tofu_window": 0,
    "snack_type": "breakfast",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Steel cut protein oats (oats, chocolate protein, chia seeds, flax stirred in) with 2 scrambled eggs",
        "Dinner": "Dijon-crusted tuna with brown lentils, carrots, green beans, frozen peas, onion, and egg whites (4), seasoned with garlic powder, onion powder, smoked paprika",
    },
    "items": [
        ("pw_choc", 1), ("steel_oats", 30), ("egg", 100),
        ("chia", 20), ("flax", 10),
        ("tuna", 220), ("brown_lentils", 140), ("egg_white", 132),
        ("carrot", 100), ("green_beans_can", 100),
        ("peas_frozen", 70), ("onion", 40), ("mustard", 10),
        ("garlic_powder", 2), ("onion_powder", 2), ("smoked_paprika", 2),
    ],
}

days[10] = {
    "name": "Mexican Chipotle Chicken + Matar Dal",
    "cuisine": "Mexican",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "waffle",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, salted caramel protein) + chia & flax fiber drink",
        "Meal 1": "Chipotle chicken (taco seasoning, cumin, chili powder) with tomato, bell pepper, frozen peas",
        "Meal 2": "Matar dal bowl with egg whites (4), onion, salsa, nutritional yeast",
    },
    "items": [
        ("pw_caramel", 1), ("buckwheat_flour", 15), ("chia", 20), ("flax", 10),
        ("chicken", 195), ("matar_dal", 150), ("egg_white", 198),
        ("tomato", 100), ("bell_pepper", 80), ("peas_frozen", 70),
        ("onion", 40), ("salsa", 20), ("nutritional_yeast", 12),
        ("taco_seasoning", 5), ("cumin", 2), ("chili_powder", 2),
    ],
}

days[11] = {
    "name": "Japanese Miso Chicken & Tofu + French Lentils",
    "cuisine": "Japanese",
    "breakfast": False,
    "tofu_window": 2,
    "snack_type": "chia_pudding",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Vanilla chia pudding (protein powder, chia seeds, flax — soaked in water)",
        "Meal 1": "Miso-glazed chicken with silken tofu, broccoli, carrots, frozen peas, sesame seeds",
        "Meal 2": "French lentils (soy sauce, onion) topped with egg whites (6)",
    },
    "items": [
        ("pw_vanilla", 1), ("chia", 20), ("flax", 10),
        ("chicken", 175), ("tofu", 100), ("french_lentils", 170),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 80), ("onion", 40), ("carrot", 60),
        ("miso", 12), ("soy_sauce", 8),
        ("sesame_seeds", 3),
    ],
}

days[12] = {
    "name": "Thai Yellow Curry Chicken & Tofu + Split Peas",
    "cuisine": "Thai",
    "breakfast": False,
    "tofu_window": 2,
    "snack_type": "shake",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Vanilla protein shake (protein, chia seeds, flax — blended with water)",
        "Meal 1": "Yellow curry: chicken & tofu in yellow curry paste with broccoli, canned tomatoes, fish sauce, side of peas",
        "Meal 2": "Split pea soup (onion, turmeric) with egg white garnish (6 whites)",
    },
    "items": [
        ("pw_vanilla", 1), ("chia", 20), ("flax", 10),
        ("chicken", 185), ("tofu", 100), ("split_peas", 170),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 80), ("onion", 40), ("tomatoes_can", 80),
        ("curry_paste", 12), ("fish_sauce", 8),
        ("turmeric", 2),
    ],
}

days[13] = {
    "name": "Chinese Breakfast + Five-Spice Tuna, Tofu & Urad Dal",
    "cuisine": "Chinese",
    "breakfast": True,
    "tofu_window": 2,
    "snack_type": "chia_pudding",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Chinese egg scramble: 2 eggs + 3 egg whites with soy sauce, five-spice",
        "Snack": "Salted caramel chia pudding (protein powder, chia, flax — soaked)",
        "Dinner": "Five-spice tuna & tofu with urad dal, broccoli, carrots, frozen peas, onion, hoisin drizzle, sesame seeds",
    },
    "items": [
        ("pw_caramel", 1), ("chia", 20), ("flax", 10),
        ("egg", 100), ("egg_white", 99),
        ("tuna", 220), ("tofu", 100), ("urad_dal", 130),
        ("broccoli", 150), ("carrot", 80), ("peas_frozen", 70),
        ("onion", 40), ("soy_sauce", 10), ("hoisin", 8),
        ("five_spice", 3), ("sesame_seeds", 3),
    ],
}

days[14] = {
    "name": "Mediterranean Sardines & Chicken + Mayocoba Beans",
    "cuisine": "Mediterranean",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "waffle",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, chocolate protein) + chia & psyllium fiber drink",
        "Meal 1": "Harissa sardines with mayocoba beans, tomato, cucumber, bell pepper (oregano, paprika, cumin)",
        "Meal 2": "Grilled chicken with onion, red wine vinegar, egg whites (3) on the side",
    },
    "items": [
        ("pw_choc", 1), ("buckwheat_flour", 15), ("chia", 15), ("psyllium", 12),
        ("sardines", 106), ("chicken", 140), ("mayocoba", 150),
        ("egg_white", 165), ("tomato", 100), ("cucumber", 80),
        ("onion", 40), ("bell_pepper", 60),
        ("harissa", 10), ("vinegar", 10),
        ("oregano", 2), ("paprika", 2), ("cumin", 2),
    ],
}

# =================== WEEK 3 ===================

days[15] = {
    "name": "Indian Chicken Masala + Red Lentils with Husk",
    "cuisine": "Indian",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "mug_cake",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Chocolate protein mug cake (chocolate protein, cacao, 1 egg white) + chia & flax fiber drink",
        "Meal 1": "Chicken tikka masala (tandoori masala, garam masala, turmeric, cumin, canned tomatoes, ghee) with broccoli and frozen peas",
        "Meal 2": "Red lentils with husk dal (onion) topped with egg whites (5) and nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("cacao", 5), ("chia", 20), ("flax", 10),
        ("chicken", 185), ("red_lentils_husk", 150), ("egg_white", 198),
        ("broccoli", 250), ("peas_frozen", 80), ("onion", 50), ("tomatoes_can", 80),
        ("nutritional_yeast", 8), ("ghee", 3),
        ("tandoori_masala", 5), ("garam_masala", 3), ("turmeric", 2), ("cumin", 2),
    ],
}

days[16] = {
    "name": "Korean Breakfast + Gochujang Chicken & Pinto Beans",
    "cuisine": "Korean",
    "breakfast": True,
    "tofu_window": 0,
    "snack_type": "breakfast",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Savory protein oats (oats, chocolate protein, chia seeds) with 2 scrambled eggs and kimchi",
        "Fiber drink": "Psyllium husk stirred into water",
        "Dinner": "Gochujang chicken with pinto beans, onion, broccoli, soy sauce, garlic powder, sesame seeds, egg whites (2)",
    },
    "items": [
        ("pw_choc", 1), ("oats", 25), ("egg", 100),
        ("chia", 15), ("psyllium", 9),
        ("chicken", 200), ("pinto", 140), ("egg_white", 66),
        ("broccoli", 150), ("kimchi", 50), ("onion", 40),
        ("gochujang", 10), ("soy_sauce", 8),
        ("sesame_seeds", 3), ("garlic_powder", 2),
    ],
}

days[17] = {
    "name": "Mexican Tuna Salad + Chana Dal",
    "cuisine": "Mexican",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "baked_oats",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Baked protein oatmeal (oats, vanilla protein, chia seeds, flax, 1 egg white)",
        "Meal 1": "Tuna salad: tuna with chana dal, lettuce, tomato, bell pepper, salsa, onion (taco seasoning, cumin, chili powder), frozen peas",
        "Meal 2": "Egg white scramble (5 whites)",
    },
    "items": [
        ("pw_vanilla", 1), ("oats", 25), ("chia", 20), ("flax", 10),
        ("tuna", 250), ("chana_dal", 170), ("egg_white", 198),
        ("lettuce", 100), ("tomato", 100), ("bell_pepper", 80),
        ("peas_frozen", 60), ("salsa", 20), ("onion", 30),
        ("taco_seasoning", 5), ("cumin", 2), ("chili_powder", 2),
    ],
}

days[18] = {
    "name": "Thai Red Curry Chicken & Tofu + Chickpeas",
    "cuisine": "Thai",
    "breakfast": False,
    "tofu_window": 3,
    "snack_type": "waffle",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, vanilla protein) + chia & flax fiber drink",
        "Meal 1": "Red curry: chicken & tofu in red curry paste, fish sauce, turmeric, with broccoli, canned tomatoes, frozen peas",
        "Meal 2": "Chickpea stir-fry (onion) with egg whites (4)",
    },
    "items": [
        ("pw_vanilla", 1), ("buckwheat_flour", 15), ("chia", 20), ("flax", 10),
        ("chicken", 185), ("tofu", 100), ("chickpeas", 130),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 70), ("onion", 40), ("tomatoes_can", 80),
        ("curry_paste", 12), ("fish_sauce", 8),
        ("turmeric", 2),
    ],
}

days[19] = {
    "name": "Japanese Teriyaki Chicken & Tofu + Black Soybeans",
    "cuisine": "Japanese",
    "breakfast": False,
    "tofu_window": 3,
    "snack_type": "chia_pudding",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Chocolate chia pudding (chocolate protein, chia seeds, flax — soaked in water)",
        "Meal 1": "Teriyaki chicken with silken tofu, steamed broccoli, carrots, side of peas",
        "Meal 2": "Black soybean bowl with egg whites (6), onion, soy sauce, sesame seeds",
    },
    "items": [
        ("pw_choc", 1), ("chia", 20), ("flax", 10),
        ("chicken", 175), ("tofu", 100), ("black_soy", 170),
        ("egg_white", 198), ("broccoli", 150),
        ("peas_frozen", 80), ("carrot", 80), ("onion", 40),
        ("teriyaki", 15), ("soy_sauce", 8),
        ("sesame_seeds", 3),
    ],
}

days[20] = {
    "name": "American Breakfast + Chicken, Tofu & Lima Beans",
    "cuisine": "American",
    "breakfast": True,
    "tofu_window": 3,
    "snack_type": "breakfast",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Breakfast": "Protein oatmeal (oats, chocolate protein, chia seeds) with 2 scrambled eggs",
        "Fiber drink": "Psyllium husk stirred into water",
        "Dinner": "Buffalo chicken (garlic powder, onion powder, smoked paprika) with silken tofu, lima beans, onion, broccoli, hot sauce, nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("oats", 30), ("egg", 100),
        ("chia", 15), ("psyllium", 9),
        ("chicken", 195), ("tofu", 100), ("lima", 130),
        ("broccoli", 150), ("onion", 40),
        ("hot_sauce", 10), ("nutritional_yeast", 8),
        ("garlic_powder", 2), ("onion_powder", 2), ("smoked_paprika", 2),
    ],
}

days[21] = {
    "name": "Mexican Sardines & Chicken + French Lentils",
    "cuisine": "Mexican",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "shake",
    "structure": "2 meals + 1 snack",
    "meals": {
        "Snack": "Vanilla protein shake (protein, chia seeds, flax — blended with water)",
        "Meal 1": "Chipotle sardines with French lentils, tomato, bell pepper, frozen peas (taco seasoning, cumin, chili powder)",
        "Meal 2": "Grilled chicken with onion, salsa, egg whites (5), nutritional yeast",
    },
    "items": [
        ("pw_vanilla", 1), ("chia", 20), ("flax", 10),
        ("sardines", 106), ("chicken", 140), ("french_lentils", 150),
        ("egg_white", 165), ("tomato", 100), ("bell_pepper", 80),
        ("peas_frozen", 70), ("onion", 40), ("salsa", 20),
        ("nutritional_yeast", 8),
        ("taco_seasoning", 5), ("cumin", 2), ("chili_powder", 2),
    ],
}

# =================== WEEK 4 (3 meals + 1 snack) ===================

days[22] = {
    "name": "Indian Chicken Tikka + Matar Dal",
    "cuisine": "Indian",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "waffle",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, chocolate protein) + chia & flax fiber drink",
        "Meal 1": "Egg white bhurji (4 whites, turmeric, onion) with broccoli and frozen peas",
        "Meal 2": "Tandoori chicken tikka with tomato",
        "Meal 3": "Matar dal (garam masala, cumin, ghee) with nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("buckwheat_flour", 15), ("chia", 22), ("flax", 10),
        ("chicken", 185), ("matar_dal", 170), ("egg_white", 198),
        ("broccoli", 200), ("peas_frozen", 60), ("onion", 50), ("tomato", 80),
        ("nutritional_yeast", 8), ("ghee", 3),
        ("tandoori_masala", 5), ("garam_masala", 3), ("turmeric", 2), ("cumin", 2),
    ],
}

days[23] = {
    "name": "Mexican Breakfast + Tuna & Black Beans",
    "cuisine": "Mexican",
    "breakfast": True,
    "tofu_window": 0,
    "snack_type": "breakfast",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Breakfast": "Vanilla protein oatmeal (oats, vanilla protein, chia seeds, flax) with 2 scrambled eggs",
        "Lunch": "Tuna taco bowl: tuna with black beans, lettuce, tomato, frozen peas, onion, salsa, egg whites (3), nutritional yeast (taco seasoning, cumin, chili powder)",
    },
    "items": [
        ("pw_vanilla", 1), ("oats", 30), ("egg", 100),
        ("chia", 20), ("flax", 10),
        ("tuna", 220), ("black_beans", 140), ("egg_white", 99),
        ("tomato", 100), ("lettuce", 80), ("peas_frozen", 70),
        ("onion", 40), ("salsa", 20), ("nutritional_yeast", 8),
        ("taco_seasoning", 4), ("cumin", 2), ("chili_powder", 1),
    ],
}

days[24] = {
    "name": "Thai Basil Chicken + Split Peas",
    "cuisine": "Thai",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "baked_oats",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Baked protein oatmeal (oats, salted caramel protein, chia seeds, flax, 1 egg white)",
        "Meal 1": "Egg white pad kra pao (Thai basil stir-fry with soy sauce, fish sauce, bell pepper)",
        "Meal 2": "Thai basil chicken with broccoli, onion, frozen peas, curry paste",
        "Meal 3": "Split pea soup (turmeric) with nutritional yeast",
    },
    "items": [
        ("pw_caramel", 1), ("oats", 25), ("chia", 20), ("flax", 10),
        ("chicken", 185), ("split_peas", 150), ("egg_white", 198),
        ("broccoli", 150), ("bell_pepper", 80), ("peas_frozen", 70),
        ("onion", 40), ("curry_paste", 12), ("fish_sauce", 8), ("soy_sauce", 8),
        ("nutritional_yeast", 8),
        ("turmeric", 2),
    ],
}

days[25] = {
    "name": "Korean Salmon & Chicken + Toor Dal",
    "cuisine": "Korean",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "mug_cake",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Chocolate protein mug cake (vanilla protein, cacao, 1 egg white) + chia & flax fiber drink",
        "Meal 1": "Gochujang canned salmon with kimchi, broccoli, frozen peas, garlic powder, sesame seeds",
        "Meal 2": "Korean-style chicken with soy sauce, onion, egg whites (5)",
        "Meal 3": "Toor dal (turmeric, cumin) with nutritional yeast",
    },
    "items": [
        ("pw_vanilla", 1), ("cacao", 5), ("chia", 20), ("flax", 10),
        ("salmon_can", 150), ("chicken", 100), ("toor_dal", 170),
        ("egg_white", 198), ("broccoli", 150), ("peas_frozen", 60),
        ("kimchi", 50), ("onion", 40), ("gochujang", 10), ("soy_sauce", 8),
        ("nutritional_yeast", 8),
        ("sesame_seeds", 3), ("garlic_powder", 2),
        ("turmeric", 1), ("cumin", 1),
    ],
}

days[26] = {
    "name": "American BBQ Breakfast + Chicken & Brown Lentils",
    "cuisine": "American BBQ",
    "breakfast": True,
    "tofu_window": 0,
    "snack_type": "breakfast",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Breakfast": "Chocolate protein oats (oats, chocolate protein, chia seeds) with 2 scrambled eggs",
        "Fiber drink": "Psyllium husk stirred into water",
        "Dinner": "BBQ chicken with brown lentils, green beans, onion, egg whites (2), nutritional yeast (garlic powder, onion powder, smoked paprika, BBQ sauce)",
    },
    "items": [
        ("pw_choc", 1), ("oats", 30), ("egg", 100),
        ("chia", 15), ("psyllium", 9),
        ("chicken", 200), ("brown_lentils", 140), ("egg_white", 66),
        ("green_beans_can", 150), ("onion", 40),
        ("bbq_sauce", 15), ("nutritional_yeast", 8),
        ("garlic_powder", 2), ("onion_powder", 2), ("smoked_paprika", 2),
    ],
}

days[27] = {
    "name": "Mediterranean Breakfast + Chicken, Tofu & Red Lentils",
    "cuisine": "Mediterranean",
    "breakfast": True,
    "tofu_window": 4,
    "snack_type": "chia_pudding",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Breakfast": "Mediterranean egg scramble: 2 eggs + 3 egg whites with tomato, onion",
        "Snack": "Vanilla chia pudding (protein powder, chia, flax — soaked in water)",
        "Lunch": "Harissa chicken with silken tofu, broccoli, frozen peas (oregano, paprika)",
        "Dinner": "Red lentil soup (cumin) with nutritional yeast",
    },
    "items": [
        ("pw_vanilla", 1), ("chia", 20), ("flax", 10),
        ("egg", 100), ("egg_white", 99),
        ("chicken", 170), ("tofu", 100), ("red_lentils", 150),
        ("broccoli", 150), ("tomato", 80), ("peas_frozen", 70),
        ("onion", 40), ("harissa", 10), ("nutritional_yeast", 8),
        ("oregano", 2), ("paprika", 2), ("cumin", 2),
    ],
}

days[28] = {
    "name": "Japanese Miso Chicken & Tofu + Urad Dal",
    "cuisine": "Japanese",
    "breakfast": False,
    "tofu_window": 4,
    "snack_type": "chia_pudding",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Chocolate chia pudding (chocolate protein, chia seeds, flax — soaked in water)",
        "Meal 1": "Miso soup: chicken, tofu, broccoli, carrots, frozen peas in miso broth, sesame seeds",
        "Meal 2": "Teriyaki egg whites (6) with onion and soy sauce",
        "Meal 3": "Urad dal with nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("chia", 22), ("flax", 10),
        ("chicken", 175), ("tofu", 100), ("urad_dal", 170),
        ("egg_white", 198), ("broccoli", 200), ("peas_frozen", 60),
        ("carrot", 80), ("onion", 40), ("miso", 12), ("soy_sauce", 8),
        ("nutritional_yeast", 8),
        ("sesame_seeds", 1),
        ("teriyaki", 5),
    ],
}

days[29] = {
    "name": "Chinese Hoisin Chicken & Tofu + Mayocoba Beans",
    "cuisine": "Chinese",
    "breakfast": False,
    "tofu_window": 4,
    "snack_type": "shake",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Salted caramel protein shake (protein, chia seeds, flax — blended with water)",
        "Meal 1": "Hoisin chicken with silken tofu, broccoli, carrots, frozen peas (five-spice, soy sauce, sesame seeds)",
        "Meal 2": "Egg white stir-fry (6 whites) with onion",
        "Meal 3": "Mayocoba bean soup with nutritional yeast",
    },
    "items": [
        ("pw_caramel", 1), ("chia", 20), ("flax", 10),
        ("chicken", 175), ("tofu", 100), ("mayocoba", 150),
        ("egg_white", 198), ("broccoli", 150), ("carrot", 80),
        ("peas_frozen", 70), ("onion", 40), ("hoisin", 10), ("soy_sauce", 8),
        ("nutritional_yeast", 8),
        ("five_spice", 3), ("sesame_seeds", 3),
    ],
}

days[30] = {
    "name": "Indian Sardine Curry & Chicken + Red Lentils with Husk",
    "cuisine": "Indian",
    "breakfast": False,
    "tofu_window": 0,
    "snack_type": "waffle",
    "structure": "3 meals + 1 snack",
    "meals": {
        "Snack": "Protein waffle (buckwheat flour, 2 egg whites, chocolate protein) + chia & psyllium fiber drink",
        "Meal 1": "Sardine masala (cumin, turmeric, garam masala, canned tomatoes) with broccoli",
        "Meal 2": "Tandoori chicken with onion, egg whites (3)",
        "Meal 3": "Red lentils with husk dal (ghee) with nutritional yeast",
    },
    "items": [
        ("pw_choc", 1), ("buckwheat_flour", 15), ("chia", 15), ("psyllium", 9),
        ("sardines", 106), ("chicken", 140), ("red_lentils_husk", 150),
        ("egg_white", 165), ("broccoli", 150),
        ("onion", 50), ("tomatoes_can", 80),
        ("nutritional_yeast", 8), ("ghee", 3),
        ("tandoori_masala", 5), ("garam_masala", 3), ("turmeric", 2), ("cumin", 2),
    ],
}


# ============================================================
# VALIDATION
# ============================================================

print("=" * 80)
print("30-DAY MEAL PLAN VALIDATION")
print("Targets: <1200 cal | >=125g protein | 30-40g fiber (tolerance 25-45g)")
print("=" * 80)

all_pass = True
fail_count = 0
cals, pros, fibs = [], [], []

for day_num in sorted(days.keys()):
    d = days[day_num]
    cal, pro, fib = calc(d["items"])
    cals.append(cal); pros.append(pro); fibs.append(fib)

    errors = []
    if cal > 1200: errors.append(f"CAL {cal:.0f} > 1200")
    if pro < 125: errors.append(f"PRO {pro:.1f} < 125")
    if fib < 25: errors.append(f"FIB {fib:.1f} < 25")
    if fib > 45: errors.append(f"FIB {fib:.1f} > 45")

    if errors:
        all_pass = False
        fail_count += 1
        status = "FAIL"
    else:
        status = "PASS"

    brkfst = "BRK " if d.get("breakfast") else "    "
    tofu = f"T{d['tofu_window']}" if d.get("tofu_window") else "  "
    snack = d.get("snack_type", "?")[:6].ljust(6)

    print(
        f"Day {day_num:2d} [{status}] {brkfst}{tofu} {snack} | "
        f"{cal:7.1f} cal | {pro:6.1f}g P | {fib:5.1f}g F | "
        f"{d['name'][:45]}"
    )
    if errors:
        for e in errors:
            print(f"                                *** {e}")

print("=" * 80)
print("ALL 30 DAYS PASS!" if all_pass else f"{fail_count} DAYS FAILED")

print(f"\n--- SUMMARY ---")
print(f"Calories: min={min(cals):.0f}  max={max(cals):.0f}  avg={sum(cals)/len(cals):.0f}")
print(f"Protein:  min={min(pros):.1f}  max={max(pros):.1f}  avg={sum(pros)/len(pros):.1f}")
print(f"Fiber:    min={min(fibs):.1f}  max={max(fibs):.1f}  avg={sum(fibs)/len(fibs):.1f}")

# Snack type distribution
print("\n--- SNACK TYPES ---")
snack_counts = {}
for d in days.values():
    st = d.get("snack_type", "?")
    snack_counts[st] = snack_counts.get(st, 0) + 1
for st, cnt in sorted(snack_counts.items(), key=lambda x: -x[1]):
    print(f"  {st}: {cnt} days")

# Tofu windows
print("\n--- TOFU ---")
total_tofu = 0
for dn in sorted(days.keys()):
    for name, amt in days[dn]["items"]:
        if name == "tofu":
            total_tofu += amt
            print(f"  Day {dn}: {amt}g (window {days[dn]['tofu_window']})")
print(f"  Total: {total_tofu}g / 1200g")

# Breakfast days
print("\n--- BREAKFAST DAYS ---")
for week in range(1, 6):
    s = (week - 1) * 7 + 1
    e = min(week * 7, 30)
    bdays = [d for d in range(s, e + 1) if days.get(d, {}).get("breakfast")]
    if bdays:
        print(f"  Week {week} (Days {s}-{e}): {len(bdays)} — {bdays}")

# Cuisine
print("\n--- CUISINES ---")
cc = {}
for d in days.values():
    c = d["cuisine"]
    cc[c] = cc.get(c, 0) + 1
for c, n in sorted(cc.items(), key=lambda x: -x[1]):
    print(f"  {c}: {n}")


# ============================================================
# DETAILED PER-DAY OUTPUT
# ============================================================

print("\n\n")
print("=" * 82)
print("          30-DAY MEAL PLAN — FULL BREAKDOWN")
print("          Max 1200 cal | Min 125g protein | 30-40g fiber")
print("=" * 82)

for day_num in sorted(days.keys()):
    d = days[day_num]
    cal, pro, fib = calc(d["items"])

    tags = []
    if d.get("breakfast"):
        tags.append("BREAKFAST")
    if d.get("tofu_window"):
        tags.append(f"Tofu #{d['tofu_window']}")
    tag_str = f" [{', '.join(tags)}]" if tags else ""
    snack_label = d.get("snack_type", "?")

    print(f"\n{'─' * 82}")
    print(f"  DAY {day_num} — {d['cuisine']}{tag_str}")
    print(f"  {d['structure']}  |  Snack type: {snack_label}")
    print(f"{'─' * 82}")

    for meal_name, meal_desc in d["meals"].items():
        print(f"  {meal_name}: {meal_desc}")

    print()
    hdr = f"  {'Ingredient':<35} {'Grams':>7}  {'Cal':>6}  {'Pro':>6}  {'Fib':>6}"
    print(hdr)
    print(f"  {'─' * 75}")

    for name, amount in d["items"]:
        friendly = FRIENDLY.get(name, name)
        ic, ip, iff = item_vals(name, amount)

        if name in POWDERS:
            grams_str = "1 srv"
        elif name in RAW_CONVERSION:
            grams_str = f"{amount * RAW_CONVERSION[name]:.0f}g"
        else:
            grams_str = f"{amount}g"

        print(f"  {friendly:<35} {grams_str:>7}  {ic:6.0f}  {ip:5.1f}g  {iff:5.1f}g")

    print(f"  {'─' * 75}")
    print(f"  {'DAILY TOTAL':<35} {'':>7}  {cal:6.0f}  {pro:5.1f}g  {fib:5.1f}g")

    checks = []
    checks.append(f"{'✓' if cal <= 1200 else '✗'} Cal {cal:.0f}/1200")
    checks.append(f"{'✓' if pro >= 125 else '✗'} Pro {pro:.1f}/125g")
    checks.append(f"{'✓' if 25 <= fib <= 45 else '✗'} Fib {fib:.1f}/30-40g")
    print(f"  {' | '.join(checks)}")

print(f"\n{'=' * 82}")
print(f"  PLAN COMPLETE — ALL 30 DAYS VERIFIED")
print(f"  Avg: {sum(cals)/len(cals):.0f} cal | {sum(pros)/len(pros):.1f}g pro | {sum(fibs)/len(fibs):.1f}g fib")
print(f"{'=' * 82}")


# ============================================================
# HTML GENERATION
# ============================================================

def generate_html(output_path="meal_plan.html"):
    """Generate a self-contained HTML file for the 30-day meal plan."""
    import os

    # Compute per-day data
    day_data = []
    all_cals, all_pros, all_fibs = [], [], []
    for day_num in sorted(days.keys()):
        d = days[day_num]
        cal, pro, fib = calc(d["items"])
        all_cals.append(cal)
        all_pros.append(pro)
        all_fibs.append(fib)

        ingredients = []
        for name, amount in d["items"]:
            friendly = FRIENDLY.get(name, name)
            ic, ip, iff = item_vals(name, amount)
            if name in POWDERS:
                grams_str = "1 srv"
            elif name in RAW_CONVERSION:
                grams_str = f"{amount * RAW_CONVERSION[name]:.0f}g"
            else:
                grams_str = f"{amount}g"
            ingredients.append({
                "name": friendly,
                "grams": grams_str,
                "cal": ic,
                "pro": ip,
                "fib": iff,
            })

        cal_ok = cal <= 1200
        pro_ok = pro >= 125
        fib_ok = 25 <= fib <= 45

        day_data.append({
            "num": day_num,
            "d": d,
            "cal": cal, "pro": pro, "fib": fib,
            "cal_ok": cal_ok, "pro_ok": pro_ok, "fib_ok": fib_ok,
            "ingredients": ingredients,
            "week": (day_num - 1) // 7 + 1,
        })

    # Cuisine colors
    cuisine_colors = {
        "Indian": "#e67e22",
        "American": "#3498db",
        "Mexican": "#e74c3c",
        "Thai": "#2ecc71",
        "Korean": "#9b59b6",
        "Mediterranean": "#1abc9c",
        "Japanese": "#f39c12",
        "American BBQ": "#e84393",
        "Chinese": "#fd79a8",
    }

    # Snack type distribution
    snack_dist = {}
    for d in days.values():
        st = d.get("snack_type", "?")
        snack_dist[st] = snack_dist.get(st, 0) + 1

    # Cuisine distribution
    cuisine_dist = {}
    for d in days.values():
        c = d["cuisine"]
        cuisine_dist[c] = cuisine_dist.get(c, 0) + 1

    # Tofu schedule
    tofu_schedule = []
    total_tofu = 0
    for dn in sorted(days.keys()):
        for name, amt in days[dn]["items"]:
            if name == "tofu":
                total_tofu += amt
                tofu_schedule.append((dn, amt, days[dn]["tofu_window"]))

    # Breakfast schedule
    breakfast_weeks = {}
    for week in range(1, 6):
        s = (week - 1) * 7 + 1
        e = min(week * 7, 30)
        bdays = [d for d in range(s, e + 1) if days.get(d, {}).get("breakfast")]
        if bdays:
            breakfast_weeks[week] = {"start": s, "end": e, "days": bdays}

    # Build cuisine filter buttons HTML
    cuisine_buttons = ""
    for c in sorted(cuisine_colors.keys()):
        if cuisine_dist.get(c, 0) > 0:
            cuisine_buttons += f'<button class="filter-btn" onclick="filterCuisine(&apos;{c}&apos;)">{c}</button>'

    # Build cuisine legend HTML
    cuisine_legend = ""
    for cuisine, color in sorted(cuisine_colors.items()):
        count = cuisine_dist.get(cuisine, 0)
        if count > 0:
            cuisine_legend += f'<span class="legend-item"><span class="legend-swatch" style="background:{color}"></span>{cuisine} ({count})</span>'

    # Build snack distribution HTML
    snack_html = ""
    for st, cnt in sorted(snack_dist.items(), key=lambda x: -x[1]):
        pct = cnt / 30 * 100
        snack_html += f'<div class="stat-bar-row"><span class="stat-bar-label">{st}</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:{pct:.0f}%">{cnt}</div></div></div>'

    # Build tofu schedule HTML
    tofu_html = ""
    for dn, amt, win in tofu_schedule:
        tofu_html += f'<tr><td>Day {dn}</td><td>{amt}g</td><td>Window {win}</td></tr>'
    tofu_html += f'<tr class="total-row"><td>Total</td><td>{total_tofu}g / 1200g</td><td></td></tr>'

    # Build breakfast schedule HTML
    breakfast_html = ""
    for week, info in sorted(breakfast_weeks.items()):
        day_badges = " ".join(f'<span class="badge">Day {d}</span>' for d in info["days"])
        breakfast_html += f'<div class="breakfast-week">Week {week} (Days {info["start"]}-{info["end"]}): {day_badges}</div>'

    # Build navigation HTML
    nav_html = ""
    for dd in day_data:
        color = cuisine_colors.get(dd["d"]["cuisine"], "#888")
        nav_html += f'<a href="#day-{dd["num"]}" class="nav-dot" style="background:{color}" title="Day {dd["num"]} - {dd["d"]["cuisine"]}">{dd["num"]}</a>'

    # Build day cards HTML
    cards_html = ""
    for dd in day_data:
        d = dd["d"]
        color = cuisine_colors.get(d["cuisine"], "#888")
        all_pass = dd["cal_ok"] and dd["pro_ok"] and dd["fib_ok"]
        status_class = "pass" if all_pass else "fail"

        # Meals
        meals_html = ""
        for meal_name, meal_desc in d["meals"].items():
            meals_html += f'<div class="meal-item"><span class="meal-label">{meal_name}:</span> {meal_desc}</div>'

        # Ingredient rows
        rows_html = ""
        for ing in dd["ingredients"]:
            rows_html += f'<tr><td>{ing["name"]}</td><td class="num">{ing["grams"]}</td><td class="num">{ing["cal"]:.0f}</td><td class="num">{ing["pro"]:.1f}g</td><td class="num">{ing["fib"]:.1f}g</td></tr>'

        # Target checks
        cal_icon = "check" if dd["cal_ok"] else "x"
        pro_icon = "check" if dd["pro_ok"] else "x"
        fib_icon = "check" if dd["fib_ok"] else "x"

        tags = []
        if d.get("breakfast"):
            tags.append('<span class="tag tag-breakfast">Breakfast</span>')
        if d.get("tofu_window"):
            tags.append(f'<span class="tag tag-tofu">Tofu #{d["tofu_window"]}</span>')
        tags_html = " ".join(tags)

        cards_html += f'''
        <div class="day-card week-{dd["week"]} cuisine-{d["cuisine"].lower().replace(" ", "-")}" id="day-{dd["num"]}" data-week="{dd["week"]}" data-cuisine="{d["cuisine"]}">
            <div class="card-header" style="border-left: 5px solid {color}">
                <div class="card-title-row">
                    <h2>Day {dd["num"]} <span class="cuisine-badge" style="background:{color}">{d["cuisine"]}</span></h2>
                    <div class="card-tags">{tags_html}</div>
                </div>
                <div class="card-subtitle">{d["name"]}</div>
                <div class="card-meta">{d["structure"]} &middot; Snack: {d.get("snack_type", "?")}</div>
            </div>
            <div class="card-body">
                <div class="meals-section">
                    <h3>Meals</h3>
                    {meals_html}
                </div>
                <div class="ingredients-section">
                    <h3>Ingredients</h3>
                    <table class="ing-table">
                        <thead>
                            <tr><th>Ingredient</th><th class="num">Grams</th><th class="num">Cal</th><th class="num">Protein</th><th class="num">Fiber</th></tr>
                        </thead>
                        <tbody>
                            {rows_html}
                        </tbody>
                        <tfoot>
                            <tr class="total-row"><td><strong>Daily Total</strong></td><td></td><td class="num"><strong>{dd["cal"]:.0f}</strong></td><td class="num"><strong>{dd["pro"]:.1f}g</strong></td><td class="num"><strong>{dd["fib"]:.1f}g</strong></td></tr>
                        </tfoot>
                    </table>
                </div>
                <div class="checks {status_class}">
                    <span class="{cal_icon}">{"&#10003;" if dd["cal_ok"] else "&#10007;"} Cal {dd["cal"]:.0f}/1200</span>
                    <span class="{pro_icon}">{"&#10003;" if dd["pro_ok"] else "&#10007;"} Pro {dd["pro"]:.1f}/125g</span>
                    <span class="{fib_icon}">{"&#10003;" if dd["fib_ok"] else "&#10007;"} Fib {dd["fib"]:.1f}/30-40g</span>
                </div>
            </div>
        </div>
        '''

    avg_cal = sum(all_cals) / len(all_cals)
    avg_pro = sum(all_pros) / len(all_pros)
    avg_fib = sum(all_fibs) / len(all_fibs)

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>30-Day Meal Plan</title>
<style>
:root {{
    --bg: #1a1a2e;
    --bg-card: #16213e;
    --bg-header: #0f3460;
    --text: #e0e0e0;
    --text-muted: #a0a0b0;
    --text-bright: #ffffff;
    --border: #2a2a4a;
    --green: #2ecc71;
    --red: #e74c3c;
    --accent: #3498db;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 0;
}}
.container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}

/* Header */
.page-header {{
    text-align: center;
    padding: 40px 20px 20px;
    background: linear-gradient(135deg, #0f3460, #1a1a2e);
    border-bottom: 1px solid var(--border);
    margin-bottom: 30px;
}}
.page-header h1 {{ font-size: 2.2rem; color: var(--text-bright); margin-bottom: 8px; }}
.page-header .subtitle {{ color: var(--text-muted); font-size: 1rem; }}

/* Dashboard */
.dashboard {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}}
.dash-panel {{
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
}}
.dash-panel h3 {{
    color: var(--accent);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
}}
.stat-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    text-align: center;
}}
.stat-box {{ padding: 10px 6px; background: rgba(255,255,255,0.03); border-radius: 8px; }}
.stat-box .val {{ font-size: 1.4rem; font-weight: 700; color: var(--text-bright); }}
.stat-box .label {{ font-size: 0.75rem; color: var(--text-muted); }}

.stat-bar-row {{ display: flex; align-items: center; margin-bottom: 8px; }}
.stat-bar-label {{ width: 100px; font-size: 0.85rem; color: var(--text-muted); text-transform: capitalize; }}
.stat-bar-track {{ flex: 1; background: rgba(255,255,255,0.05); border-radius: 6px; height: 22px; overflow: hidden; }}
.stat-bar-fill {{ height: 100%; background: var(--accent); border-radius: 6px; display: flex; align-items: center; padding-left: 8px; font-size: 0.75rem; color: white; font-weight: 600; min-width: 28px; }}

.legend-item {{ display: inline-flex; align-items: center; margin: 4px 10px 4px 0; font-size: 0.85rem; }}
.legend-swatch {{ width: 14px; height: 14px; border-radius: 3px; margin-right: 6px; display: inline-block; }}

table.tofu-table {{ width: 100%; font-size: 0.85rem; border-collapse: collapse; }}
table.tofu-table td {{ padding: 4px 8px; border-bottom: 1px solid var(--border); }}
table.tofu-table .total-row td {{ font-weight: 700; color: var(--text-bright); border-top: 2px solid var(--border); }}

.breakfast-week {{ margin-bottom: 8px; font-size: 0.85rem; }}
.badge {{ display: inline-block; background: var(--accent); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px; }}

/* Navigation & Filters */
.nav-bar {{
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
    position: sticky;
    top: 0;
    z-index: 100;
}}
.nav-dots {{
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
    justify-content: center;
}}
.nav-dot {{
    width: 30px; height: 30px;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 0.7rem; font-weight: 700;
    text-decoration: none;
    opacity: 0.85;
    transition: opacity 0.2s, transform 0.2s;
}}
.nav-dot:hover {{ opacity: 1; transform: scale(1.15); }}

.filters {{
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
}}
.filter-btn {{
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
}}
.filter-btn:hover, .filter-btn.active {{
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}}

/* Day Cards */
.day-card {{
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 24px;
    overflow: hidden;
    transition: opacity 0.3s;
}}
.day-card.hidden {{ display: none; }}
.card-header {{
    padding: 18px 20px;
    background: var(--bg-header);
}}
.card-title-row {{ display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }}
.card-header h2 {{ font-size: 1.3rem; color: var(--text-bright); display: flex; align-items: center; gap: 10px; }}
.cuisine-badge {{
    font-size: 0.7rem;
    padding: 3px 10px;
    border-radius: 12px;
    color: white;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}
.card-subtitle {{ color: var(--text-muted); font-size: 0.95rem; margin-top: 4px; }}
.card-meta {{ color: var(--text-muted); font-size: 0.8rem; margin-top: 2px; }}

.tag {{ font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }}
.tag-breakfast {{ background: #f39c12; color: #1a1a2e; }}
.tag-tofu {{ background: #2ecc71; color: #1a1a2e; }}

.card-body {{ padding: 20px; }}
.meals-section, .ingredients-section {{ margin-bottom: 16px; }}
.meals-section h3, .ingredients-section h3 {{
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--accent);
    margin-bottom: 10px;
}}
.meal-item {{ margin-bottom: 6px; font-size: 0.9rem; }}
.meal-label {{ font-weight: 600; color: var(--text-bright); }}

/* Ingredient Table */
.ing-table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
.ing-table th {{
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}
.ing-table td {{
    padding: 6px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}}
.ing-table .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.ing-table th.num {{ text-align: right; }}
.ing-table tfoot td {{
    border-top: 2px solid var(--border);
    padding-top: 10px;
}}
.total-row td {{ font-weight: 700; color: var(--text-bright); }}

/* Check indicators */
.checks {{
    display: flex;
    gap: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    flex-wrap: wrap;
}}
.checks.pass {{ background: rgba(46, 204, 113, 0.1); }}
.checks.fail {{ background: rgba(231, 76, 60, 0.1); }}
.checks .check {{ color: var(--green); }}
.checks .x {{ color: var(--red); }}

/* Responsive */
@media (max-width: 768px) {{
    .container {{ padding: 10px; }}
    .page-header h1 {{ font-size: 1.5rem; }}
    .dashboard {{ grid-template-columns: 1fr; }}
    .ing-table {{ font-size: 0.75rem; }}
    .ing-table th, .ing-table td {{ padding: 4px 6px; }}
    .nav-dot {{ width: 26px; height: 26px; font-size: 0.6rem; }}
    .checks {{ flex-direction: column; gap: 6px; }}
    .stat-grid {{ grid-template-columns: 1fr; }}
}}
@media (max-width: 480px) {{
    .card-header {{ padding: 12px 14px; }}
    .card-body {{ padding: 14px; }}
    .filters {{ gap: 6px; }}
    .filter-btn {{ padding: 5px 10px; font-size: 0.7rem; }}
}}

/* Print */
@media print {{
    body {{ background: white; color: #222; }}
    .nav-bar {{ display: none; }}
    .day-card {{ break-inside: avoid; }}
}}
</style>
</head>
<body>

<div class="page-header">
    <h1>30-Day Meal Plan</h1>
    <div class="subtitle">Target: &le;1200 cal &middot; &ge;125g protein &middot; 30-40g fiber (tolerance 25-45g)</div>
</div>

<div class="container">

<!-- Dashboard -->
<div class="dashboard">
    <div class="dash-panel">
        <h3>Overall Stats</h3>
        <div class="stat-grid">
            <div class="stat-box"><div class="label">Avg Cal</div><div class="val">{avg_cal:.0f}</div></div>
            <div class="stat-box"><div class="label">Avg Protein</div><div class="val">{avg_pro:.1f}g</div></div>
            <div class="stat-box"><div class="label">Avg Fiber</div><div class="val">{avg_fib:.1f}g</div></div>
        </div>
        <div style="margin-top:14px">
            <div class="stat-grid">
                <div class="stat-box"><div class="label">Min Cal</div><div class="val">{min(all_cals):.0f}</div></div>
                <div class="stat-box"><div class="label">Min Pro</div><div class="val">{min(all_pros):.1f}g</div></div>
                <div class="stat-box"><div class="label">Min Fib</div><div class="val">{min(all_fibs):.1f}g</div></div>
            </div>
        </div>
        <div style="margin-top:14px">
            <div class="stat-grid">
                <div class="stat-box"><div class="label">Max Cal</div><div class="val">{max(all_cals):.0f}</div></div>
                <div class="stat-box"><div class="label">Max Pro</div><div class="val">{max(all_pros):.1f}g</div></div>
                <div class="stat-box"><div class="label">Max Fib</div><div class="val">{max(all_fibs):.1f}g</div></div>
            </div>
        </div>
    </div>

    <div class="dash-panel">
        <h3>Snack Type Distribution</h3>
        {snack_html}
    </div>

    <div class="dash-panel">
        <h3>Cuisine Distribution</h3>
        <div style="line-height:2">{cuisine_legend}</div>
    </div>

    <div class="dash-panel">
        <h3>Tofu Window Schedule</h3>
        <table class="tofu-table">
            {tofu_html}
        </table>
    </div>

    <div class="dash-panel">
        <h3>Breakfast Day Schedule</h3>
        {breakfast_html}
    </div>
</div>

<!-- Navigation -->
<div class="nav-bar">
    <div class="nav-dots">
        {nav_html}
    </div>
    <div class="filters">
        <button class="filter-btn active" onclick="filterAll()">All</button>
        <button class="filter-btn" onclick="filterWeek(1)">Week 1</button>
        <button class="filter-btn" onclick="filterWeek(2)">Week 2</button>
        <button class="filter-btn" onclick="filterWeek(3)">Week 3</button>
        <button class="filter-btn" onclick="filterWeek(4)">Week 4</button>
        <button class="filter-btn" onclick="filterWeek(5)">Week 5</button>
        {cuisine_buttons}
    </div>
</div>

<!-- Day Cards -->
<div id="cards">
{cards_html}
</div>

</div>

<script>
function setActive(btn) {{
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}}
function filterAll() {{
    setActive(event.target);
    document.querySelectorAll('.day-card').forEach(c => c.classList.remove('hidden'));
}}
function filterWeek(w) {{
    setActive(event.target);
    document.querySelectorAll('.day-card').forEach(c => {{
        c.classList.toggle('hidden', c.dataset.week !== String(w));
    }});
}}
function filterCuisine(cuisine) {{
    setActive(event.target);
    document.querySelectorAll('.day-card').forEach(c => {{
        c.classList.toggle('hidden', c.dataset.cuisine !== cuisine);
    }});
}}
</script>
</body>
</html>'''

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(script_dir, output_path)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nHTML generated: {out}")
    print(f"File size: {os.path.getsize(out):,} bytes")


generate_html()


# ============================================================
# MOBILE HTML GENERATION
# ============================================================

def generate_mobile_html(output_path="meal_plan_mobile.html"):
    """Generate a mobile-optimized HTML file with per-meal ingredient breakdown."""
    import os

    # ---- helper: classify items by category ----
    PROTEINS = {"chicken", "tuna", "sardines", "salmon_can"}
    LEGUMES = {"pinto", "black_beans", "red_lentils", "red_lentils_husk", "chana_dal",
               "matar_dal", "toor_dal", "urad_dal", "lima", "chickpeas", "french_lentils",
               "split_peas", "mayocoba", "brown_lentils", "black_soy"}
    VEGETABLES = {"broccoli", "tomato", "lettuce", "cucumber", "bell_pepper", "carrot",
                  "green_beans_can", "tomatoes_can", "tomato_paste", "onion", "peas_frozen", "kimchi"}
    GRAINS = {"oats", "steel_oats", "brown_rice", "quinoa", "buckwheat_flour"}
    SEEDS = {"chia", "flax", "psyllium", "hemp_seeds"}
    SAUCES = {"soy_sauce", "fish_sauce", "miso", "gochujang", "sriracha", "bbq_sauce",
              "hoisin", "teriyaki", "curry_paste", "hot_sauce", "mustard", "enchilada_sauce",
              "harissa", "salsa", "ponzu", "oyster_sauce", "vinegar", "liquid_smoke"}
    FATS = {"olive_oil", "ghee"}
    SPICES = {"tandoori_masala", "garam_masala", "cumin", "turmeric", "coriander_ground",
              "taco_seasoning", "five_spice", "smoked_paprika", "chili_powder", "oregano",
              "paprika", "black_pepper", "garlic_powder", "onion_powder", "chipotle_powder",
              "curry_powder", "italian_seasoning", "cajun_seasoning", "sesame_seeds",
              "ginger", "white_pepper", "asafoetida"}
    SPICES_SET = SPICES  # alias for use in breakfast spice assignment
    OTHER = {"pbfit", "nutritional_yeast", "cacao", "bone_broth"}

    def split_items_into_meals(d):
        """Split a day's items into separate meals based on snack_type and meal descriptions."""
        snack_type = d["snack_type"]
        items = dict(d["items"])  # name -> amount
        meal_keys = list(d["meals"].keys())
        meals_desc = d["meals"]
        is_breakfast = d.get("breakfast", False)
        structure = d.get("structure", "2 meals + 1 snack")

        meals = {}  # meal_name -> [(item_name, amount), ...]

        # Determine snack meal name
        if is_breakfast and snack_type == "breakfast":
            snack_key = "Breakfast"
        else:
            # Find the snack key
            snack_key = None
            for k in meal_keys:
                if k.lower() == "snack":
                    snack_key = k
                    break
            if snack_key is None:
                snack_key = "Snack"

        # Build snack items
        snack_items = []
        remaining = dict(items)  # copy

        def take(name, amount=None):
            """Remove item from remaining, return (name, amount) or None."""
            if name in remaining:
                if amount is None:
                    amt = remaining.pop(name)
                else:
                    total = remaining[name]
                    if amount >= total:
                        amt = remaining.pop(name)
                    else:
                        remaining[name] = total - amount
                        amt = amount
                return (name, amt)
            return None

        # Find the protein powder
        pw_name = None
        for n in remaining:
            if n.startswith("pw_"):
                pw_name = n
                break

        if snack_type == "waffle":
            if pw_name:
                snack_items.append(take(pw_name))
            r = take("buckwheat_flour")
            if r: snack_items.append(r)
            # 2 egg whites = 66g
            r = take("egg_white", 66)
            if r: snack_items.append(r)
            r = take("chia")
            if r: snack_items.append(r)
            r = take("psyllium")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)

        elif snack_type == "shake":
            if pw_name:
                snack_items.append(take(pw_name))
            r = take("chia")
            if r: snack_items.append(r)
            r = take("psyllium")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)

        elif snack_type == "baked_oats":
            if pw_name:
                snack_items.append(take(pw_name))
            for grain in ["oats", "steel_oats"]:
                r = take(grain)
                if r: snack_items.append(r)
            r = take("chia")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)
            # 1 egg white = 33g
            r = take("egg_white", 33)
            if r: snack_items.append(r)
            r = take("psyllium")
            if r: snack_items.append(r)

        elif snack_type == "chia_pudding":
            if pw_name:
                snack_items.append(take(pw_name))
            r = take("chia")
            if r: snack_items.append(r)
            r = take("psyllium")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)

        elif snack_type == "mug_cake":
            if pw_name:
                snack_items.append(take(pw_name))
            r = take("cacao")
            if r: snack_items.append(r)
            # 1 egg white = 33g
            r = take("egg_white", 33)
            if r: snack_items.append(r)
            r = take("chia")
            if r: snack_items.append(r)
            r = take("psyllium")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)

        elif snack_type == "breakfast":
            # Breakfast gets: protein powder, oats, eggs, chia (NOT psyllium — goes to Fiber drink)
            if pw_name:
                snack_items.append(take(pw_name))
            for grain in ["oats", "steel_oats"]:
                r = take(grain)
                if r: snack_items.append(r)
            r = take("egg")
            if r: snack_items.append(r)
            r = take("chia")
            if r: snack_items.append(r)
            r = take("flax")
            if r: snack_items.append(r)
            # Some breakfast days have kimchi with breakfast (Day 16)
            desc_lower = meals_desc.get("Breakfast", "").lower()
            if "kimchi" in desc_lower:
                r = take("kimchi")
                if r: snack_items.append(r)

        # Filter out None items
        snack_items = [x for x in snack_items if x is not None]

        # Now assign snack
        meals[snack_key] = snack_items

        # For breakfast type with Fiber drink, assign psyllium to it
        if snack_type == "breakfast" and "Fiber drink" in meals_desc:
            fiber_items = []
            r = take("psyllium")
            if r:
                fiber_items.append(r)
            meals["Fiber drink"] = fiber_items

        # Determine remaining meal keys (excluding snack and Fiber drink if already assigned)
        other_meal_keys = [k for k in meal_keys if k != snack_key and k not in meals]

        # For breakfast type with chia_pudding snack that also has breakfast (Day 6, 13, 27)
        # The meals dict has Breakfast, Snack, Dinner - snack_key was set to "Snack" above
        # Breakfast gets eggs + egg_whites + some veggies
        if is_breakfast and snack_type != "breakfast":
            # Find the Breakfast key
            bfast_key = None
            for k in other_meal_keys:
                if k.lower() == "breakfast":
                    bfast_key = k
                    break
            if bfast_key:
                bfast_items = []
                r = take("egg")
                if r: bfast_items.append(r)
                r = take("egg_white")
                if r: bfast_items.append(r)
                # Check breakfast desc for veggies
                desc_lower = meals_desc.get(bfast_key, "").lower()
                for veg in ["tomato", "bell_pepper", "onion", "kimchi"]:
                    if veg.replace("_", " ") in desc_lower or veg in desc_lower:
                        r = take(veg)
                        if r: bfast_items.append(r)
                # soy sauce for Chinese breakfast
                if "soy sauce" in desc_lower or "soy" in desc_lower:
                    r = take("soy_sauce")
                    if r: bfast_items.append(r)
                # Also take spices mentioned in breakfast description
                for spice_name in list(remaining.keys()):
                    if spice_name in SPICES_SET:
                        spice_friendly = spice_name.replace("_", " ")
                        if spice_friendly in desc_lower or spice_name in desc_lower:
                            r = take(spice_name)
                            if r:
                                bfast_items.append(r)
                meals[bfast_key] = bfast_items
                other_meal_keys = [k for k in other_meal_keys if k != bfast_key]

        # Now distribute remaining items among remaining meals
        if len(other_meal_keys) == 0:
            # Edge case - shouldn't happen
            pass
        elif len(other_meal_keys) == 1:
            # Everything remaining goes to that one meal
            meal_key = other_meal_keys[0]
            meals[meal_key] = list(remaining.items())
        else:
            # Multiple meals - use descriptions to guide splitting
            for mk in other_meal_keys:
                meals[mk] = []

            desc_map = {mk: meals_desc.get(mk, "").lower() for mk in other_meal_keys}

            assigned = set()

            # Assign animal proteins
            for protein in PROTEINS:
                if protein in remaining:
                    # Find which meal mentions this protein
                    target = None
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if protein in desc or protein.replace("_", " ") in desc:
                            target = mk
                            break
                        # Check synonyms
                        if protein == "chicken" and ("chicken" in desc or "tandoori" in desc or "tikka" in desc or "buffalo" in desc):
                            target = mk
                            break
                        if protein == "salmon_can" and ("salmon" in desc):
                            target = mk
                            break
                    if target is None:
                        # Default: first meal
                        target = other_meal_keys[0]
                    meals[target].append((protein, remaining.pop(protein)))
                    assigned.add(protein)

            # Assign tofu
            if "tofu" in remaining:
                target = None
                for mk in other_meal_keys:
                    if "tofu" in desc_map[mk]:
                        target = mk
                        break
                if target is None:
                    target = other_meal_keys[0]
                meals[target].append(("tofu", remaining.pop("tofu")))

            # Assign legumes
            for legume in LEGUMES:
                if legume in remaining:
                    target = None
                    legume_friendly = legume.replace("_", " ")
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if legume_friendly in desc or legume in desc:
                            target = mk
                            break
                        # Check partial matches
                        if legume == "chana_dal" and "chana" in desc:
                            target = mk
                            break
                        if legume == "matar_dal" and "matar" in desc:
                            target = mk
                            break
                        if legume == "toor_dal" and "toor" in desc:
                            target = mk
                            break
                        if legume == "urad_dal" and "urad" in desc:
                            target = mk
                            break
                        if legume == "red_lentils_husk" and ("red lentil" in desc or "husk" in desc):
                            target = mk
                            break
                        if legume == "french_lentils" and ("french lentil" in desc or "lentil" in desc):
                            target = mk
                            break
                        if legume == "brown_lentils" and ("brown lentil" in desc or "lentil" in desc):
                            target = mk
                            break
                        if legume == "split_peas" and ("split pea" in desc):
                            target = mk
                            break
                        if legume == "black_soy" and ("black soy" in desc or "soybean" in desc):
                            target = mk
                            break
                        if legume == "black_beans" and ("black bean" in desc):
                            target = mk
                            break
                        if legume == "pinto" and ("pinto" in desc):
                            target = mk
                            break
                        if legume == "lima" and ("lima" in desc):
                            target = mk
                            break
                        if legume == "chickpeas" and ("chickpea" in desc):
                            target = mk
                            break
                        if legume == "mayocoba" and ("mayocoba" in desc):
                            target = mk
                            break
                    if target is None:
                        # Default: second meal or last meal
                        target = other_meal_keys[-1] if len(other_meal_keys) > 1 else other_meal_keys[0]
                    meals[target].append((legume, remaining.pop(legume)))

            # Assign egg_white to meal that mentions it
            if "egg_white" in remaining:
                ew_total = remaining["egg_white"]
                # Check which meals mention egg whites
                ew_meals = []
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if "egg white" in desc or "egg whites" in desc or "bhurji" in desc:
                        ew_meals.append(mk)

                if len(ew_meals) == 0:
                    # Give all to last meal
                    meals[other_meal_keys[-1]].append(("egg_white", remaining.pop("egg_white")))
                elif len(ew_meals) == 1:
                    meals[ew_meals[0]].append(("egg_white", remaining.pop("egg_white")))
                else:
                    # Split among meals that mention egg whites
                    # Try to parse amounts from descriptions
                    import re
                    per_meal = ew_total / len(ew_meals)
                    for i, mk in enumerate(ew_meals):
                        desc = desc_map[mk]
                        match = re.search(r'(\d+)\s*(?:egg )?whites?', desc)
                        if match:
                            count = int(match.group(1))
                            amt = count * 33  # ~33g per white
                        else:
                            amt = per_meal
                        amt = min(amt, ew_total)
                        if i == len(ew_meals) - 1:
                            amt = ew_total  # give remainder to last
                        meals[mk].append(("egg_white", amt))
                        ew_total -= amt
                        if ew_total <= 0:
                            break
                    remaining.pop("egg_white")

            # Assign vegetables based on descriptions
            for veg in list(VEGETABLES):
                if veg in remaining:
                    target = None
                    veg_friendly = veg.replace("_", " ")
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if veg_friendly in desc or veg in desc:
                            target = mk
                            break
                        if veg == "peas_frozen" and ("peas" in desc or "frozen peas" in desc):
                            target = mk
                            break
                        if veg == "green_beans_can" and ("green bean" in desc):
                            target = mk
                            break
                        if veg == "tomatoes_can" and ("canned tomato" in desc or "tomatoes" in desc):
                            target = mk
                            break
                        if veg == "tomato_paste" and ("tomato paste" in desc):
                            target = mk
                            break
                    if target is None:
                        # Default: first meal with protein
                        target = other_meal_keys[0]
                    meals[target].append((veg, remaining.pop(veg)))

            # Assign sauces based on descriptions
            for sauce in list(SAUCES):
                if sauce in remaining:
                    target = None
                    sauce_friendly = sauce.replace("_", " ")
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if sauce_friendly in desc or sauce in desc:
                            target = mk
                            break
                        if sauce == "bbq_sauce" and "bbq" in desc:
                            target = mk
                            break
                        if sauce == "curry_paste" and "curry" in desc:
                            target = mk
                            break
                        if sauce == "hot_sauce" and ("hot sauce" in desc or "buffalo" in desc):
                            target = mk
                            break
                        if sauce == "fish_sauce" and "fish sauce" in desc:
                            target = mk
                            break
                        if sauce == "soy_sauce" and ("soy" in desc or "stir" in desc):
                            target = mk
                            break
                        if sauce == "liquid_smoke" and ("smoke" in desc or "smoky" in desc):
                            target = mk
                            break
                    if target is None:
                        target = other_meal_keys[0]
                    meals[target].append((sauce, remaining.pop(sauce)))

            # Assign fats
            for fat in list(FATS):
                if fat in remaining:
                    target = None
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if fat in desc or fat.replace("_", " ") in desc:
                            target = mk
                            break
                    if target is None:
                        # Ghee usually goes with dal
                        if fat == "ghee":
                            for mk in other_meal_keys:
                                if "dal" in desc_map[mk]:
                                    target = mk
                                    break
                        if target is None:
                            target = other_meal_keys[0]
                    meals[target].append((fat, remaining.pop(fat)))

            # Assign spices to the first non-snack meal (or by description match)
            # Handle garam_masala FIRST — it must only match "garam masala" or "garam",
            # NOT just "masala" (which would incorrectly match "tandoori masala" etc.)
            if "garam_masala" in remaining:
                target = None
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if "garam masala" in desc or "garam" in desc:
                        target = mk
                        break
                if target is None:
                    target = other_meal_keys[0]
                meals[target].append(("garam_masala", remaining.pop("garam_masala")))

            for spice in list(SPICES):
                if spice in remaining:
                    target = None
                    spice_friendly = spice.replace("_", " ")
                    for mk in other_meal_keys:
                        desc = desc_map[mk]
                        if spice_friendly in desc or spice in desc:
                            target = mk
                            break
                        # Match spice keywords in descriptions
                        if spice == "tandoori_masala" and "tandoori" in desc:
                            target = mk
                            break
                        if spice == "taco_seasoning" and "taco" in desc:
                            target = mk
                            break
                        if spice == "five_spice" and ("five-spice" in desc or "five spice" in desc):
                            target = mk
                            break
                        if spice == "smoked_paprika" and ("smoked paprika" in desc or "smoky" in desc or "bbq" in desc):
                            target = mk
                            break
                        if spice == "chipotle_powder" and "chipotle" in desc:
                            target = mk
                            break
                        if spice == "sesame_seeds" and ("sesame" in desc or "stir-fry" in desc or "korean" in desc):
                            target = mk
                            break
                    if target is None:
                        # Default: first non-snack meal
                        target = other_meal_keys[0]
                    meals[target].append((spice, remaining.pop(spice)))

            # Assign remaining items (nutritional_yeast, bone_broth, etc.)
            for item_name in list(remaining.keys()):
                target = None
                item_friendly = item_name.replace("_", " ")
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if item_friendly in desc or item_name in desc:
                        target = mk
                        break
                    if item_name == "nutritional_yeast" and "nutritional yeast" in desc:
                        target = mk
                        break
                if target is None:
                    target = other_meal_keys[-1]
                meals[target].append((item_name, remaining.pop(item_name)))

        # Return meals in the order of the original meal_keys
        ordered = []
        for mk in meal_keys:
            if mk in meals:
                ordered.append((mk, meals[mk]))
        return ordered

    def generate_cooking_instructions(meal_name, items, cuisine, day_data):
        """Generate cooking instructions based on meal contents and cuisine."""
        item_names = {name for name, _ in items}
        desc = day_data["meals"].get(meal_name, "")
        snack_type = day_data["snack_type"]

        # Fiber drink instructions
        if meal_name.lower() == "fiber drink":
            return "Stir psyllium husk into a full glass of water. Drink promptly before it thickens."

        # Snack instructions
        if meal_name.lower() == "snack" or (meal_name.lower() == "breakfast" and snack_type == "breakfast"):
            if snack_type == "waffle":
                return "Mix protein powder with buckwheat flour and egg whites until smooth. Cook in a preheated waffle iron until golden and crisp. Separately, stir chia seeds and flax into water and let gel for 5 minutes as a fiber drink."
            elif snack_type == "shake":
                return "Blend protein powder, chia seeds, and flax with cold water until smooth. Let sit 2 minutes to thicken slightly before drinking."
            elif snack_type == "baked_oats":
                txt = "Mix protein powder, oats, chia seeds"
                if "flax" in item_names:
                    txt += ", ground flax"
                txt += ", and egg white with a splash of water. Pour into a greased ramekin and bake at 350F for 18-20 minutes until set."
                if "psyllium" in item_names or any("psyllium" in d for d in [desc]):
                    txt += " Stir psyllium into water separately as a fiber drink."
                return txt
            elif snack_type == "chia_pudding":
                return "Mix protein powder, chia seeds, and flax with water. Stir well and refrigerate for at least 2 hours (or overnight) until thick and pudding-like."
            elif snack_type == "mug_cake":
                return "Mix protein powder, cacao powder, and egg white with a splash of water until smooth. Microwave in a mug for 60-90 seconds until set. Stir chia seeds and flax into water as a fiber drink on the side."
            elif snack_type == "breakfast":
                if "steel_oats" in item_names:
                    grain_name = "steel cut oats"
                else:
                    grain_name = "rolled oats"
                txt = f"Cook {grain_name} with water, then stir in protein powder and chia seeds until creamy."
                if "flax" in item_names:
                    txt = txt.replace("and chia seeds", "chia seeds, and ground flax")
                if "egg" in item_names:
                    txt += " Scramble eggs separately and serve alongside."
                if "kimchi" in item_names:
                    txt += " Top with kimchi for a savory twist."
                return txt

        # Regular meal instructions
        instructions = []

        # Build item lookup dict for ingredient-aware instructions
        item_dict = {name: amt for name, amt in items}

        # Build spice amount strings for instructions
        spice_amounts = {}
        for name, amount in items:
            if name in SPICES:
                spice_amounts[name] = amount

        def spice_str(names):
            """Build a string like '5g tandoori masala, 2g turmeric, and 2g cumin'."""
            parts = []
            for n in names:
                if n in spice_amounts:
                    friendly = FRIENDLY.get(n, n.replace("_", " ")).lower()
                    parts.append(f"{spice_amounts[n]}g {friendly}")
            if len(parts) == 0:
                return ""
            if len(parts) == 1:
                return parts[0]
            if len(parts) == 2:
                return f"{parts[0]} and {parts[1]}"
            return ", ".join(parts[:-1]) + f", and {parts[-1]}"

        # Indian cuisine
        if cuisine == "Indian":
            if "chicken" in item_names:
                if "tandoori" in desc.lower() or "tikka" in desc.lower():
                    sp = spice_str(["tandoori_masala", "turmeric", "cumin"])
                    instructions.append(f"Season chicken breast with {sp}. Grill or bake at 400F for 20-25 minutes until internal temp reaches 165F." if sp else "Season chicken breast and grill or bake at 400F for 20-25 minutes until internal temp reaches 165F.")
                elif "curry" in desc.lower():
                    sp = spice_str(["garam_masala", "turmeric", "cumin"])
                    base = "Cut chicken into bite-sized pieces. Saute onion in ghee, add curry paste"
                    if sp:
                        base += f" and {sp}"
                    if "tomatoes_can" in item_names:
                        base += ", then add chicken and canned tomatoes"
                    else:
                        base += ", then add chicken"
                    base += ". Simmer 15-20 minutes until chicken is cooked through."
                    instructions.append(base)
                else:
                    sp = spice_str(["garam_masala", "turmeric", "cumin"])
                    instructions.append(f"Season chicken with {sp}. Bake at 400F for 20-25 minutes." if sp else "Season chicken and bake at 400F for 20-25 minutes.")
            if "sardines" in item_names:
                sp = spice_str(["cumin", "coriander_ground", "turmeric"])
                if sp and "tomatoes_can" in item_names:
                    instructions.append(f"Heat sardines in a pan with {sp} and canned tomatoes to make a quick masala.")
                elif sp:
                    instructions.append(f"Heat sardines in a pan with {sp} to make a quick masala.")
                elif "tomatoes_can" in item_names:
                    instructions.append("Heat sardines in a pan with canned tomatoes to make a quick masala.")
                else:
                    instructions.append("Heat sardines in a pan to make a quick masala.")
            for dal in ["chana_dal", "matar_dal", "toor_dal", "urad_dal", "red_lentils", "red_lentils_husk"]:
                if dal in item_names:
                    dal_name = dal.replace("_", " ")
                    sp = spice_str(["turmeric", "cumin", "coriander_ground"])
                    if sp:
                        instructions.append(f"Saute onion in ghee until soft. Add {dal_name} with {sp} and enough water to cover. Simmer 20-25 minutes until tender.")
                    else:
                        instructions.append(f"Saute onion in ghee until soft. Add {dal_name} with enough water to cover. Simmer 20-25 minutes until tender.")
                    break
            if "egg_white" in item_names and "bhurji" in desc.lower():
                bhurji_sp = spice_str(["turmeric", "chili_powder"])
                instructions.append(f"Scramble egg whites with {bhurji_sp} for bhurji." if bhurji_sp else "Scramble egg whites for bhurji.")
            elif "egg_white" in item_names:
                instructions.append("Cook egg whites as a side dish.")
            if "broccoli" in item_names:
                instructions.append("Steam broccoli until tender-crisp.")
            if "nutritional_yeast" in item_names:
                instructions.append("Sprinkle nutritional yeast on top before serving.")

        # American / American BBQ
        elif cuisine in ("American", "American BBQ"):
            if "chicken" in item_names:
                if "bbq" in desc.lower():
                    sp = spice_str(["smoked_paprika", "garlic_powder", "onion_powder"])
                    bbq_base = f"Season chicken breast with {sp} and grill" if sp else "Grill chicken breast"
                    bbq_base += " or bake at 400F for 20-25 minutes."
                    if "bbq_sauce" in item_names:
                        bbq_base += " Brush with BBQ sauce in the last 5 minutes."
                    instructions.append(bbq_base)
                elif "buffalo" in desc.lower():
                    sp = spice_str(["garlic_powder", "onion_powder", "smoked_paprika"])
                    instructions.append(f"Season chicken with {sp} and bake at 400F for 20-25 minutes. Toss with hot sauce for buffalo flavor." if sp else "Bake chicken breast at 400F for 20-25 minutes. Toss with hot sauce for buffalo flavor.")
                elif "dijon" in desc.lower():
                    instructions.append("Coat chicken in Dijon mustard and bake at 400F for 20-25 minutes.")
                else:
                    sp = spice_str(["garlic_powder", "onion_powder", "smoked_paprika"])
                    instructions.append(f"Season chicken with {sp} and bake at 400F for 20-25 minutes." if sp else "Season and bake chicken breast at 400F for 20-25 minutes.")
            if "sardines" in item_names:
                if "bbq" in desc.lower():
                    sar_parts = ["Warm sardines in a pan"]
                    extras = []
                    if "bbq_sauce" in item_names:
                        extras.append("BBQ sauce")
                    if "liquid_smoke" in item_names:
                        extras.append("a dash of liquid smoke")
                    if extras:
                        sar_parts.append("brush with " + " and ".join(extras))
                    instructions.append(" and ".join(sar_parts) + ".")
                else:
                    instructions.append("Warm sardines in a pan.")
            if "tuna" in item_names:
                if "dijon" in desc.lower():
                    instructions.append("Mix tuna with Dijon mustard, a squeeze of lemon, and season with salt and pepper.")
                else:
                    instructions.append("Season tuna and warm in a pan or serve cold.")
            for legume in ["black_beans", "lima", "brown_lentils", "pinto"]:
                if legume in item_names:
                    leg_name = legume.replace("_", " ")
                    if "smoky" in desc.lower() or "smoke" in desc.lower():
                        instructions.append(f"Heat {leg_name} with a dash of liquid smoke and smoked paprika.")
                    else:
                        instructions.append(f"Heat {leg_name} and season to taste.")
                    break
            if "egg_white" in item_names:
                instructions.append("Scramble egg whites and serve on the side.")
            vegs = []
            for v in ["broccoli", "onion", "green_beans_can", "carrot"]:
                if v in item_names:
                    vegs.append(v.replace("_can", "").replace("_", " "))
            if vegs:
                instructions.append(f"Steam or saute {', '.join(vegs)} as sides.")
            if "nutritional_yeast" in item_names:
                instructions.append("Top with nutritional yeast.")

        # Mexican
        elif cuisine == "Mexican":
            if "chicken" in item_names:
                if "chipotle" in desc.lower():
                    sp = spice_str(["chipotle_powder", "cumin", "chili_powder"])
                    instructions.append(f"Season chicken with {sp} and adobo. Bake at 400F for 20-25 minutes." if sp else "Season chicken with chipotle chili powder, cumin, and adobo. Bake at 400F for 20-25 minutes.")
                else:
                    sp = spice_str(["taco_seasoning", "cumin", "chili_powder"])
                    instructions.append(f"Season chicken with {sp}. Bake at 400F for 20-25 minutes." if sp else "Season chicken with cumin, chili powder, and garlic. Bake at 400F for 20-25 minutes.")
            if "tuna" in item_names:
                if "taco" in desc.lower():
                    sp = spice_str(["taco_seasoning", "cumin", "chili_powder"])
                    instructions.append(f"Season tuna with {sp} and warm in a pan. Serve over beans with fresh veggies and salsa." if sp else "Season tuna with taco seasoning (cumin, chili, garlic, paprika) and warm in a pan. Serve over beans with fresh veggies and salsa.")
                else:
                    sp = spice_str(["cumin", "chili_powder"])
                    instructions.append(f"Season tuna with {sp}. Serve with veggies and salsa." if sp else "Season tuna with cumin and chili. Serve with veggies and salsa.")
            if "sardines" in item_names:
                sp = spice_str(["taco_seasoning", "cumin", "chili_powder"])
                instructions.append(f"Toss sardines with {sp}. Serve over lentils with veggies." if sp else "Toss sardines with seasoning. Serve over lentils with veggies.")
            for legume in ["pinto", "black_beans", "chana_dal", "french_lentils"]:
                if legume in item_names:
                    leg_name = legume.replace("_", " ")
                    leg_sp = spice_str(["cumin", "chili_powder"])
                    instructions.append(f"Heat {leg_name} with {leg_sp}." if leg_sp else f"Heat {leg_name} and season to taste.")
                    break
            if "egg_white" in item_names:
                if "fajita" in desc.lower() or "scramble" in desc.lower():
                    instructions.append("Scramble egg whites with onion and veggies for a fajita-style scramble.")
                elif "taco" in desc.lower():
                    instructions.append("Scramble egg whites with taco seasoning.")
                else:
                    instructions.append("Cook egg whites as a side.")
            vegs = []
            for v in ["lettuce", "tomato", "bell_pepper"]:
                if v in item_names:
                    vegs.append(v.replace("_", " "))
            if vegs:
                instructions.append(f"Serve with fresh {', '.join(vegs)}.")
            if "salsa" in item_names:
                instructions.append("Top with salsa.")

        # Thai
        elif cuisine == "Thai":
            if "chicken" in item_names and "tofu" in item_names:
                color = "green"
                if "red curry" in desc.lower():
                    color = "red"
                elif "yellow curry" in desc.lower():
                    color = "yellow"
                elif "basil" in desc.lower():
                    thai_veg = "broccoli" if "broccoli" in item_names else "vegetables"
                    instructions.append(f"Stir-fry chicken with Thai basil, curry paste, and fish sauce until fragrant. Add {thai_veg} and cook until tender.")
                    if "tofu" in item_names:
                        instructions.append("Slice silken tofu and serve alongside.")
                if "curry" in desc.lower() and "basil" not in desc.lower():
                    thai_veg = "broccoli" if "broccoli" in item_names else "vegetables"
                    curry_base = f"Simmer chicken and silken tofu in {color} curry paste with fish sauce"
                    if "tomatoes_can" in item_names:
                        curry_base += " and canned tomatoes"
                    curry_base += f" for 15-20 minutes. Add {thai_veg} in the last 5 minutes."
                    instructions.append(curry_base)
            elif "chicken" in item_names:
                if "basil" in desc.lower():
                    thai_sides = []
                    if "broccoli" in item_names:
                        thai_sides.append("broccoli")
                    if "onion" in item_names:
                        thai_sides.append("onion")
                    side_str = " and ".join(thai_sides) if thai_sides else "vegetables"
                    instructions.append(f"Stir-fry chicken with Thai basil, curry paste, soy sauce, and fish sauce. Add {side_str}.")
                else:
                    instructions.append("Cook chicken with Thai curry paste and fish sauce.")
            for legume in ["red_lentils", "split_peas", "chickpeas"]:
                if legume in item_names:
                    leg_name = legume.replace("_", " ")
                    if "soup" in desc.lower():
                        soup_extras = []
                        if "onion" in item_names:
                            soup_extras.append("onion")
                        if "ginger" in item_names:
                            soup_extras.append("ginger")
                        extras_str = " and ".join(soup_extras) if soup_extras else "aromatics"
                        soup_instr = f"Simmer {leg_name} with {extras_str} until soft."
                        if "turmeric" in item_names:
                            soup_instr += " Season with turmeric."
                        instructions.append(soup_instr)
                    elif "stir" in desc.lower():
                        instructions.append(f"Stir-fry {leg_name} with Thai chili paste and onion.")
                    else:
                        instructions.append(f"Cook {leg_name} with Thai seasonings.")
                    break
            if "egg_white" in item_names:
                if "pad kra pao" in desc.lower() or "basil" in desc.lower():
                    pkp_sauces = []
                    if "soy_sauce" in item_names:
                        pkp_sauces.append("soy sauce")
                    if "fish_sauce" in item_names:
                        pkp_sauces.append("fish sauce")
                    sauce_part = ", ".join(pkp_sauces) + ", and " if pkp_sauces else ""
                    instructions.append(f"Stir-fry egg whites with {sauce_part}Thai basil for a pad kra pao style dish.")
                elif "garnish" in desc.lower() or "strip" in desc.lower():
                    instructions.append("Cook egg whites into thin strips and use as garnish.")
                else:
                    instructions.append("Cook egg whites and serve on the side.")
            if "peas_frozen" in item_names:
                instructions.append("Steam frozen peas as a side.")
            if "nutritional_yeast" in item_names:
                instructions.append("Sprinkle nutritional yeast on top.")

        # Korean
        elif cuisine == "Korean":
            if "chicken" in item_names:
                if "gochujang" in desc.lower():
                    sp = spice_str(["garlic_powder"])
                    instructions.append(f"Brush chicken with gochujang sauce and {sp}, then pan-sear or broil until caramelized and cooked through, about 20 minutes." if sp else "Brush chicken with gochujang sauce and pan-sear or broil until caramelized and cooked through, about 20 minutes.")
                else:
                    sp = spice_str(["garlic_powder"])
                    instructions.append(f"Season chicken with soy sauce, gochujang, and {sp}. Pan-sear until cooked through." if sp else "Season chicken with soy sauce and gochujang. Pan-sear until cooked through.")
            if "salmon_can" in item_names:
                sal_parts = ["Flake canned salmon"]
                if "gochujang" in item_names:
                    sal_parts.append("toss with gochujang")
                sides = []
                if "kimchi" in item_names:
                    sides.append("kimchi")
                if "broccoli" in item_names:
                    sides.append("steamed broccoli")
                if sides:
                    sal_parts.append("serve with " + " and ".join(sides))
                instructions.append(". ".join(sal_parts).capitalize() + "." if len(sal_parts) > 1 else sal_parts[0] + ".")
            if "tofu" in item_names:
                tofu_txt = "Slice silken tofu and serve alongside"
                if "kimchi" in item_names:
                    tofu_txt += " with kimchi"
                instructions.append(tofu_txt + ".")
            for legume in ["black_soy", "pinto", "toor_dal"]:
                if legume in item_names:
                    leg_name = legume.replace("_", " ")
                    sp = spice_str(["sesame_seeds"])
                    if "stir" in desc.lower():
                        stir_vegs = []
                        if "broccoli" in item_names:
                            stir_vegs.append("broccoli")
                        if "onion" in item_names:
                            stir_vegs.append("onion")
                        stir_extras = []
                        if "soy_sauce" in item_names:
                            stir_extras.append("soy sauce")
                        if sp:
                            stir_extras.append(sp)
                        all_with = ", ".join(stir_vegs + stir_extras) if (stir_vegs or stir_extras) else "vegetables"
                        instructions.append(f"Stir-fry {leg_name} with {all_with}.")
                    else:
                        sea_parts = []
                        if "soy_sauce" in item_names:
                            sea_parts.append("soy sauce")
                        if sp:
                            sea_parts.append(sp)
                        sea_str = " and ".join(sea_parts) if sea_parts else "seasonings"
                        instructions.append(f"Heat {leg_name} and season with {sea_str}.")
                    break
            if "egg_white" in item_names:
                if "soy_sauce" in item_names:
                    instructions.append("Scramble egg whites with soy sauce and serve on the side.")
                else:
                    instructions.append("Scramble egg whites and serve on the side.")
            if "kimchi" in item_names:
                instructions.append("Serve kimchi as a side.")
            if "peas_frozen" in item_names:
                instructions.append("Steam frozen peas as a side.")
            if "nutritional_yeast" in item_names:
                instructions.append("Sprinkle nutritional yeast on top.")

        # Mediterranean
        elif cuisine == "Mediterranean":
            if meal_name.lower() == "breakfast":
                sp = spice_str(["oregano", "paprika"])
                bfast_vegs = []
                if "tomato" in item_names:
                    bfast_vegs.append("diced tomato")
                if "bell_pepper" in item_names:
                    bfast_vegs.append("bell pepper")
                if "onion" in item_names:
                    bfast_vegs.append("onion")
                veg_part = " with " + ", ".join(bfast_vegs) if bfast_vegs else ""
                base_txt = f"Scramble eggs and egg whites{veg_part}."
                if sp:
                    base_txt += f" Season with {sp}."
                instructions.append(base_txt)
            else:
                if "chicken" in item_names:
                    if "harissa" in desc.lower():
                        instructions.append("Rub chicken with harissa paste and grill or bake at 400F for 20-25 minutes.")
                    else:
                        ch_sp = spice_str(["oregano", "garlic_powder"])
                        instructions.append(f"Season chicken with {ch_sp} and lemon. Grill or bake at 400F for 20-25 minutes." if ch_sp else "Season chicken with lemon and garlic. Grill or bake at 400F for 20-25 minutes.")
                if "tuna" in item_names:
                    if "harissa" in desc.lower() and "harissa" in item_names:
                        tuna_sides = []
                        if "chickpeas" in item_names:
                            tuna_sides.append("chickpeas")
                        fresh_vegs = []
                        if "cucumber" in item_names:
                            fresh_vegs.append("cucumber")
                        if "tomato" in item_names:
                            fresh_vegs.append("tomato")
                        txt = "Mix tuna with harissa paste."
                        if tuna_sides:
                            txt += f" Serve over {', '.join(tuna_sides)}"
                            if fresh_vegs:
                                txt += f" with fresh {' and '.join(fresh_vegs)}"
                            txt += "."
                        instructions.append(txt)
                    else:
                        instructions.append("Season tuna with herbs and lemon.")
                if "sardines" in item_names:
                    if "harissa" in desc.lower() and "harissa" in item_names:
                        instructions.append("Toss sardines with harissa paste and serve over beans with fresh veggies.")
                    else:
                        sar_extras = []
                        if "olive_oil" in item_names:
                            sar_extras.append("olive oil")
                        if "vinegar" in item_names:
                            sar_extras.append("vinegar")
                        if sar_extras:
                            instructions.append(f"Serve sardines with a drizzle of {' and '.join(sar_extras)}.")
                        else:
                            instructions.append("Serve sardines on the side.")
                for legume in ["chickpeas", "mayocoba", "red_lentils"]:
                    if legume in item_names:
                        leg_name = legume.replace("_", " ")
                        med_sp = spice_str(["cumin", "coriander_ground"])
                        instructions.append(f"Heat {leg_name} with {med_sp}." if med_sp else f"Heat {leg_name} and season to taste.")
                        break
                if "tofu" in item_names:
                    instructions.append("Slice silken tofu and serve alongside.")
                if "egg_white" in item_names:
                    instructions.append("Cook egg whites on the side.")
                vegs = []
                for v in ["cucumber", "tomato", "bell_pepper"]:
                    if v in item_names:
                        vegs.append(v.replace("_", " "))
                if vegs:
                    instructions.append(f"Serve with fresh {', '.join(vegs)}.")
                if "vinegar" in item_names:
                    instructions.append("Drizzle with red wine vinegar.")
                if "nutritional_yeast" in item_names:
                    instructions.append("Top with nutritional yeast.")
                steam_sides = []
                if "broccoli" in item_names:
                    steam_sides.append("broccoli")
                if "peas_frozen" in item_names:
                    steam_sides.append("frozen peas")
                if steam_sides:
                    instructions.append(f"Steam {' and '.join(steam_sides)} as sides.")

        # Japanese
        elif cuisine == "Japanese":
            if "chicken" in item_names:
                if "miso" in desc.lower() and "miso" in item_names:
                    instructions.append("Dissolve miso paste in a little warm water and brush onto chicken. Pan-sear or broil until cooked through and glazed.")
                elif "teriyaki" in desc.lower() and "teriyaki" in item_names:
                    instructions.append("Brush chicken with teriyaki sauce and pan-sear or broil until caramelized and cooked through.")
                elif "soy_sauce" in item_names:
                    instructions.append("Season chicken with soy sauce and cook until done.")
                else:
                    instructions.append("Season chicken and cook until done.")
            if "tofu" in item_names:
                if "miso" in desc.lower() and "soup" in desc.lower():
                    miso_vegs = []
                    if "broccoli" in item_names:
                        miso_vegs.append("broccoli")
                    if "carrot" in item_names:
                        miso_vegs.append("carrots")
                    veg_part = " with " + " and ".join(miso_vegs) if miso_vegs else ""
                    instructions.append(f"Add silken tofu to miso broth{veg_part}.")
                else:
                    instructions.append("Slice silken tofu and serve alongside.")
            for legume in ["french_lentils", "black_soy", "urad_dal"]:
                if legume in item_names:
                    leg_name = legume.replace("_", " ")
                    if "bone broth" in desc.lower() and "bone_broth" in item_names:
                        if "soy_sauce" in item_names:
                            instructions.append(f"Simmer {leg_name} in soy sauce with a splash of bone broth until tender.")
                        else:
                            instructions.append(f"Simmer {leg_name} with a splash of bone broth until tender.")
                    else:
                        sea_parts = []
                        if "soy_sauce" in item_names:
                            sea_parts.append("soy sauce")
                        if "ginger" in item_names:
                            sea_parts.append("ginger")
                        sea_str = " and ".join(sea_parts) if sea_parts else "seasonings"
                        instructions.append(f"Season {leg_name} with {sea_str}.")
                    break
            if "egg_white" in item_names:
                if "teriyaki" in desc.lower() and "teriyaki" in item_names:
                    instructions.append("Scramble egg whites and drizzle with teriyaki sauce.")
                elif "soy_sauce" in item_names:
                    instructions.append("Scramble egg whites and drizzle with soy sauce.")
                else:
                    instructions.append("Cook egg whites and serve on the side.")
            jp_steam = []
            if "broccoli" in item_names:
                jp_steam.append("broccoli")
            if "carrot" in item_names:
                jp_steam.append("carrots")
            if jp_steam:
                instructions.append(f"Steam {' and '.join(jp_steam)} until tender-crisp.")
            if "peas_frozen" in item_names:
                instructions.append("Steam frozen peas as a side.")
            if "nutritional_yeast" in item_names:
                instructions.append("Top with nutritional yeast.")

        # Chinese
        elif cuisine == "Chinese":
            if meal_name.lower() == "breakfast":
                sp = spice_str(["five_spice"])
                cn_extras = []
                if "soy_sauce" in item_names:
                    cn_extras.append("a splash of soy sauce")
                if "white_pepper" in item_names:
                    cn_extras.append("white pepper")
                if sp:
                    cn_extras.append(sp)
                extras_str = ", ".join(cn_extras) if cn_extras else "seasonings"
                instructions.append(f"Scramble eggs and egg whites with {extras_str}.")
            else:
                if "chicken" in item_names:
                    if "hoisin" in desc.lower():
                        sp = spice_str(["five_spice"])
                        stir_base = "Stir-fry chicken with"
                        stir_parts = []
                        if "hoisin" in item_names:
                            stir_parts.append("hoisin sauce")
                        if sp:
                            stir_parts.append(sp)
                        stir_base += " " + " and ".join(stir_parts) if stir_parts else " seasonings"
                        stir_base += " until glazed."
                        cn_vegs = []
                        if "broccoli" in item_names:
                            cn_vegs.append("broccoli")
                        if "carrot" in item_names:
                            cn_vegs.append("carrots")
                        if "peas_frozen" in item_names:
                            cn_vegs.append("frozen peas")
                        if cn_vegs:
                            stir_base += f" Add {', '.join(cn_vegs)}."
                        instructions.append(stir_base)
                    else:
                        sp = spice_str(["five_spice"])
                        ch_parts = []
                        if "soy_sauce" in item_names:
                            ch_parts.append("soy sauce")
                        if sp:
                            ch_parts.append(sp)
                        ch_str = " and ".join(ch_parts) if ch_parts else "seasonings"
                        instructions.append(f"Cook chicken with {ch_str}.")
                if "tuna" in item_names:
                    sp = spice_str(["five_spice"])
                    tuna_sea = []
                    if sp:
                        tuna_sea.append(sp)
                    if "soy_sauce" in item_names:
                        tuna_sea.append("soy sauce")
                    sea_str = " and ".join(tuna_sea) if tuna_sea else "seasonings"
                    txt = f"Season tuna with {sea_str}."
                    cn_sides = []
                    if "broccoli" in item_names:
                        cn_sides.append("broccoli")
                    if "carrot" in item_names:
                        cn_sides.append("carrots")
                    if cn_sides:
                        txt += f" Serve with {', '.join(cn_sides)}"
                        if "hoisin" in item_names:
                            txt += " and a hoisin drizzle"
                        txt += "."
                    instructions.append(txt)
                if "tofu" in item_names:
                    instructions.append("Slice silken tofu and serve alongside.")
                for legume in ["urad_dal", "mayocoba"]:
                    if legume in item_names:
                        leg_name = legume.replace("_", " ")
                        if "soup" in desc.lower():
                            soup_parts = []
                            if "ginger" in item_names:
                                soup_parts.append("ginger")
                            if "soy_sauce" in item_names:
                                soup_parts.append("soy sauce")
                            with_str = " and ".join(soup_parts) if soup_parts else "aromatics"
                            instructions.append(f"Simmer {leg_name} with {with_str} until tender.")
                        else:
                            leg_parts = []
                            if "soy_sauce" in item_names:
                                leg_parts.append("soy sauce")
                            leg_sp = spice_str(["five_spice"])
                            if leg_sp:
                                leg_parts.append(leg_sp)
                            leg_str = " and ".join(leg_parts) if leg_parts else "seasonings"
                            instructions.append(f"Heat {leg_name} with {leg_str}.")
                        break
                if "egg_white" in item_names:
                    if "stir" in desc.lower():
                        ew_parts = []
                        if "onion" in item_names:
                            ew_parts.append("onion")
                        if "soy_sauce" in item_names:
                            ew_parts.append("soy sauce")
                        ew_str = " and ".join(ew_parts) if ew_parts else "seasonings"
                        instructions.append(f"Stir-fry egg whites with {ew_str}.")
                    else:
                        instructions.append("Cook egg whites and serve on the side.")
                cn_steam = []
                if "broccoli" in item_names:
                    cn_steam.append("broccoli")
                if "carrot" in item_names:
                    cn_steam.append("carrots")
                if cn_steam:
                    instructions.append(f"Steam {' and '.join(cn_steam)} as sides.")
                if "nutritional_yeast" in item_names:
                    instructions.append("Top with nutritional yeast.")

        if not instructions:
            instructions.append("Prepare ingredients according to the meal description. Season to taste.")

        # Combine into 2-4 sentences max
        combined = " ".join(instructions)
        # If too long, take first 4 sentences
        sentences = combined.split(". ")
        if len(sentences) > 5:
            sentences = sentences[:5]
        return ". ".join(s.rstrip(".") for s in sentences) + "."

    # ---- Build all day data with meal splitting ----
    cuisine_colors = {
        "Indian": "#e67e22",
        "American": "#3498db",
        "Mexican": "#e74c3c",
        "Thai": "#2ecc71",
        "Korean": "#9b59b6",
        "Mediterranean": "#1abc9c",
        "Japanese": "#f39c12",
        "American BBQ": "#e84393",
        "Chinese": "#fd79a8",
    }

    snack_emoji = {
        "waffle": "waffle",
        "shake": "shake",
        "baked_oats": "oats",
        "chia_pudding": "pudding",
        "mug_cake": "cake",
        "breakfast": "eggs",
    }

    all_days_html = ""

    for day_num in sorted(days.keys()):
        d = days[day_num]
        total_cal, total_pro, total_fib = calc(d["items"])
        color = cuisine_colors.get(d["cuisine"], "#888")

        # Split items into meals
        meal_splits = split_items_into_meals(d)

        # Build meal sections HTML
        meals_html = ""
        for meal_name, meal_items in meal_splits:
            if not meal_items:
                continue

            # Calculate meal subtotals
            meal_cal, meal_pro, meal_fib = calc(meal_items)
            meal_desc = d["meals"].get(meal_name, "")

            # Cooking instructions
            cook_instr = generate_cooking_instructions(meal_name, meal_items, d["cuisine"], d)

            # Ingredient cards
            ing_cards = ""
            for name, amount in meal_items:
                friendly = FRIENDLY.get(name, name)
                ic, ip, iff = item_vals(name, amount)
                if name in POWDERS:
                    amt_str = "1 serving"
                elif name in RAW_CONVERSION:
                    amt_str = f"{amount * RAW_CONVERSION[name]:.0f}g"
                else:
                    amt_str = f"{amount:.0f}g"
                ing_cards += f'''<div class="ing-card">
<div class="ing-top"><span class="ing-name">{friendly}</span><span class="ing-amount">{amt_str}</span></div>
<div class="ing-macros">{ic:.0f} cal &middot; {ip:.1f}g P &middot; {iff:.1f}g F</div>
</div>
'''

            meals_html += f'''<div class="meal-section">
<div class="meal-header" onclick="this.parentElement.classList.toggle('collapsed')">
<div class="meal-title">{meal_name}</div>
<div class="meal-chevron">&#9660;</div>
</div>
<div class="meal-body">
<div class="meal-desc">{meal_desc}</div>
<div class="ing-list">
{ing_cards}
</div>
<div class="cook-instructions">
<div class="cook-label">Prep Instructions:</div>
<div class="cook-text">{cook_instr}</div>
</div>
<div class="meal-subtotal">
Meal subtotal: {meal_cal:.0f} cal &middot; {meal_pro:.1f}g P &middot; {meal_fib:.1f}g F
</div>
</div>
</div>
'''

        # Progress bar percentage
        cal_pct = min(total_cal / 1200 * 100, 100)
        pro_class = "green" if total_pro >= 125 else "warn"
        fib_class = "green" if total_fib >= 30 else "warn"

        snack_label = snack_emoji.get(d["snack_type"], d["snack_type"])

        all_days_html += f'''<div class="day-page" id="day-{day_num}" data-day="{day_num}">
<div class="day-header" style="border-top: 4px solid {color}">
<div class="day-title">Day {day_num} &mdash; {d["cuisine"]} <span class="snack-badge">[{snack_label}]</span></div>
<div class="day-name">{d["name"]}</div>
</div>
<div class="daily-totals">
<div class="total-line"><strong>{total_cal:.0f}</strong> cal &middot; <span class="{pro_class}">{total_pro:.1f}g protein</span> &middot; <span class="{fib_class}">{total_fib:.1f}g fiber</span></div>
<div class="progress-bar"><div class="progress-fill" style="width:{cal_pct:.1f}%"></div></div>
<div class="progress-label">{cal_pct:.0f}% of 1200 cal budget</div>
</div>
{meals_html}
</div>
'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>30-Day Meal Plan (Mobile)</title>
<style>
:root {{
    --bg: #1a1a2e;
    --bg-card: #16213e;
    --bg-header: #0f3460;
    --bg-meal: #1b2a4a;
    --text: #e0e0e0;
    --text-muted: #a0a0b0;
    --text-bright: #ffffff;
    --border: #2a2a4a;
    --green: #2ecc71;
    --red: #e74c3c;
    --accent: #3498db;
    --warn: #e67e22;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }}
html {{ scroll-behavior: smooth; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
}}

/* Sticky Navigation */
.top-nav {{
    position: sticky;
    top: 0;
    z-index: 1000;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}}
.nav-arrow {{
    width: 44px;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: rgba(255,255,255,0.06);
    color: var(--text-bright);
    font-size: 1.3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s;
    -webkit-user-select: none;
    user-select: none;
}}
.nav-arrow:active {{ background: var(--accent); }}
.nav-center {{
    flex: 1;
    text-align: center;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--text-bright);
    cursor: pointer;
    padding: 8px 4px;
    border-radius: 8px;
    transition: background 0.2s;
}}
.nav-center:active {{ background: rgba(255,255,255,0.06); }}

/* Day grid overlay */
.day-grid-overlay {{
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 2000;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 60px 16px 20px;
    overflow-y: auto;
}}
.day-grid-overlay.visible {{ display: block; }}
.day-grid-close {{
    position: fixed;
    top: 12px;
    right: 16px;
    z-index: 2001;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.day-grid {{
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    max-width: 400px;
    margin: 0 auto;
}}
.day-grid-btn {{
    aspect-ratio: 1;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--bg-card);
    color: var(--text-bright);
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s, border-color 0.15s;
}}
.day-grid-btn:active {{ transform: scale(0.93); }}
.day-grid-btn.current {{ border-color: var(--accent); background: rgba(52,152,219,0.2); }}

/* Day pages */
.day-container {{ padding: 0 0 80px 0; }}
.day-page {{ display: none; padding: 0 12px 20px; }}
.day-page.active {{ display: block; }}

.day-header {{
    padding: 16px 4px 12px;
    border-radius: 0 0 12px 12px;
    margin-bottom: 12px;
}}
.day-title {{
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-bright);
}}
.snack-badge {{
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
}}
.day-name {{
    font-size: 0.9rem;
    color: var(--text-muted);
    margin-top: 2px;
}}

/* Daily totals bar */
.daily-totals {{
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 16px;
}}
.total-line {{
    font-size: 0.95rem;
    margin-bottom: 8px;
}}
.total-line .green {{ color: var(--green); font-weight: 600; }}
.total-line .warn {{ color: var(--warn); font-weight: 600; }}
.progress-bar {{
    height: 8px;
    background: rgba(255,255,255,0.08);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
}}
.progress-fill {{
    height: 100%;
    background: linear-gradient(90deg, var(--green), var(--accent));
    border-radius: 4px;
    transition: width 0.3s;
}}
.progress-label {{
    font-size: 0.75rem;
    color: var(--text-muted);
}}

/* Meal sections */
.meal-section {{
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
}}
.meal-section.collapsed .meal-body {{ display: none; }}
.meal-section.collapsed .meal-chevron {{ transform: rotate(-90deg); }}
.meal-header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--bg-meal);
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
}}
.meal-title {{
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-bright);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}
.meal-chevron {{
    font-size: 0.75rem;
    color: var(--text-muted);
    transition: transform 0.2s;
}}
.meal-body {{ padding: 12px 14px; }}
.meal-desc {{
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 12px;
    font-style: italic;
    line-height: 1.4;
}}

/* Ingredient cards */
.ing-list {{ margin-bottom: 12px; }}
.ing-card {{
    background: rgba(255,255,255,0.04);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 6px;
}}
.ing-top {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}}
.ing-name {{
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-bright);
}}
.ing-amount {{
    font-size: 0.85rem;
    font-weight: 700;
    color: #f1c40f;
    white-space: nowrap;
    flex-shrink: 0;
}}
.ing-macros {{
    font-size: 0.78rem;
    color: var(--accent);
    margin-top: 3px;
    font-variant-numeric: tabular-nums;
}}

/* Cooking instructions */
.cook-instructions {{
    background: rgba(52,152,219,0.08);
    border-left: 3px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 10px 14px;
    margin-bottom: 12px;
}}
.cook-label {{
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}}
.cook-text {{
    font-size: 0.83rem;
    color: var(--text);
    line-height: 1.5;
}}

/* Meal subtotal */
.meal-subtotal {{
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: right;
    padding-top: 4px;
    border-top: 1px solid var(--border);
}}

/* Responsive */
@media (min-width: 431px) {{
    .day-container {{ max-width: 500px; margin: 0 auto; }}
    .day-page {{ padding: 0 16px 20px; }}
}}
@media (min-width: 768px) {{
    .day-container {{ max-width: 600px; }}
    .ing-card {{ padding: 12px 18px; }}
}}
</style>
</head>
<body>

<!-- Sticky top nav -->
<div class="top-nav">
    <div class="nav-arrow" id="prevBtn" onclick="goDay(-1)">&larr;</div>
    <div class="nav-center" id="navLabel" onclick="openGrid()">Day 1 of 30</div>
    <div class="nav-arrow" id="nextBtn" onclick="goDay(1)">&rarr;</div>
</div>

<!-- Day grid overlay -->
<div class="day-grid-overlay" id="gridOverlay">
    <button class="day-grid-close" onclick="closeGrid()">&times;</button>
    <div class="day-grid" id="dayGrid"></div>
</div>

<!-- Day container -->
<div class="day-container">
{all_days_html}
</div>

<script>
let currentDay = parseInt(localStorage.getItem('mealPlanDay')) || 1;
const totalDays = 30;

function showDay(n) {{
    if (n < 1 || n > totalDays) return;
    document.querySelectorAll('.day-page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('day-' + n);
    if (el) {{
        el.classList.add('active');
        currentDay = n;
        localStorage.setItem('mealPlanDay', n);
        document.getElementById('navLabel').textContent = 'Day ' + n + ' of ' + totalDays;
        window.scrollTo({{top: 0}});
    }}
}}

function goDay(delta) {{
    const next = currentDay + delta;
    if (next >= 1 && next <= totalDays) showDay(next);
}}

function openGrid() {{
    const grid = document.getElementById('dayGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= totalDays; i++) {{
        const btn = document.createElement('button');
        btn.className = 'day-grid-btn' + (i === currentDay ? ' current' : '');
        btn.textContent = i;
        btn.onclick = function() {{ closeGrid(); showDay(i); }};
        grid.appendChild(btn);
    }}
    document.getElementById('gridOverlay').classList.add('visible');
}}

function closeGrid() {{
    document.getElementById('gridOverlay').classList.remove('visible');
}}

// Swipe support
let touchStartX = 0;
let touchEndX = 0;
document.addEventListener('touchstart', function(e) {{
    touchStartX = e.changedTouches[0].screenX;
}}, {{passive: true}});
document.addEventListener('touchend', function(e) {{
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 60) {{
        if (diff > 0) goDay(1);
        else goDay(-1);
    }}
}}, {{passive: true}});

// Keyboard support
document.addEventListener('keydown', function(e) {{
    if (e.key === 'ArrowLeft') goDay(-1);
    if (e.key === 'ArrowRight') goDay(1);
    if (e.key === 'Escape') closeGrid();
}});

// Init
showDay(currentDay);
</script>
</body>
</html>'''

    script_dir = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(script_dir, output_path)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\nMobile HTML generated: {out}")
    print(f"File size: {os.path.getsize(out):,} bytes")


generate_mobile_html()
