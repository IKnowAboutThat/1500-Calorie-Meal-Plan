"""Claude Agent SDK integration for parsing raw recipe text into structured data."""

import json
import os
import re
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

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


async def _parse_recipe_async(text):
    """Async implementation of recipe parsing using Claude Agent SDK."""
    result_text = ""
    oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    env = {"CLAUDE_CODE_OAUTH_TOKEN": oauth_token} if oauth_token else {}

    async for message in query(
        prompt=f"Parse this recipe:\n\n{text}",
        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=[],
            env=env,
        )
    ):
        if isinstance(message, ResultMessage):
            result_text = message.result

    if not result_text:
        raise RuntimeError("No response from Claude agent")

    # Strip markdown code fences if present
    result_text = re.sub(r'^```(?:json)?\s*\n?', '', result_text, flags=re.MULTILINE)
    result_text = re.sub(r'\n?```\s*$', '', result_text, flags=re.MULTILINE)
    result_text = result_text.strip()

    return json.loads(result_text)


def parse_recipe_text(text):
    """Parse raw recipe text into structured JSON using Claude.

    Args:
        text: Raw recipe text (any format)

    Returns:
        dict with parsed recipe data
    """
    return anyio.run(_parse_recipe_async, text)
