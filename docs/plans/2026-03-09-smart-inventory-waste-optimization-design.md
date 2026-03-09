# Smart Inventory & Food Waste Optimization Design

## Overview

Extend the existing meal planning app with grocery purchase unit awareness, real-time ingredient inventory tracking, shelf life intelligence, and waste-optimizing meal plan generation. Built in three phases, each usable on its own.

## Phase 1: Foundation (Purchase Units + Inventory + Auto-Deduct)

### New Database Tables

**`purchase_units`**
- `id` INTEGER PRIMARY KEY
- `ingredient_id` INTEGER FK → ingredients (CASCADE)
- `label` TEXT (e.g., "Pack of 7", "1 lb bag")
- `unit_type` TEXT (count, weight, volume)
- `package_quantity` REAL (e.g., 7 breasts, 1 bag)
- `package_weight_g` REAL (total weight in grams, e.g., 1814g for 4 lb pack)
- `piece_weight_g` REAL (weight per individual piece, nullable)
- `is_preferred` BOOLEAN DEFAULT 0 (learned from purchase history)
- `created_at` TIMESTAMP

Multiple rows per ingredient (pack of 2 vs pack of 7). The `is_preferred` flag is updated based on purchase history — most recently/frequently bought option becomes preferred.

**`ingredient_shelf_life`** (junction table)
- `id` INTEGER PRIMARY KEY
- `ingredient_id` INTEGER FK → ingredients (CASCADE)
- `state` TEXT (raw, cooked, unopened, opened, frozen, marinated)
- `storage_type` TEXT (fridge, freezer, pantry)
- `shelf_life_days` INTEGER
- UNIQUE(ingredient_id, state, storage_type)

Not every ingredient needs every state — only rows that apply. Flexible for future states.

**`inventory`**
- `id` INTEGER PRIMARY KEY
- `ingredient_id` INTEGER FK → ingredients (CASCADE)
- `quantity` REAL
- `unit` TEXT (count, g, oz, ml — natural unit for the ingredient)
- `state` TEXT (raw, cooked, opened, unopened, frozen)
- `storage_type` TEXT (fridge, freezer, pantry)
- `date_acquired` DATE
- `expiry_date` DATE (auto-calculated from shelf life data)
- `purchase_unit_id` INTEGER FK → purchase_units (nullable)
- `updated_at` TIMESTAMP

Each row = one "batch" of an ingredient. Buying chicken twice creates two rows with different expiry dates.

**`purchase_history`**
- `id` INTEGER PRIMARY KEY
- `ingredient_id` INTEGER FK → ingredients (CASCADE)
- `purchase_unit_id` INTEGER FK → purchase_units (CASCADE)
- `quantity_bought` REAL
- `date_purchased` DATE
- `store_name` TEXT (optional)

Powers the "learns your preferences" behavior. Most frequent purchase unit for an ingredient becomes the preferred default.

### Inventory Flow

**Adding to inventory (two paths):**

1. **Shopping list check-off** — Check an item as bought. Dropdown appears with preferred purchase unit pre-selected, alternatives listed, and a "Custom amount" option. Selected quantity enters inventory with auto-calculated expiry date.

2. **Manual add** — In the inventory/pantry view, "Add Item" button. Search ingredient, pick purchase unit or enter custom amount, set state. Expiry auto-calculates.

**Removing from inventory (two paths):**

1. **Auto-deduct on cook** — Tap cooked checkmark on a recipe. Ingredients immediately deducted. Toast notification shows what was removed with an "Adjust" button. Auto-dismisses after 5 seconds.

2. **Manual adjust** — Tap any inventory item to adjust quantity, change state (raw → cooked resets expiry), or remove.

**State transitions affecting shelf life:**
- Buy chicken → raw, fridge, expires in 3 days
- Mark leftover chicken as "cooked" → expiry resets to 5 days from now
- Open a can of beans → state changes to "opened," expiry resets to 5 days
- Freeze raw chicken → state frozen, expiry resets to 180 days

### Tracking Units Per Ingredient Type

Each ingredient tracks quantity in whatever unit makes the most sense:
- Chicken breasts → by count (5 breasts remaining)
- Ground beef → by weight (1.2 lbs remaining)
- Canned beans → by volume (50 oz can)
- Carrots → by weight (1 lb remaining)
- Eggs → by count (8 eggs remaining)

The `purchase_units` table and `inventory.unit` field handle this naturally.

### UI Changes

**Pantry page → Inventory Dashboard:**
- Three tabs: "In Stock" / "Expiring Soon" / "Always Stocked" (preserves current pantry behavior)
- In Stock: grouped by storage location (Fridge, Freezer, Pantry). Each item shows name, quantity in natural units, state badge (raw/cooked/opened), color-coded expiry indicator
- Tap any item to adjust quantity, change state, or remove
- "Add Item" button for manual entry

**Shopping list page:**
- Check-off shows purchase unit dropdown: preferred option pre-selected, alternatives, "Custom amount" at bottom
- Custom entries saved to purchase history for future learning
- First-time ingredients with no purchase data: prompt "How is this sold?" with common options + custom

**Meal planner page:**
- Cooked ✓ triggers inventory deduction
- Toast: "Updated inventory — 6oz chicken breast, 1 cup rice removed" with "Adjust" button (5 second auto-dismiss)

### Data Seeding

Pre-populate `purchase_units` and `ingredient_shelf_life` for all ingredients in the existing 97 recipes. Common items like chicken, rice, canned goods, produce, dairy, eggs, oils, sauces get sensible defaults. App prompts for unknowns on first encounter.

---

## Phase 2: Shelf Life Intelligence

### Auto-Planner Scoring Additions

Two new scoring factors added to the existing algorithm in `auto-plan.js`:

**Expiry urgency (0-30 points):**
- Recipes using ingredients expiring within 3 days get bonus points
- Closer to expiry = more points
- Naturally front-loads perishables to early in the week

**Inventory awareness (0-15 points):**
- Recipes using ingredients already in inventory score higher
- Reduces shopping list size and waste

These are internal algorithm weights — invisible to the user. The planner just "gets smarter."

### UI Additions

**Inventory Dashboard:**
- Color-coded expiry indicators: green (5+ days), yellow (2-4 days), red (1 day or less)
- "Expiring Soon" tab: flat list sorted by expiry, soonest first
- Items expiring within 2 days show "Find recipes" link → searches recipe library for recipes using that ingredient

**Navigation:**
- Badge/counter on Pantry nav tab: "3 items expiring soon"

**Meal planner:**
- Dismissible banner at top: "Chicken breast expires tomorrow — used in: Honey Garlic Chicken, Chicken Stir Fry"
- Nudge escalation: if auto-planner didn't schedule expiring items, the banner appears

---

## Phase 3: Smart Waste Optimization

### Two Planning Controls

**1. Waste tolerance slider (3 positions):**
- **Min Waste** — Reuse perishable ingredients aggressively. Rotate cuisines using pantry sauces/pastes already owned. Chicken 4 nights but different cuisines each night.
- **Flavor Variety (middle)** — Same proteins across different cuisines (chicken in Mexican, Italian, Middle Eastern). Less waste than max variety, still feels diverse.
- **Max Variety** — Different ingredients AND different cuisines. Biggest shopping list, most potential waste. Current behavior.

**2. New ingredient budget: 0 / 2 / 5 / 10**
- "Willing to buy ___ new long-shelf-life ingredients this week"
- Budget only spent on items with shelf life measured in weeks/months: sauces, pastes, spices, condiments
- Never spent on perishables
- Checks inventory first — existing gochujang doesn't cost budget
- Opens up cuisine options proportional to budget
- Over time, pantry diversifies naturally. Even "0 new, min waste" yields great variety after a few weeks of investment.

### Meal Prep Suggestions

After generating a plan, the preview shows a "Prep Tips" section:
- "Cook chicken Monday for Monday + Wednesday meals" (extends shelf life from raw → cooked)
- "Freeze 3 chicken breasts on purchase day for Thursday's recipe"
- Tracks raw vs. cooked shelf life — suggests cooking early to extend usable window

### Purchase Unit Optimization

The planner considers pack sizes when generating plans:
- If buying a pack of 7 chicken breasts, plans enough chicken recipes to use all 7 within their shelf life window
- Prefers recipes that use up exact pack quantities to avoid orphaned portions

---

## Technical Notes

- All new tables use CASCADE deletes on foreign keys (consistent with existing schema)
- Inventory operations (deduct on cook, add on purchase) should be atomic to prevent partial updates
- Purchase preference learning: simple frequency count from purchase_history, most recent purchase breaks ties
- Shelf life pre-population can use USDA guidelines as a baseline
- The variety slider and ingredient budget are stored in user settings (localStorage, consistent with existing pattern)
- Auto-planner changes are additive — new scoring factors layered onto existing algorithm, not replacements
