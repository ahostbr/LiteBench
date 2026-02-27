import aiosqlite
from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT 'lm-studio',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_suites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    suite_id INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    eval_keywords TEXT NOT NULL DEFAULT '[]',
    eval_anti TEXT NOT NULL DEFAULT '[]',
    eval_json INTEGER NOT NULL DEFAULT 0,
    eval_sentence_count INTEGER,
    eval_regex TEXT NOT NULL DEFAULT '[]',
    eval_min_length INTEGER,
    max_tokens INTEGER NOT NULL DEFAULT 600,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    suite_id INTEGER NOT NULL REFERENCES test_suites(id),
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    is_thinking INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    avg_score REAL,
    avg_tps REAL,
    total_time_s REAL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
    test_case_id INTEGER NOT NULL REFERENCES test_cases(id),
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    elapsed_s REAL NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    tokens_per_sec REAL NOT NULL DEFAULT 0,
    finish_reason TEXT,
    final_score REAL NOT NULL DEFAULT 0,
    keyword_score REAL NOT NULL DEFAULT 0,
    keyword_hits TEXT NOT NULL DEFAULT '[]',
    keyword_misses TEXT NOT NULL DEFAULT '[]',
    violations TEXT NOT NULL DEFAULT '[]',
    had_thinking INTEGER NOT NULL DEFAULT 0,
    thinking_tokens_approx INTEGER NOT NULL DEFAULT 0,
    answer_length INTEGER NOT NULL DEFAULT 0
);
"""


async def init_db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
