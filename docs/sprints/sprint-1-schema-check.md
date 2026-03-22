# Sprint 1: Recipe Schema Check

## Findings from `app/js/data/recipes.js`

### File structure
- `export const recipes = [...]` — 100 recipe objects (days 1-30, 3-4 per day)
- `export const mealPlan = [...]` — day-level plan referencing recipe IDs
- `export const ingredientCategories = {...}` — ingredient name -> category mapping
- `export const adrenalCocktail = {...}` — standalone supplement object

### Recipe-level fields (all present on every recipe)
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | kebab-case slug |
| `name` | string | yes | display name |
| `mealType` | string | yes | "meal" or "snack" |
| `cuisine` | string | yes | e.g. "Japanese", "Indian" |
| `mainProtein` | string | yes | e.g. "shrimp", "chicken" |
| `calories` | number | yes | total recipe calories |
| `protein` | number | yes | total recipe protein (g) |
| `fiber` | number | yes | total recipe fiber (g) |
| `ingredients` | array | yes | see below |
| `tags` | array of strings | yes | dietary/convenience tags |
| `dayOrigin` | number | yes | 1-30 |
| `mealSlot` | string | yes | "Meal 1", "Meal 2", "Meal 3", "Snack" |
| `phase` | string | yes | "standard", "luteal" |
| `servings` | number | yes | always 1 in current data |

### Ingredient-level fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | ingredient display name |
| `amount` | number | yes | quantity in specified unit |
| `unit` | string | yes | always "g" in current data |
| `calories` | number | yes | calories for that amount |
| `protein` | number | yes | protein (g) for that amount |
| `fiber` | number | yes | fiber (g) for that amount |

### Notable absences
- **No `fat` or `carbs`** on ingredients (only calories, protein, fiber)
- **No `description` or `instructions`** on recipes
- **No time fields** (prep_time, cook_time, etc.)

### Validation approach
The schema checker parses the JS export using regex + json5-style parsing,
then validates every recipe and ingredient against the expected schema above.
