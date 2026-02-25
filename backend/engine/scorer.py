import json
import re
from engine.thinking import strip_thinking


def score_response(test: dict, response: str) -> dict:
    """Score a response based on keyword presence/absence. Strips thinking for fair eval."""
    cleaned, thinking = strip_thinking(response)
    had_thinking = len(thinking) > 50

    # Use cleaned output for scoring (the actual answer, not the reasoning)
    eval_text = cleaned if cleaned else response
    eval_lower = eval_text.lower()

    # Keyword hits
    hits, misses = [], []
    for kw in test.get("eval_keywords", []):
        if kw.lower() in eval_lower:
            hits.append(kw)
        else:
            misses.append(kw)

    # Anti-pattern violations (only in the actual output, not thinking)
    violations = []
    for anti in test.get("eval_anti", []):
        if anti.lower() in eval_lower:
            violations.append(anti)

    # Base score
    keyword_total = len(test.get("eval_keywords", []))
    keyword_score = len(hits) / keyword_total if keyword_total > 0 else 1.0
    anti_penalty = len(violations) * 0.2

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
    truncation_penalty = 0
    if not cleaned and had_thinking:
        truncation_penalty = 0.5

    final_score = min(1.0, max(0, keyword_score - anti_penalty + json_bonus + sentence_bonus - truncation_penalty))

    return {
        "keyword_score": round(keyword_score, 2),
        "keyword_hits": hits,
        "keyword_misses": misses,
        "violations": violations,
        "final_score": round(final_score, 2),
        "had_thinking": had_thinking,
        "thinking_tokens_approx": len(thinking.split()) if thinking else 0,
        "answer_length": len(cleaned),
    }
