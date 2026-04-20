from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS
from db import init_db
from routers import endpoints, models_discovery, tests, benchmarks, profiles


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Clean up stale "running" runs left over from a previous crash/restart
    import aiosqlite
    from config import DB_PATH
    from datetime import datetime
    async with aiosqlite.connect(str(DB_PATH)) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE benchmark_runs SET status = 'failed', completed_at = ? WHERE status = 'running'",
            (now,),
        )
        # Migrate: add eval_regex and eval_min_length columns if missing
        try:
            await db.execute("SELECT eval_regex FROM test_cases LIMIT 1")
        except Exception:
            await db.execute("ALTER TABLE test_cases ADD COLUMN eval_regex TEXT NOT NULL DEFAULT '[]'")
        try:
            await db.execute("SELECT eval_min_length FROM test_cases LIMIT 1")
        except Exception:
            await db.execute("ALTER TABLE test_cases ADD COLUMN eval_min_length INTEGER")

        # Migrate: add mode column to benchmark_runs
        try:
            await db.execute("SELECT mode FROM benchmark_runs LIMIT 1")
        except Exception:
            await db.execute("ALTER TABLE benchmark_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'baseline'")

        # Migrate: create model_profiles table
        await db.execute("""CREATE TABLE IF NOT EXISTS model_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_pattern TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            base_system_prompt TEXT NOT NULL DEFAULT '',
            prompt_overrides TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )""")

        # Migrate: add response_schema and eval_mode columns to test_cases
        try:
            await db.execute("SELECT response_schema FROM test_cases LIMIT 1")
        except Exception:
            await db.execute("ALTER TABLE test_cases ADD COLUMN response_schema TEXT NOT NULL DEFAULT '{}'")
        try:
            await db.execute("SELECT eval_mode FROM test_cases LIMIT 1")
        except Exception:
            await db.execute("ALTER TABLE test_cases ADD COLUMN eval_mode TEXT NOT NULL DEFAULT 'keyword'")

        # Bump max_tokens for tight default test cases
        token_bumps = {
            "codegen-2": 800,
            "reason-1": 1000,
            "instruct-1": 600,
            "instruct-2": 400,
        }
        for test_id, new_max in token_bumps.items():
            await db.execute(
                "UPDATE test_cases SET max_tokens = ? WHERE test_id = ? AND max_tokens < ?",
                (new_max, test_id, new_max),
            )
        await db.commit()
    yield


app = FastAPI(title="LiteBench", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router)
app.include_router(models_discovery.router)
app.include_router(tests.router)
app.include_router(benchmarks.router)
app.include_router(profiles.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "litebench"}
