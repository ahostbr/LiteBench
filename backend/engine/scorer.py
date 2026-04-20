import json
import re
from engine.thinking import strip_thinking


def score_response(test: dict, response: str) -> dict:
    """Score a response based on keyword presence/absence, regex patterns, and length. Strips thinking for fair eval."""
    cleaned, thinking = strip_thinking(response)
    had_thinking = len(thinking) > 50

    # Use full response (including thinking) for keyword matching —
    # agent tasks emit tool calls inside reasoning blocks
    eval_text = cleaned if cleaned else response
    full_lower = response.lower()
    eval_lower = eval_text.lower()

    # Keyword hits — search full response so thinking-phase tool calls count
    hits, misses = [], []
    for kw in test.get("eval_keywords", []):
        if kw.lower() in full_lower:
            hits.append(kw)
        else:
            misses.append(kw)

    # Anti-pattern violations (only in the actual output, not thinking)
    violations = []
    for anti in test.get("eval_anti", []):
        if anti.lower() in eval_lower:
            violations.append(anti)

    # Base keyword score
    keyword_total = len(test.get("eval_keywords", []))
    keyword_score = len(hits) / keyword_total if keyword_total > 0 else 1.0
    anti_penalty = len(violations) * 0.2

    # Regex pattern matching
    regex_patterns = test.get("eval_regex", [])
    regex_score = 0.0
    regex_hits = 0
    if regex_patterns:
        for pattern in regex_patterns:
            try:
                if re.search(pattern, eval_text, re.DOTALL):
                    regex_hits += 1
            except re.error:
                pass  # Skip invalid patterns
        regex_score = regex_hits / len(regex_patterns) if regex_patterns else 0.0

    # Combine keyword + regex into base score
    if regex_patterns:
        base_score = (keyword_score + regex_score) / 2
    else:
        base_score = keyword_score

    # Bonus: valid JSON check
    json_bonus = 0
    if test.get("eval_json"):
        try:
            json_text = eval_text.strip()
            if json_text.startswith("```"):
                json_text = re.sub(r'^```\w*\n?', '', json_text)
                json_text = re.sub(r'\n?```$', '', json_text)
            json.loads(json_text)
            json_bonus = 0.1
        except (json.JSONDecodeError, ValueError):
            pass

    # Bonus: sentence count check
    sentence_bonus = 0
    target_sentences = test.get("eval_sentence_count")
    if target_sentences:
        sentences = [s.strip() for s in re.split(r'[.!?]+', eval_text) if s.strip()]
        if len(sentences) == target_sentences:
            sentence_bonus = 0.3
        elif abs(len(sentences) - target_sentences) <= 1:
            sentence_bonus = 0.1

    # Truncation penalty — if model was still thinking when tokens ran out
    # But don't penalize if all keywords were found (model completed the task in thinking)
    truncation_penalty = 0
    if not cleaned and had_thinking and len(misses) > 0:
        truncation_penalty = 0.5

    # Min length penalty — penalize terse answers on tests requiring detail
    length_penalty = 0
    eval_min_length = test.get("eval_min_length")
    if eval_min_length and len(eval_text) < eval_min_length:
        length_penalty = 0.3

    keyword_final = min(1.0, max(0, base_score - anti_penalty + json_bonus + sentence_bonus - truncation_penalty - length_penalty))

    # Schema validation scoring
    eval_mode = test.get("eval_mode", "keyword")
    response_schema = test.get("response_schema", {})
    schema_score = 0.0
    schema_errors = []

    if eval_mode in ("schema", "both") and response_schema and response_schema != {}:
        schema_result = _validate_schema(eval_text, response_schema)
        schema_score = schema_result["score"]
        schema_errors = schema_result["errors"]

    if eval_mode == "keyword":
        final_score = keyword_final
    elif eval_mode == "schema":
        final_score = schema_score
    else:  # both — take minimum (Sentinel: explicit combination)
        final_score = min(keyword_final, schema_score) if response_schema and response_schema != {} else keyword_final

    return {
        "keyword_score": round(keyword_score, 2),
        "keyword_hits": hits,
        "keyword_misses": misses,
        "violations": violations,
        "final_score": round(final_score, 2),
        "schema_score": round(schema_score, 2),
        "schema_errors": schema_errors,
        "had_thinking": had_thinking,
        "thinking_tokens_approx": len(thinking.split()) if thinking else 0,
        "answer_length": len(cleaned),
    }


def _validate_schema(response_text: str, schema: dict) -> dict:
    """Validate a response against a JSON schema. Returns score 0-1 and error list."""
    try:
        parsed = json.loads(response_text)
    except (json.JSONDecodeError, ValueError):
        return {"score": 0.0, "errors": ["Response is not valid JSON"]}

    errors = []
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    if not properties:
        return {"score": 1.0 if isinstance(parsed, dict) else 0.0, "errors": []}

    total_fields = len(properties)
    present_fields = 0

    for field, field_schema in properties.items():
        if isinstance(parsed, dict) and field in parsed:
            present_fields += 1
            expected_type = field_schema.get("type")
            value = parsed[field]
            if expected_type == "string" and not isinstance(value, str):
                errors.append(f"Field '{field}' expected string, got {type(value).__name__}")
            elif expected_type == "number" and not isinstance(value, (int, float)):
                errors.append(f"Field '{field}' expected number, got {type(value).__name__}")
            elif expected_type == "integer" and not isinstance(value, int):
                errors.append(f"Field '{field}' expected integer, got {type(value).__name__}")
            elif expected_type == "boolean" and not isinstance(value, bool):
                errors.append(f"Field '{field}' expected boolean, got {type(value).__name__}")
            elif expected_type == "array" and not isinstance(value, list):
                errors.append(f"Field '{field}' expected array, got {type(value).__name__}")
            elif expected_type == "object" and not isinstance(value, dict):
                errors.append(f"Field '{field}' expected object, got {type(value).__name__}")
        elif field in required:
            errors.append(f"Required field '{field}' missing")

    field_score = present_fields / total_fields if total_fields > 0 else 1.0
    type_penalty = len(errors) * 0.1
    score = max(0.0, field_score - type_penalty)

    return {"score": round(score, 2), "errors": errors}
