"""Shared utility for parsing JavaScript object/array literals into Python data.

Handles unquoted keys, single-line comments, trailing commas, and
colons/special characters inside string values without corruption.
"""

import re


def js_to_json(js_text: str) -> str:
    """Convert a JavaScript object/array literal to valid JSON string.

    Handles:
    - Unquoted object keys (e.g., `name:` -> `"name":`)
    - Single-line comments (`// ...`)
    - Trailing commas before `}` or `]`
    - Single-quoted strings converted to double-quoted
    - Colons inside string values (e.g., `"Bowl: Salmon"`) preserved correctly
    """
    result = []
    i = 0
    length = len(js_text)

    while i < length:
        ch = js_text[i]

        # Skip string literals verbatim
        if ch in ('"', "'"):
            quote = ch
            result.append('"')  # Always use double quotes in JSON
            i += 1
            while i < length:
                c = js_text[i]
                if c == '\\':
                    result.append(c)
                    i += 1
                    if i < length:
                        result.append(js_text[i])
                    i += 1
                    continue
                if c == quote:
                    result.append('"')
                    i += 1
                    break
                result.append(c)
                i += 1
            continue

        # Skip single-line comments
        if ch == '/' and i + 1 < length and js_text[i + 1] == '/':
            while i < length and js_text[i] != '\n':
                i += 1
            continue

        # Unquoted object key: sequence of word chars followed by ':'
        if ch.isalpha() or ch == '_':
            key_match = re.match(r'(\w+)\s*:', js_text[i:])
            if key_match:
                key = key_match.group(1)
                result.append(f'"{key}":')
                i += key_match.end()
                continue

        # Remove trailing commas before } or ]
        if ch == ',':
            look = i + 1
            while look < length and js_text[look] in ' \t\n\r':
                look += 1
            if look < length and js_text[look] in '}]':
                i += 1
                continue

        result.append(ch)
        i += 1

    return ''.join(result)


def extract_js_export(content: str, var_name: str, bracket: str = '[') -> str:
    """Extract and return the raw JS literal for an `export const <var_name> = <bracket>...`.

    Args:
        content: Full file content
        var_name: The variable name to find (e.g., 'recipes')
        bracket: Opening bracket type ('[' for arrays, '{' for objects)

    Returns:
        The raw JS text of the literal (including brackets).

    Raises:
        RuntimeError if the export or closing bracket is not found.
    """
    close_bracket = ']' if bracket == '[' else '}'
    escaped_bracket = re.escape(bracket)
    pattern = rf"export\s+const\s+{re.escape(var_name)}\s*=\s*{escaped_bracket}"
    match = re.search(pattern, content)
    if not match:
        raise RuntimeError(f"Could not find 'export const {var_name} = {bracket}' in file.")

    start = content.index(bracket, match.start())
    depth = 0
    for i in range(start, len(content)):
        if content[i] == bracket:
            depth += 1
        elif content[i] == close_bracket:
            depth -= 1
            if depth == 0:
                return content[start: i + 1]

    raise RuntimeError(f"Could not find closing '{close_bracket}' for {var_name}.")
