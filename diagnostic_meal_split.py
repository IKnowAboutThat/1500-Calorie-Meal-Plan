#!/usr/bin/env python3
"""Diagnostic script to audit the split_items_into_meals() logic.
Imports data and logic from meal_plan_validator.py without modifying it.
"""

import sys
import os
import re

# We'll exec the validator up to and including the days dict + DB + POWDERS,
# then duplicate the splitting logic to test it.

# First, extract globals we need by running the file up to the validation section
validator_path = os.path.join(os.path.dirname(__file__), "meal_plan_validator.py")

# Read the source
with open(validator_path, "r") as f:
    source = f.read()

# Extract everything before the validation section (line "# VALIDATION")
cutoff = source.find("# ============================================================\n# VALIDATION")
if cutoff == -1:
    print("ERROR: Could not find VALIDATION section in meal_plan_validator.py")
    sys.exit(1)

preamble = source[:cutoff]

# Execute the preamble to get DB, POWDERS, days, calc, etc.
ns = {}
exec(preamble, ns)

DB = ns["DB"]
POWDERS = ns["POWDERS"]
days = ns["days"]
calc = ns["calc"]

# Now extract the splitting logic from generate_mobile_html
# We'll re-create it here to test it standalone

# Category sets (must match the file exactly)
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
          "curry_powder", "italian_seasoning", "cajun_seasoning", "sesame_seeds"}
OTHER = {"pbfit", "nutritional_yeast", "cacao", "bone_broth"}

ALL_CATEGORIES = PROTEINS | LEGUMES | VEGETABLES | GRAINS | SEEDS | SAUCES | FATS | SPICES | OTHER


def split_items_into_meals(d):
    """Exact copy of the splitting logic from generate_mobile_html."""
    snack_type = d["snack_type"]
    items = dict(d["items"])  # name -> amount
    meal_keys = list(d["meals"].keys())
    meals_desc = d["meals"]
    is_breakfast = d.get("breakfast", False)
    structure = d.get("structure", "2 meals + 1 snack")

    meals = {}

    if is_breakfast and snack_type == "breakfast":
        snack_key = "Breakfast"
    else:
        snack_key = None
        for k in meal_keys:
            if k.lower() == "snack":
                snack_key = k
                break
        if snack_key is None:
            snack_key = "Snack"

    snack_items = []
    remaining = dict(items)

    def take(name, amount=None):
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
        r = take("egg_white", 33)
        if r: snack_items.append(r)
        r = take("chia")
        if r: snack_items.append(r)
        r = take("psyllium")
        if r: snack_items.append(r)
        r = take("flax")
        if r: snack_items.append(r)

    elif snack_type == "breakfast":
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
        desc_lower = meals_desc.get("Breakfast", "").lower()
        if "kimchi" in desc_lower:
            r = take("kimchi")
            if r: snack_items.append(r)

    snack_items = [x for x in snack_items if x is not None]
    meals[snack_key] = snack_items

    if snack_type == "breakfast" and "Fiber drink" in meals_desc:
        fiber_items = []
        r = take("psyllium")
        if r:
            fiber_items.append(r)
        meals["Fiber drink"] = fiber_items

    other_meal_keys = [k for k in meal_keys if k != snack_key and k not in meals]

    if is_breakfast and snack_type != "breakfast":
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
            desc_lower = meals_desc.get(bfast_key, "").lower()
            for veg in ["tomato", "bell_pepper", "onion", "kimchi"]:
                if veg.replace("_", " ") in desc_lower or veg in desc_lower:
                    r = take(veg)
                    if r: bfast_items.append(r)
            if "soy sauce" in desc_lower or "soy" in desc_lower:
                r = take("soy_sauce")
                if r: bfast_items.append(r)
            meals[bfast_key] = bfast_items
            other_meal_keys = [k for k in other_meal_keys if k != bfast_key]

    if len(other_meal_keys) == 0:
        pass
    elif len(other_meal_keys) == 1:
        meal_key = other_meal_keys[0]
        meals[meal_key] = list(remaining.items())
    else:
        for mk in other_meal_keys:
            meals[mk] = []

        desc_map = {mk: meals_desc.get(mk, "").lower() for mk in other_meal_keys}
        assigned = set()

        for protein in PROTEINS:
            if protein in remaining:
                target = None
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if protein in desc or protein.replace("_", " ") in desc:
                        target = mk
                        break
                    if protein == "chicken" and ("chicken" in desc or "tandoori" in desc or "tikka" in desc or "buffalo" in desc):
                        target = mk
                        break
                    if protein == "salmon_can" and ("salmon" in desc):
                        target = mk
                        break
                if target is None:
                    target = other_meal_keys[0]
                meals[target].append((protein, remaining.pop(protein)))
                assigned.add(protein)

        if "tofu" in remaining:
            target = None
            for mk in other_meal_keys:
                if "tofu" in desc_map[mk]:
                    target = mk
                    break
            if target is None:
                target = other_meal_keys[0]
            meals[target].append(("tofu", remaining.pop("tofu")))

        for legume in LEGUMES:
            if legume in remaining:
                target = None
                legume_friendly = legume.replace("_", " ")
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if legume_friendly in desc or legume in desc:
                        target = mk
                        break
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
                    target = other_meal_keys[-1] if len(other_meal_keys) > 1 else other_meal_keys[0]
                meals[target].append((legume, remaining.pop(legume)))

        if "egg_white" in remaining:
            ew_total = remaining["egg_white"]
            ew_meals = []
            for mk in other_meal_keys:
                desc = desc_map[mk]
                if "egg white" in desc or "egg whites" in desc or "bhurji" in desc:
                    ew_meals.append(mk)

            if len(ew_meals) == 0:
                meals[other_meal_keys[-1]].append(("egg_white", remaining.pop("egg_white")))
            elif len(ew_meals) == 1:
                meals[ew_meals[0]].append(("egg_white", remaining.pop("egg_white")))
            else:
                per_meal = ew_total / len(ew_meals)
                for i, mk in enumerate(ew_meals):
                    desc = desc_map[mk]
                    match = re.search(r'(\d+)\s*(?:egg )?whites?', desc)
                    if match:
                        count = int(match.group(1))
                        amt = count * 33
                    else:
                        amt = per_meal
                    amt = min(amt, ew_total)
                    if i == len(ew_meals) - 1:
                        amt = ew_total
                    meals[mk].append(("egg_white", amt))
                    ew_total -= amt
                    if ew_total <= 0:
                        break
                remaining.pop("egg_white")

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
                    target = other_meal_keys[0]
                meals[target].append((veg, remaining.pop(veg)))

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

        for fat in list(FATS):
            if fat in remaining:
                target = None
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if fat in desc or fat.replace("_", " ") in desc:
                        target = mk
                        break
                if target is None:
                    if fat == "ghee":
                        for mk in other_meal_keys:
                            if "dal" in desc_map[mk]:
                                target = mk
                                break
                    if target is None:
                        target = other_meal_keys[0]
                meals[target].append((fat, remaining.pop(fat)))

        for spice in list(SPICES):
            if spice in remaining:
                target = None
                spice_friendly = spice.replace("_", " ")
                for mk in other_meal_keys:
                    desc = desc_map[mk]
                    if spice_friendly in desc or spice in desc:
                        target = mk
                        break
                    if spice == "tandoori_masala" and "tandoori" in desc:
                        target = mk
                        break
                    if spice == "garam_masala" and ("garam masala" in desc or "masala" in desc):
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
                    target = other_meal_keys[0]
                meals[target].append((spice, remaining.pop(spice)))

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

    ordered = []
    for mk in meal_keys:
        if mk in meals:
            ordered.append((mk, meals[mk]))
    return ordered


# ============================================================
# DIAGNOSTIC CHECKS
# ============================================================

def calc_items_calories(items_list):
    """Calculate total calories for a list of (name, amount) tuples."""
    total = 0.0
    for name, amount in items_list:
        if name in POWDERS:
            c, p, f = POWDERS[name]
            total += c * amount
        elif name in DB:
            c, p, f = DB[name]
            total += c * amount / 100
        else:
            pass  # unknown
    return round(total, 2)


def calc_items_grams(items_list):
    """Return dict of item_name -> total grams across the list."""
    totals = {}
    for name, amount in items_list:
        totals[name] = totals.get(name, 0) + amount
    return totals


print("=" * 80)
print("MEAL SPLITTING DIAGNOSTIC REPORT")
print("=" * 80)

issues_found = 0
peas_in_snack = []
spice_issues = []
empty_meals = []
lost_items_days = []
fiber_drink_issues = []
other_category_issues = []
egg_white_issues = []
calorie_mismatches = []

for day_num in sorted(days.keys()):
    d = days[day_num]
    day_items = dict(d["items"])
    day_cal = calc_items_calories(d["items"])

    result = split_items_into_meals(d)

    print(f"\n--- Day {day_num}: {d['name']} (snack_type={d['snack_type']}, breakfast={d.get('breakfast', False)}) ---")
    print(f"    Structure: {d.get('structure', '2 meals + 1 snack')}")
    print(f"    Meal keys defined: {list(d['meals'].keys())}")

    # Print meal assignments
    all_split_items = []
    meal_calories = {}
    for meal_name, items in result:
        meal_cal = calc_items_calories(items)
        meal_calories[meal_name] = meal_cal
        item_strs = [f"{name}={amount}g" if name not in POWDERS else f"{name}={amount}srv" for name, amount in items]
        print(f"    {meal_name} ({meal_cal:.0f} cal): {', '.join(item_strs) if item_strs else '** EMPTY **'}")
        all_split_items.extend(items)

    # CHECK 1: Lost items
    split_grams = calc_items_grams(all_split_items)
    day_grams = {}
    for name, amount in d["items"]:
        day_grams[name] = day_grams.get(name, 0) + amount

    lost = {}
    for name, expected in day_grams.items():
        actual = split_grams.get(name, 0)
        if abs(actual - expected) > 0.01:
            lost[name] = (expected, actual)

    if lost:
        issues_found += 1
        lost_items_days.append(day_num)
        print(f"    !! LOST/MISMATCHED ITEMS: {lost}")

    # CHECK 2: Empty meals
    for meal_name, items in result:
        if len(items) == 0:
            issues_found += 1
            empty_meals.append((day_num, meal_name))
            print(f"    !! EMPTY MEAL: {meal_name}")

    # CHECK 3: Meals defined but missing from result
    result_meal_names = {m[0] for m in result}
    for mk in d["meals"].keys():
        if mk not in result_meal_names:
            issues_found += 1
            print(f"    !! MEAL KEY NOT IN RESULT: {mk}")

    # CHECK 4: peas_frozen in snack?
    for meal_name, items in result:
        item_names = {n for n, _ in items}
        if "peas_frozen" in item_names and meal_name.lower() in ("snack", "breakfast"):
            issues_found += 1
            peas_in_snack.append(day_num)
            print(f"    !! peas_frozen assigned to {meal_name}")

    # CHECK 5: Spices assigned or unassigned?
    for spice in SPICES:
        if spice in day_grams:
            found_in = None
            for meal_name, items in result:
                for n, a in items:
                    if n == spice:
                        found_in = meal_name
                        break
                if found_in:
                    break
            if found_in is None:
                issues_found += 1
                spice_issues.append((day_num, spice))
                print(f"    !! SPICE NOT ASSIGNED: {spice}")

    # CHECK 6: Fiber drink on breakfast days
    if d.get("breakfast", False) and d["snack_type"] == "breakfast":
        if "Fiber drink" in d["meals"]:
            fiber_has_items = False
            for meal_name, items in result:
                if meal_name == "Fiber drink" and len(items) > 0:
                    fiber_has_items = True
            if not fiber_has_items:
                issues_found += 1
                fiber_drink_issues.append(day_num)
                print(f"    !! FIBER DRINK EMPTY on breakfast day")

    # CHECK 7: "other" category items assigned?
    for other_item in OTHER:
        if other_item in day_grams:
            found_in = None
            for meal_name, items in result:
                for n, a in items:
                    if n == other_item:
                        found_in = meal_name
                        break
                if found_in:
                    break
            if found_in is None:
                issues_found += 1
                other_category_issues.append((day_num, other_item))
                print(f"    !! OTHER ITEM NOT ASSIGNED: {other_item}")

    # CHECK 8: egg_white amounts sum correctly
    if "egg_white" in day_grams:
        expected_ew = day_grams["egg_white"]
        actual_ew = sum(a for n, a in all_split_items if n == "egg_white")
        if abs(actual_ew - expected_ew) > 0.5:
            issues_found += 1
            egg_white_issues.append((day_num, expected_ew, actual_ew))
            print(f"    !! EGG WHITE MISMATCH: expected {expected_ew}g, got {actual_ew}g (diff={actual_ew - expected_ew:+.1f}g)")

    # CHECK 9: Calorie comparison
    split_cal = sum(meal_calories.values())
    if abs(split_cal - day_cal) > 1.0:
        issues_found += 1
        calorie_mismatches.append((day_num, day_cal, split_cal))
        print(f"    !! CALORIE MISMATCH: day total={day_cal:.1f}, split total={split_cal:.1f}, diff={split_cal - day_cal:+.1f}")


# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

if issues_found == 0:
    print("ALL CHECKS PASSED - No issues found across all 30 days.")
else:
    print(f"TOTAL ISSUES FOUND: {issues_found}")

    if lost_items_days:
        print(f"\n  Lost/mismatched items on days: {lost_items_days}")

    if empty_meals:
        print(f"\n  Empty meals:")
        for day_num, meal_name in empty_meals:
            print(f"    Day {day_num}: {meal_name}")

    if peas_in_snack:
        print(f"\n  peas_frozen incorrectly in snack on days: {peas_in_snack}")
    else:
        print(f"\n  peas_frozen: NEVER assigned to snack (correct)")

    if spice_issues:
        print(f"\n  Unassigned spices:")
        for day_num, spice in spice_issues:
            print(f"    Day {day_num}: {spice}")
    else:
        print(f"\n  Spices: All correctly assigned")

    if fiber_drink_issues:
        print(f"\n  Empty Fiber drink on breakfast days: {fiber_drink_issues}")
    else:
        print(f"\n  Fiber drink: Correctly populated on all breakfast days")

    if other_category_issues:
        print(f"\n  Unassigned 'other' category items:")
        for day_num, item in other_category_issues:
            print(f"    Day {day_num}: {item}")
    else:
        print(f"\n  Other category items (nutritional_yeast, ghee, etc.): All correctly assigned")

    if egg_white_issues:
        print(f"\n  Egg white amount mismatches:")
        for day_num, expected, actual in egg_white_issues:
            print(f"    Day {day_num}: expected {expected}g, got {actual}g (diff={actual - expected:+.1f}g)")
    else:
        print(f"\n  Egg whites: All amounts sum correctly")

    if calorie_mismatches:
        print(f"\n  Calorie mismatches (split meals vs day total):")
        for day_num, day_cal, split_cal in calorie_mismatches:
            print(f"    Day {day_num}: day={day_cal:.1f} cal, split={split_cal:.1f} cal, diff={split_cal - day_cal:+.1f}")
    else:
        print(f"\n  Calories: All split totals match day totals")

# Additional: check if peas_frozen never in snack across all days
if not peas_in_snack:
    print(f"\n  CONFIRMED: peas_frozen is never assigned to a snack meal")

print(f"\n{'=' * 80}")
print(f"END OF DIAGNOSTIC REPORT")
print(f"{'=' * 80}")
