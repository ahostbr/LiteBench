"""Add the ChatGPT image generation test case to the Agent Suite in the running DB."""
import sqlite3
import json
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "backend" / "litebench.db"

if not DB_PATH.exists():
    print(f"Database not found at {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

# Find the Agent Suite
suite = conn.execute("SELECT id FROM test_suites WHERE name = 'Agent Suite'").fetchone()
if not suite:
    print("Agent Suite not found. Seed it first from the UI.")
    sys.exit(1)

suite_id = suite["id"]

# Check if this test already exists
existing = conn.execute(
    "SELECT id FROM test_cases WHERE suite_id = ? AND test_id = 'agent-browser-2'",
    (suite_id,),
).fetchone()

if existing:
    # Update existing test case with new content
    conn.execute(
        """UPDATE test_cases SET
            category = ?,
            name = ?,
            system_prompt = ?,
            user_prompt = ?,
            eval_keywords = ?,
            eval_anti = ?,
            eval_json = 0,
            eval_sentence_count = NULL,
            eval_regex = '[]',
            eval_min_length = ?,
            max_tokens = ?,
            is_agent_task = 1,
            tool_hints = ?,
            expected_tool_calls = ?
        WHERE id = ?""",
        (
            "Browser Interaction",
            "Navigate, find elements, and interact",
            "You are a web browsing assistant with full browser tools. Use browser_go to navigate, browser_elements to list interactive elements, browser_type to type into inputs, and browser_click to click buttons or links.",
            'Go to https://chatgpt.com. Once the page loads, use browser_elements to find the message input area and the send button. Then use browser_type to type this prompt: "Generate an image: a cyberpunk dragon flying over a neon-lit city at night". Finally, use browser_click to click the send button. Tell me what happened after you clicked send.',
            json.dumps(["chatgpt", "typed", "clicked", "send"]),
            json.dumps(["I cannot browse", "I'm unable to", "I don't have access"]),
            80,
            1200,
            json.dumps(["browser_go", "browser_elements", "browser_type", "browser_click"]),
            4,
            existing["id"],
        ),
    )
    print(f"Updated existing test case agent-browser-2 (id={existing['id']})")
else:
    # Get max sort_order
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) as m FROM test_cases WHERE suite_id = ?",
        (suite_id,),
    ).fetchone()["m"]

    conn.execute(
        """INSERT INTO test_cases (
            suite_id, test_id, category, name, system_prompt, user_prompt,
            eval_keywords, eval_anti, eval_json, eval_sentence_count, eval_regex,
            eval_min_length, max_tokens, sort_order, is_agent_task, tool_hints, expected_tool_calls
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, '[]', ?, ?, ?, 1, ?, ?)""",
        (
            suite_id,
            "agent-browser-2",
            "Browser Interaction",
            "Navigate, find elements, and interact",
            "You are a web browsing assistant with full browser tools. Use browser_go to navigate, browser_elements to list interactive elements, browser_type to type into inputs, and browser_click to click buttons or links.",
            'Go to https://chatgpt.com. Once the page loads, use browser_elements to find the message input area and the send button. Then use browser_type to type this prompt: "Generate an image: a cyberpunk dragon flying over a neon-lit city at night". Finally, use browser_click to click the send button. Tell me what happened after you clicked send.',
            json.dumps(["chatgpt", "typed", "clicked", "send"]),
            json.dumps(["I cannot browse", "I'm unable to", "I don't have access"]),
            80,
            1200,
            max_order + 1,
            json.dumps(["browser_go", "browser_elements", "browser_type", "browser_click"]),
            4,
        ),
    )
    print(f"Inserted new test case agent-browser-2 (sort_order={max_order + 1})")

# Also fix agent-browser-1 if it has stale tool names
browser1 = conn.execute(
    "SELECT id, tool_hints, system_prompt FROM test_cases WHERE suite_id = ? AND test_id = 'agent-browser-1'",
    (suite_id,),
).fetchone()

if browser1 and "browser_navigate" in (browser1["tool_hints"] or ""):
    conn.execute(
        """UPDATE test_cases SET
            system_prompt = ?,
            eval_keywords = ?,
            tool_hints = ?,
            expected_tool_calls = 1
        WHERE id = ?""",
        (
            "You are a web browsing assistant. Use browser_go to navigate to URLs and read page content. Summarize what you find accurately.",
            json.dumps(["Example Domain", "heading", "link"]),
            json.dumps(["browser_go"]),
            browser1["id"],
        ),
    )
    print(f"Fixed stale tool names in agent-browser-1 (id={browser1['id']})")

conn.commit()

# Show all agent test cases
print(f"\nAgent Suite (id={suite_id}) test cases:")
rows = conn.execute(
    "SELECT test_id, name, tool_hints, expected_tool_calls FROM test_cases WHERE suite_id = ? ORDER BY sort_order",
    (suite_id,),
).fetchall()
for row in rows:
    hints = json.loads(row["tool_hints"] or "[]")
    print(f"  {row['test_id']:25s} {row['name']:45s} tools: {hints}  expected: {row['expected_tool_calls']}")

conn.close()
print("\nDone. Test case is live in the running app — no rebuild needed.")
