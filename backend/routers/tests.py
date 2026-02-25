import json
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite
from db import get_db
from models import TestSuiteCreate, TestSuiteOut, TestCaseCreate, TestCaseUpdate, TestCaseOut

router = APIRouter(prefix="/api/suites", tags=["tests"])

# Default test suite — extracted from run_benchmark.py
DEFAULT_TESTS = [
    {
        "test_id": "codegen-1",
        "category": "Code Generation",
        "name": "LRU Cache implementation",
        "system_prompt": "You are a senior software engineer. Return only valid Python code, no markdown fences.",
        "user_prompt": (
            "Implement an LRU Cache class in Python with O(1) get and put operations. "
            "It should support: __init__(capacity: int), get(key: int) -> int (returns -1 if not found), "
            "and put(key: int, value: int). Include type hints. Do NOT use functools."
        ),
        "eval_keywords": ["class", "def get", "def put", "capacity", "-> int"],
        "eval_anti": ["functools"],
        "max_tokens": 600,
    },
    {
        "test_id": "codegen-2",
        "category": "Code Generation",
        "name": "Merge K sorted lists",
        "system_prompt": "You are a senior software engineer. Return only valid Python code, no markdown fences.",
        "user_prompt": (
            "Write a function merge_k_sorted(lists: list[list[int]]) -> list[int] that merges K sorted "
            "lists into one sorted list. Use a min-heap for O(N log K) time complexity. Include type hints."
        ),
        "eval_keywords": ["heapq", "def merge_k_sorted", "-> list"],
        "eval_anti": [],
        "max_tokens": 500,
    },
    {
        "test_id": "bugfind-1",
        "category": "Bug Finding",
        "name": "Spot the off-by-one + mutation bug",
        "system_prompt": "You are a code reviewer. Identify ALL bugs in the code. Be precise about line numbers and fixes.",
        "user_prompt": (
            "Find all bugs in this Python code:\n\n"
            "```python\n"
            "def remove_duplicates(items: list[str]) -> list[str]:\n"
            "    seen = set()\n"
            "    for i in range(len(items)):\n"
            "        if items[i] in seen:\n"
            "            items.pop(i)\n"
            "        else:\n"
            "            seen.add(items[i])\n"
            "    return items\n\n"
            "def binary_search(arr: list[int], target: int) -> int:\n"
            "    low, high = 0, len(arr)\n"
            "    while low <= high:\n"
            "        mid = (low + high) // 2\n"
            "        if arr[mid] == target:\n"
            "            return mid\n"
            "        elif arr[mid] < target:\n"
            "            low = mid + 1\n"
            "        else:\n"
            "            high = mid - 1\n"
            "    return -1\n"
            "```\n\n"
            "List each bug with: line number, what's wrong, and the fix."
        ),
        "eval_keywords": ["pop", "index", "len(arr)", "out of bounds", "IndexError"],
        "eval_anti": [],
        "max_tokens": 800,
    },
    {
        "test_id": "refactor-1",
        "category": "Refactoring",
        "name": "Clean up callback hell",
        "system_prompt": "You are a senior TypeScript engineer. Refactor the code to be clean and modern.",
        "user_prompt": (
            "Refactor this TypeScript to use async/await and proper error handling:\n\n"
            "```typescript\n"
            "function fetchUserData(userId: string, callback: (err: any, data: any) => void) {\n"
            "    fetch('/api/users/' + userId)\n"
            "        .then(res => {\n"
            "            if (!res.ok) {\n"
            "                callback(new Error('Failed'), null);\n"
            "                return;\n"
            "            }\n"
            "            res.json().then(user => {\n"
            "                fetch('/api/posts?userId=' + user.id)\n"
            "                    .then(res2 => {\n"
            "                        res2.json().then(posts => {\n"
            "                            fetch('/api/comments?postIds=' + posts.map((p: any) => p.id).join(','))\n"
            "                                .then(res3 => {\n"
            "                                    res3.json().then(comments => {\n"
            "                                        callback(null, { user, posts, comments });\n"
            "                                    }).catch(e => callback(e, null));\n"
            "                                }).catch(e => callback(e, null));\n"
            "                        }).catch(e => callback(e, null));\n"
            "                    }).catch(e => callback(e, null));\n"
            "            }).catch(e => callback(e, null));\n"
            "        }).catch(e => callback(e, null));\n"
            "}\n"
            "```\n\n"
            "Return the refactored code only."
        ),
        "eval_keywords": ["async", "await", "try", "catch", "throw"],
        "eval_anti": [],
        "max_tokens": 600,
    },
    {
        "test_id": "reason-1",
        "category": "Reasoning",
        "name": "Algorithm complexity analysis",
        "system_prompt": "You are a computer science professor. Be precise and show your reasoning.",
        "user_prompt": (
            "What is the time and space complexity of this code? Show your step-by-step reasoning.\n\n"
            "```python\n"
            "def mystery(n: int) -> int:\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    dp = [0] * (n + 1)\n"
            "    dp[1] = 1\n"
            "    for i in range(2, n + 1):\n"
            "        dp[i] = dp[i-1] + dp[i-2]\n"
            "    return dp[n]\n"
            "```\n\n"
            "Also: what does this function compute?"
        ),
        "eval_keywords": ["O(n)", "Fibonacci", "linear", "space"],
        "eval_anti": [],
        "max_tokens": 500,
    },
    {
        "test_id": "instruct-1",
        "category": "Instruction Following",
        "name": "JSON structured output",
        "system_prompt": "You are an API that ONLY returns valid JSON. No explanation, no markdown, no text outside the JSON object.",
        "user_prompt": (
            'Return a JSON object describing 3 design patterns with fields: '
            '"patterns" (array of objects with "name", "category" (creational/structural/behavioral), '
            '"one_liner" (max 15 words), "languages" (array of strings)). '
            "Pick: Singleton, Observer, and Factory Method."
        ),
        "eval_keywords": ["Singleton", "Observer", "Factory", "creational", "behavioral", "patterns"],
        "eval_anti": ["Here is", "Sure"],
        "eval_json": True,
        "max_tokens": 400,
    },
    {
        "test_id": "instruct-2",
        "category": "Instruction Following",
        "name": "Word count constraint",
        "system_prompt": "Follow the user's instructions EXACTLY.",
        "user_prompt": (
            "Explain what a monad is in functional programming. "
            "Your explanation must be EXACTLY 3 sentences. "
            "Each sentence must start with a different letter. "
            "Do not use the word 'basically'."
        ),
        "eval_keywords": [],
        "eval_anti": ["basically"],
        "eval_sentence_count": 3,
        "max_tokens": 300,
    },
    {
        "test_id": "understand-1",
        "category": "Code Understanding",
        "name": "Explain complex regex",
        "system_prompt": "You are a senior developer explaining code to a junior. Be clear and precise.",
        "user_prompt": (
            "Explain what this regex does, step by step. Then give 3 strings that match and 3 that don't.\n\n"
            r"^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$"
        ),
        "eval_keywords": ["password", "uppercase", "lowercase", "digit", "special", "8", "lookahead"],
        "eval_anti": [],
        "max_tokens": 600,
    },
    {
        "test_id": "reason-2",
        "category": "Reasoning",
        "name": "SQL query from requirements",
        "system_prompt": "You are a database engineer. Write correct, efficient SQL.",
        "user_prompt": (
            "Given these tables:\n"
            "- users(id, name, email, created_at)\n"
            "- orders(id, user_id, total, status, created_at)\n"
            "- order_items(id, order_id, product_id, quantity, price)\n"
            "- products(id, name, category, price)\n\n"
            "Write a single SQL query to find the top 5 users by total spending, but only include users "
            "who have placed at least 3 orders with status='completed', and show their name, email, "
            "total spending, order count, and the most frequently purchased product category. "
            "Handle ties in category by alphabetical order."
        ),
        "eval_keywords": ["JOIN", "GROUP BY", "HAVING", "COUNT", "SUM", "ORDER BY", "LIMIT"],
        "eval_anti": [],
        "max_tokens": 800,
    },
    {
        "test_id": "creative-1",
        "category": "Creative Problem Solving",
        "name": "System design micro-challenge",
        "system_prompt": "You are a systems architect. Be concrete and specific, not hand-wavy.",
        "user_prompt": (
            "Design a rate limiter for an API gateway that supports:\n"
            "1. Per-user rate limits (e.g., 100 req/min)\n"
            "2. Global rate limits (e.g., 10000 req/min total)\n"
            "3. Burst allowance (up to 2x normal rate for 10 seconds)\n"
            "4. Different limits per endpoint\n\n"
            "Describe the data structures, algorithm, and provide a Python implementation "
            "of the core rate-checking logic (not the full server). Keep it under 80 lines."
        ),
        "eval_keywords": ["token bucket", "sliding window", "dict", "time", "def", "class"],
        "eval_anti": [],
        "max_tokens": 1200,
    },
]


def _row_to_case(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "suite_id": row["suite_id"],
        "test_id": row["test_id"],
        "category": row["category"],
        "name": row["name"],
        "system_prompt": row["system_prompt"],
        "user_prompt": row["user_prompt"],
        "eval_keywords": json.loads(row["eval_keywords"]),
        "eval_anti": json.loads(row["eval_anti"]),
        "eval_json": bool(row["eval_json"]),
        "eval_sentence_count": row["eval_sentence_count"],
        "max_tokens": row["max_tokens"],
        "sort_order": row["sort_order"],
    }


def _row_to_suite(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "is_default": bool(row["is_default"]),
        "created_at": row["created_at"],
        "cases": [],
    }


@router.get("", response_model=list[TestSuiteOut])
async def list_suites(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM test_suites ORDER BY is_default DESC, created_at DESC")
    suites = [_row_to_suite(r) for r in await cursor.fetchall()]
    for suite in suites:
        cases_cursor = await db.execute(
            "SELECT * FROM test_cases WHERE suite_id = ? ORDER BY sort_order", (suite["id"],)
        )
        suite["cases"] = [_row_to_case(r) for r in await cases_cursor.fetchall()]
    return suites


@router.post("", response_model=TestSuiteOut, status_code=201)
async def create_suite(body: TestSuiteCreate, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "INSERT INTO test_suites (name, description) VALUES (?, ?)",
        (body.name, body.description),
    )
    await db.commit()
    row = await (await db.execute("SELECT * FROM test_suites WHERE id = ?", (cursor.lastrowid,))).fetchone()
    return {**_row_to_suite(row), "cases": []}


@router.delete("/{suite_id}", status_code=204)
async def delete_suite(suite_id: int, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute("SELECT * FROM test_suites WHERE id = ?", (suite_id,))).fetchone()
    if not existing:
        raise HTTPException(404, "Suite not found")
    await db.execute("DELETE FROM test_cases WHERE suite_id = ?", (suite_id,))
    await db.execute("DELETE FROM test_suites WHERE id = ?", (suite_id,))
    await db.commit()


@router.post("/{suite_id}/cases", response_model=TestCaseOut, status_code=201)
async def create_case(suite_id: int, body: TestCaseCreate, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute("SELECT * FROM test_suites WHERE id = ?", (suite_id,))).fetchone()
    if not existing:
        raise HTTPException(404, "Suite not found")
    cursor = await db.execute(
        """INSERT INTO test_cases (suite_id, test_id, category, name, system_prompt, user_prompt,
           eval_keywords, eval_anti, eval_json, eval_sentence_count, max_tokens, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            suite_id, body.test_id, body.category, body.name,
            body.system_prompt, body.user_prompt,
            json.dumps(body.eval_keywords), json.dumps(body.eval_anti),
            int(body.eval_json), body.eval_sentence_count, body.max_tokens, body.sort_order,
        ),
    )
    await db.commit()
    row = await (await db.execute("SELECT * FROM test_cases WHERE id = ?", (cursor.lastrowid,))).fetchone()
    return _row_to_case(row)


@router.put("/{suite_id}/cases/{case_id}", response_model=TestCaseOut)
async def update_case(suite_id: int, case_id: int, body: TestCaseUpdate, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute(
        "SELECT * FROM test_cases WHERE id = ? AND suite_id = ?", (case_id, suite_id)
    )).fetchone()
    if not existing:
        raise HTTPException(404, "Test case not found")

    updates = body.model_dump(exclude_unset=True)
    if "eval_keywords" in updates:
        updates["eval_keywords"] = json.dumps(updates["eval_keywords"])
    if "eval_anti" in updates:
        updates["eval_anti"] = json.dumps(updates["eval_anti"])
    if "eval_json" in updates:
        updates["eval_json"] = int(updates["eval_json"])
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(f"UPDATE test_cases SET {set_clause} WHERE id = ?", (*updates.values(), case_id))
        await db.commit()

    row = await (await db.execute("SELECT * FROM test_cases WHERE id = ?", (case_id,))).fetchone()
    return _row_to_case(row)


@router.delete("/{suite_id}/cases/{case_id}", status_code=204)
async def delete_case(suite_id: int, case_id: int, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute(
        "SELECT * FROM test_cases WHERE id = ? AND suite_id = ?", (case_id, suite_id)
    )).fetchone()
    if not existing:
        raise HTTPException(404, "Test case not found")
    await db.execute("DELETE FROM test_cases WHERE id = ?", (case_id,))
    await db.commit()


@router.post("/seed-defaults", status_code=201)
async def seed_defaults(db: aiosqlite.Connection = Depends(get_db)):
    # Check if default suite already exists
    existing = await (await db.execute("SELECT id FROM test_suites WHERE is_default = 1")).fetchone()
    if existing:
        return {"message": "Default suite already exists", "suite_id": existing["id"]}

    cursor = await db.execute(
        "INSERT INTO test_suites (name, description, is_default) VALUES (?, ?, 1)",
        ("Default Benchmark Suite", "10 tests covering code gen, bug finding, refactoring, reasoning, and more"),
    )
    suite_id = cursor.lastrowid

    for i, test in enumerate(DEFAULT_TESTS):
        await db.execute(
            """INSERT INTO test_cases (suite_id, test_id, category, name, system_prompt, user_prompt,
               eval_keywords, eval_anti, eval_json, eval_sentence_count, max_tokens, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                suite_id, test["test_id"], test["category"], test["name"],
                test["system_prompt"], test["user_prompt"],
                json.dumps(test.get("eval_keywords", [])), json.dumps(test.get("eval_anti", [])),
                int(test.get("eval_json", False)), test.get("eval_sentence_count"),
                test["max_tokens"], i,
            ),
        )

    await db.commit()
    return {"message": f"Seeded {len(DEFAULT_TESTS)} default tests", "suite_id": suite_id}
