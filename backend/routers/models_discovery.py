from fastapi import APIRouter, Depends, HTTPException
import aiosqlite
from openai import OpenAI
import asyncio
from db import get_db

router = APIRouter(prefix="/api/endpoints", tags=["models"])


@router.get("/{endpoint_id}/models")
async def discover_models(endpoint_id: int, db: aiosqlite.Connection = Depends(get_db)):
    row = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (endpoint_id,))).fetchone()
    if not row:
        raise HTTPException(404, "Endpoint not found")

    client = OpenAI(base_url=row["base_url"], api_key=row["api_key"])

    try:
        result = await asyncio.to_thread(lambda: client.models.list())
        models = [{"id": m.id, "object": m.object} for m in result.data]
        return {"models": models}
    except Exception as e:
        raise HTTPException(502, f"Failed to connect to endpoint: {e}")
