from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS
from db import init_db
from routers import endpoints, models_discovery, tests, benchmarks


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


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "litebench"}
