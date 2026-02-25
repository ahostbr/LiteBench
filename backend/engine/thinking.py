import re


def strip_thinking(text: str) -> tuple[str, str]:
    """
    Strip thinking/reasoning blocks from model output.
    Returns (cleaned_output, thinking_content).
    Handles: <think>...</think>, plain-text "Thinking Process:" blocks.
    """
    thinking = ""

    # 1. <think>...</think> tags (Qwen3.5, DeepSeek R1, etc.)
    think_match = re.search(r'<think>(.*?)</think>', text, flags=re.DOTALL)
    if think_match:
        thinking = think_match.group(1)
        text = re.sub(r'<think>.*?</think>\s*', '', text, flags=re.DOTALL)

    # 2. Unclosed <think> (model ran out of tokens mid-thinking)
    elif '<think>' in text and '</think>' not in text:
        idx = text.index('<think>')
        thinking = text[idx + 7:]
        text = text[:idx]

    # 3. "Thinking Process:\n..." blocks (some Qwen versions)
    tp_match = re.match(r'Thinking Process:\s*\n(.*?)(?=\n\n[A-Z`#]|\Z)', text, flags=re.DOTALL)
    if tp_match and not thinking:
        thinking = tp_match.group(1)
        text = text[tp_match.end():]

    return text.strip(), thinking.strip()
