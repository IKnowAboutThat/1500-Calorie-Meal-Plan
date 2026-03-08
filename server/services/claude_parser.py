"""Anthropic SDK integration for parsing raw recipe text into structured data."""

import json
import re
import anthropic

SYSTEM_PROMPT = """You are a recipe parsing assistant. Given raw recipe text, extract structured data and return it as JSON.

Return ONLY valid JSON with this exact structure:
{
  "name": "Recipe Name",
  "description": "Brief description of the dish",
  "servings": 1,
  "ingredients": [
    {
      "name": "ingredient name (plain, no brand prefixes like GF)",
      "amount": 100,
      "unit": "g",
      "grams_equivalent": 100
    }
  ],
  "instructions": [
    "Step 1 text",
    "Step 2 text"
  ],
  "prep_time_min": 10,
  "cook_time_min": 20,
  "marinate_time_min": 0,
  "cuisine": "Italian",
  "meal_type": "meal",
  "main_protein": "chicken"
}

Rules:
- "amount" and "unit" should reflect the recipe's original measurements
- "grams_equivalent" is the amount converted to grams (for nutritional lookup)
- For combined ingredients like "ginger, garlic, scallion", split them into separate entries
- "meal_type" is either "meal" or "snack" based on the dish size/type
- "main_protein" is the primary protein source (chicken, turkey, shrimp, salmon, tuna, tofu, tempeh, beef, pork, etc.)
- If servings aren't specified, estimate based on the recipe
- Keep ingredient names simple and generic (e.g., "chicken breast" not "organic free-range chicken breast")
- Convert volume measurements to grams where reasonable (e.g., 1 tbsp olive oil = 14g)
- If no instructions are provided, return an empty array
- Return ONLY the JSON object, no markdown fences or explanation"""

MODEL = "claude-sonnet-4-20250514"


def parse_recipe_text(text):
    """Parse raw recipe text into structured JSON using Claude.

    Args:
        text: Raw recipe text (any format)

    Returns:
        dict with parsed recipe data
    """
    client = anthropic.Anthropic()

    message = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"Parse this recipe:\n\n{text}"}
        ],
    )

    response_text = message.content[0].text

    # Strip markdown code fences if present
    response_text = re.sub(r'^```(?:json)?\s*\n?', '', response_text, flags=re.MULTILINE)
    response_text = re.sub(r'\n?```\s*$', '', response_text, flags=re.MULTILINE)
    response_text = response_text.strip()

    return json.loads(response_text)
