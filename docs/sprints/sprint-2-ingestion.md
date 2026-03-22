# Sprint 2: Recipe Ingestion

## Approach

### Nutrition conversion
The recipes.js ingredients store macros **for the listed amount** (e.g., 180g shrimp = 178 cal).
The DB stores macros **per 100g** so the recipe model can compute: `(amount_g / 100) * per_100g`.

Conversion formula:
```
per_100g = (value_for_amount / amount_g) * 100
```

Example: Shrimp 180g = 178 cal -> calories_per_100g = (178 / 180) * 100 = 98.89

### Missing macro fields
recipes.js only has calories, protein, fiber per ingredient. No fat or carbs.
We store fat_per_100g and carbs_per_100g as NULL in the DB.
The recipe model handles NULL gracefully (treats as 0 in sums).

### Ingredient deduplication
Same ingredient name appears in many recipes with different amounts but consistent
per-100g ratios. We match by lowercase name. First occurrence sets the per-100g values.
Subsequent occurrences are checked for consistency (warn if > 1% difference, which would
indicate the source data has inconsistent nutrition for the same ingredient name).

### Idempotency
- Recipes: skip if name already exists in DB
- Ingredients: reuse existing ID if name matches (case-insensitive)
- recipe_ingredients: only created when the recipe is new

### Error handling
- Any parsing failure = hard error (exit 1)
- Any DB constraint violation = hard error with rollback
- Inconsistent nutrition data = warning printed but continues

### Ingredient categories
The `ingredientCategories` export maps ingredient names to categories.
We use this to populate the `category` field on ingredients.
