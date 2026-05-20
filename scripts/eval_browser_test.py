"""
Fast eval: test if a model calls browser_go → browser_elements → browser_type → browser_click
in sequence when given the ChatGPT image gen prompt.

Calls LM Studio directly with mocked tool results. No browser needed. ~10s per run.
"""
import json, sys, time, requests

MODEL = sys.argv[1] if len(sys.argv) > 1 else "qwen/qwen3.6-27b"
ENDPOINT = "http://localhost:1234/v1/chat/completions"

TOOLS = [
    {"type": "function", "function": {"name": "browser_go", "description": "Navigate to a URL and read its content. Returns page title, URL, and text.", "parameters": {"type": "object", "properties": {"url": {"type": "string", "description": "Full URL (https://...)"}}, "required": ["url"]}}},
    {"type": "function", "function": {"name": "browser_elements", "description": "List interactive elements on the current page (links, buttons, inputs). Returns indices for browser_click/browser_type.", "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "browser_click", "description": "Click an element by its index from browser_elements.", "parameters": {"type": "object", "properties": {"index": {"type": "number", "description": "Element index"}}, "required": ["index"]}}},
    {"type": "function", "function": {"name": "browser_type", "description": "Type text into an input. Optionally specify an element index to focus first.", "parameters": {"type": "object", "properties": {"text": {"type": "string", "description": "Text to type"}, "index": {"type": "number", "description": "Element index to focus before typing"}}, "required": ["text"]}}},
    {"type": "function", "function": {"name": "web_search", "description": "Search the web. Returns search results with titles, URLs, and snippets.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "Search query"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "sandbox", "description": "Execute code in an isolated subprocess.", "parameters": {"type": "object", "properties": {"action": {"type": "string"}, "code": {"type": "string"}, "language": {"type": "string"}}, "required": ["action"]}}},
]

MOCK_RESULTS = {
    "browser_go": """Title: ChatGPT
URL: https://chatgpt.com/

ChatGPT - Get instant answers, find creative inspiration, learn something new.

Message ChatGPT

[Page has 12 interactive elements including form inputs. Call browser_elements() to see them.]""",

    "browser_elements": """Interactive elements on "ChatGPT":

0: link "Log in" /auth/login
1: link "Sign up" /auth/login?utm_source=signup
2: div(contenteditable) ""
3: button "Send prompt"
4: button "Search the web"
5: button "Create image"
6: button "Summarize text"
7: link "Terms of use" https://openai.com/policies/terms-of-use
8: link "Privacy policy" https://openai.com/policies/privacy-policy

Use browser_click(index) or browser_type(text, index) to interact.""",

    "browser_type": 'Typed "Generate an image: a cyberpunk dragon flying over a neon-lit city at night" into element 2',
    "browser_click": "Clicked element 3 (Send prompt button). The page is now showing a loading indicator — ChatGPT is generating a response to your image prompt.",
}

SYSTEM_PROMPT = """You are an AI assistant with access to real, working tools. You can search the web, read web pages, browse websites, execute code, and more.

## TOOL DISCIPLINE (CRITICAL — READ THIS CAREFULLY)

Call exactly ONE tool at a time. After each tool call, STOP generating and wait for the result.

Rules:
- ONE tool per message. Never call 2+ tools in the same response.
- NEVER repeat a tool call you already made. If you called browser_go("https://x.com"), do NOT call browser_go again.
- STOP CALLING TOOLS once the user's task is complete. Write your final answer immediately. Do NOT start the sequence over or "verify" by repeating steps.
- After receiving a tool result, either: (a) call the NEXT NEW tool needed, or (b) write your final answer if the task is done.
- Maximum 5 tool calls per task. Fewer is better — stop as soon as the task is fulfilled.

## RESPONDING WITH TOOL RESULTS (MANDATORY)

After your final tool call returns a result, you MUST write a text response to the user.
Do NOT end your turn with just a tool call — always follow up with a written answer.

In your response:
- Include specific data from the tool result (titles, names, numbers, URLs).
- Format lists as numbered items (1. 2. 3.).
- For code execution: state the output value explicitly (e.g. "The output is 55").
- If a tool returned an error, explain what happened and what the result means.
- NEVER produce an empty response. Always write at least one sentence.

## BROWSING WORKFLOW

The complete browsing sequence for interacting with a page:
1. browser_go(url) → navigate and read the page
2. browser_elements() → get clickable/typable element indices
3. browser_type(text, index) or browser_click(index) → interact
4. DONE → write your answer. Do NOT call browser_go again.

After step 3 (click or type), the task is FINISHED. The tool result tells you what happened.
NEVER navigate back to the same URL. NEVER call browser_go twice with the same URL.
browser_elements MUST be called before browser_click or browser_type — you need the element indices.

## TOOL SELECTION
| Task | Tool |
|------|------|
| Search for information | web_search (query) |
| Read a specific URL | browser_go (url) or web_fetch (url) |
| Browse & interact with a site | browser_go → browser_elements → browser_click/type |
| Run code | sandbox (code + language) |

## TOOL ARGUMENT EXAMPLES (use these exact field names)

sandbox: {"action": "execute", "code": "print(2+2)", "language": "python"}
web_search: {"query": "your search terms"}
browser_go: {"url": "https://example.com"}
browser_elements: {} (no arguments needed)
browser_type: {"text": "hello world", "index": 2}
browser_click: {"index": 3}

## RULES
- NEVER say "I cannot access" or "I'm unable to browse" — you have real tools that work.
- Use the native function calling API. Do NOT write tool calls as text or XML.
- ALWAYS include all required arguments. Never send empty {} args."""

USER_PROMPT = """Go to https://chatgpt.com. Once the page loads, use browser_elements to find the message input area and the send button. Then use browser_type to type this prompt: "Generate an image: a cyberpunk dragon flying over a neon-lit city at night". Finally, use browser_click to click the send button. Tell me what happened after you clicked send."""

EXPECTED = ["browser_go", "browser_elements", "browser_type", "browser_click"]
MAX_ITERS = 8


def call_lm(messages):
    r = requests.post(
        ENDPOINT,
        json={"model": MODEL, "messages": messages, "tools": TOOLS, "tool_choice": "auto", "temperature": 0, "stream": False},
        headers={"Authorization": "Bearer lm-studio"},
        timeout=120,
    )
    return r.json()


def run_eval():
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_PROMPT},
    ]
    tools_called = []
    final_text = ""

    for i in range(MAX_ITERS):
        resp = call_lm(messages)
        choice = resp.get("choices", [{}])[0]
        msg = choice.get("message", {})
        text = msg.get("content", "") or ""
        tcs = msg.get("tool_calls", [])

        if text:
            final_text = text

        if not tcs:
            break

        messages.append({
            "role": "assistant",
            "content": text or None,
            "tool_calls": [{"id": tc["id"], "type": "function", "function": tc["function"]} for tc in tcs],
        })

        for tc in tcs:
            name = tc["function"]["name"]
            args_str = tc["function"].get("arguments", "{}")
            try:
                args = json.loads(args_str)
            except Exception:
                args = {}
            tools_called.append(name)
            mock = MOCK_RESULTS.get(name, f"Tool {name} executed successfully")
            messages.append({"role": "tool", "content": mock, "tool_call_id": tc["id"]})
            print(f"  iter {i+1}: {name}({json.dumps(args)[:80]})")

    return tools_called, final_text


def score(tools_called, final_text):
    results = []
    results.append(("browser_go called", "browser_go" in tools_called))
    results.append(("browser_elements called", "browser_elements" in tools_called))
    results.append(("browser_type called", "browser_type" in tools_called))
    results.append(("browser_click called", "browser_click" in tools_called))

    filtered = [t for t in tools_called if t in EXPECTED]
    results.append(("correct sequence order", filtered == EXPECTED))

    lower = final_text.lower()
    no_refusal = "i cannot" not in lower and "i'm unable" not in lower
    results.append(("no refusal", no_refusal))

    passed = sum(1 for _, r in results if r)
    return passed, len(results), results


if __name__ == "__main__":
    print(f"Model: {MODEL}")
    print(f"Expected: {' -> '.join(EXPECTED)}")
    print()

    t0 = time.time()
    tools_called, final_text = run_eval()
    elapsed = time.time() - t0

    passed, total, results = score(tools_called, final_text)

    print(f"\nTools called: {' -> '.join(tools_called) or 'none'}")
    print(f"Score: {passed}/{total} ({passed/total*100:.0f}%)")
    print(f"Time: {elapsed:.1f}s\n")
    for label, r in results:
        print(f"  {'PASS' if r else 'FAIL'} {label}")

    if final_text:
        preview = final_text[:200].replace("\n", " ")
        print(f"\nResponse: {preview}")

    print(f"\n{'=== 100% ALL PASS ===' if passed == total else f'=== {total - passed} FAILURES ==='}")
