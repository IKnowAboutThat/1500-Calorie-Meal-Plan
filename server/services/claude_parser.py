"""Claude Agent SDK integration for parsing raw recipe text into structured data."""

import os

import anyio
from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query

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

RECIPE_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "name",
        "description",
        "servings",
        "ingredients",
        "instructions",
        "prep_time_min",
        "cook_time_min",
        "marinate_time_min",
        "cuisine",
        "meal_type",
        "main_protein",
    ],
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "servings": {"type": "integer", "minimum": 1},
        "ingredients": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "amount", "unit", "grams_equivalent"],
                "properties": {
                    "name": {"type": "string"},
                    "amount": {"type": "number"},
                    "unit": {"type": "string"},
                    "grams_equivalent": {"type": "number"},
                },
            },
        },
        "instructions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "prep_time_min": {"type": ["integer", "null"], "minimum": 0},
        "cook_time_min": {"type": ["integer", "null"], "minimum": 0},
        "marinate_time_min": {"type": ["integer", "null"], "minimum": 0},
        "cuisine": {"type": "string"},
        "meal_type": {"type": "string", "enum": ["meal", "snack"]},
        "main_protein": {"type": "string"},
    },
}

RECIPE_OUTPUT_FORMAT = {
    "type": "json_schema",
    "name": "recipe_parse",
    "schema": RECIPE_JSON_SCHEMA,
}


def _coerce_int(value, default=None, minimum=None):
    """Convert a value to int when possible, otherwise return the default."""
    if value in (None, ""):
        return default
    try:
        value = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    if minimum is not None and value < minimum:
        return minimum
    return value


class RecipeParseError(RuntimeError):
    """Raised when Claude does not return a valid structured recipe."""


def _expect_type(value, expected_type, field_name):
    """Require a value to have the expected type."""
    if not isinstance(value, expected_type):
        raise RecipeParseError(f"Invalid parser output: '{field_name}' must be {expected_type.__name__}")
    return value


def _normalize_parsed_recipe(data):
    """Validate structured parser output into the shape the rest of the app expects."""
    recipe = _expect_type(data, dict, "recipe")
    normalized_ingredients = []

    ingredients = _expect_type(recipe.get("ingredients"), list, "ingredients")
    for idx, ing in enumerate(ingredients):
        ing = _expect_type(ing, dict, f"ingredients[{idx}]")
        name = str(ing.get("name", "")).strip()
        if not name:
            raise RecipeParseError(f"Invalid parser output: ingredients[{idx}].name is required")

        try:
            amount = float(ing.get("amount"))
            grams = float(ing.get("grams_equivalent"))
        except (TypeError, ValueError):
            raise RecipeParseError(
                f"Invalid parser output: ingredients[{idx}] amount and grams_equivalent must be numeric"
            ) from None

        unit = str(ing.get("unit", "")).strip()
        if not unit:
            raise RecipeParseError(f"Invalid parser output: ingredients[{idx}].unit is required")

        normalized_ingredients.append({
            "name": name,
            "amount": amount,
            "unit": unit,
            "grams_equivalent": grams,
        })

    instructions = _expect_type(recipe.get("instructions"), list, "instructions")
    normalized_instructions = []
    for idx, step in enumerate(instructions):
        if not isinstance(step, str):
            raise RecipeParseError(f"Invalid parser output: instructions[{idx}] must be a string")
        step = step.strip()
        if step:
            normalized_instructions.append(step)

    servings = _coerce_int(recipe.get("servings"), default=None, minimum=1)
    if servings is None:
        raise RecipeParseError("Invalid parser output: 'servings' must be a positive integer")

    prep_time = _coerce_int(recipe.get("prep_time_min"), default=None, minimum=0)
    cook_time = _coerce_int(recipe.get("cook_time_min"), default=None, minimum=0)
    marinate_time = _coerce_int(recipe.get("marinate_time_min"), default=None, minimum=0)

    meal_type = str(recipe.get("meal_type", "")).strip().lower()
    if meal_type not in {"meal", "snack"}:
        raise RecipeParseError("Invalid parser output: 'meal_type' must be 'meal' or 'snack'")

    return {
        "name": str(recipe.get("name", "")).strip(),
        "description": str(recipe.get("description", "") or "").strip(),
        "servings": servings,
        "ingredients": normalized_ingredients,
        "instructions": normalized_instructions,
        "prep_time_min": prep_time,
        "cook_time_min": cook_time,
        "marinate_time_min": marinate_time,
        "cuisine": str(recipe.get("cuisine", "") or "").strip(),
        "meal_type": meal_type,
        "main_protein": str(recipe.get("main_protein", "") or "").strip(),
    }


def _extract_structured_result(message, context):
    """Return structured output or fail loudly with parser context."""
    if message.is_error:
        raise RecipeParseError(
            f"{context} failed: subtype={message.subtype}, stop_reason={message.stop_reason}, result={message.result!r}"
        )
    if message.subtype != "success":
        raise RecipeParseError(
            f"{context} did not complete successfully: subtype={message.subtype}, stop_reason={message.stop_reason}"
        )
    if message.structured_output is None:
        raise RecipeParseError(
            f"{context} returned no structured_output; raw result was {message.result!r}"
        )
    return message.structured_output


async def _parse_recipe_async(text):
    """Async implementation of recipe parsing using Claude Agent SDK."""
    last_result = None
    oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    env = {"CLAUDE_CODE_OAUTH_TOKEN": oauth_token} if oauth_token else {}

    async for message in query(
        prompt=f"Parse this recipe:\n\n{text}",
        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=[],
            env=env,
            output_format=RECIPE_OUTPUT_FORMAT,
        )
    ):
        if isinstance(message, ResultMessage):
            last_result = message

    if last_result is None:
        raise RuntimeError("No response from Claude agent")
    return _normalize_parsed_recipe(_extract_structured_result(last_result, "Recipe parse"))


async def _parse_recipe_image_async(image_base64, image_media_type, text):
    """Async implementation of recipe image parsing using Claude Agent SDK."""
    last_result = None
    oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    env = {"CLAUDE_CODE_OAUTH_TOKEN": oauth_token} if oauth_token else {}

    content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": image_media_type,
                "data": image_base64,
            },
        },
    ]

    prompt_text = "Parse this recipe from the image."
    if text:
        prompt_text += f"\n\nAdditional context from the user:\n{text}"
    content.append({"type": "text", "text": prompt_text})

    async def prompt_iter():
        yield {
            "type": "user",
            "message": {"role": "user", "content": content},
        }

    async for message in query(
        prompt=prompt_iter(),
        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=[],
            env=env,
            output_format=RECIPE_OUTPUT_FORMAT,
        ),
    ):
        if isinstance(message, ResultMessage):
            last_result = message

    if last_result is None:
        raise RuntimeError("No response from Claude agent")
    return _normalize_parsed_recipe(_extract_structured_result(last_result, "Image recipe parse"))


def parse_recipe_text(text):
    """Parse raw recipe text into structured JSON using Claude.

    Args:
        text: Raw recipe text (any format)

    Returns:
        dict with parsed recipe data
    """
    return anyio.run(_parse_recipe_async, text)


def parse_recipe_image(image_base64, image_media_type='image/jpeg', text=''):
    """Parse a recipe from an image using Claude.

    Args:
        image_base64: Base64-encoded image data
        image_media_type: MIME type (image/png, image/jpeg, image/webp)
        text: Optional additional text/instructions from the user

    Returns:
        dict with parsed recipe data
    """
    async def _run():
        return await _parse_recipe_image_async(image_base64, image_media_type, text)
    return anyio.run(_run)
