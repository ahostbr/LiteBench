import json
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite
from db import get_db
from models import EndpointCreate, EndpointUpdate, EndpointOut

router = APIRouter(prefix="/api/endpoints", tags=["endpoints"])


def _row_to_endpoint(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "base_url": row["base_url"],
        "api_key": row["api_key"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
    }


@router.get("", response_model=list[EndpointOut])
async def list_endpoints(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM endpoints ORDER BY created_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_endpoint(r) for r in rows]


@router.post("", response_model=EndpointOut, status_code=201)
async def create_endpoint(body: EndpointCreate, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        "INSERT INTO endpoints (name, base_url, api_key) VALUES (?, ?, ?)",
        (body.name, body.base_url, body.api_key),
    )
    await db.commit()
    row = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (cursor.lastrowid,))).fetchone()
    return _row_to_endpoint(row)


@router.put("/{endpoint_id}", response_model=EndpointOut)
async def update_endpoint(endpoint_id: int, body: EndpointUpdate, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (endpoint_id,))).fetchone()
    if not existing:
        raise HTTPException(404, "Endpoint not found")

    updates = body.model_dump(exclude_unset=True)
    if "is_active" in updates:
        updates["is_active"] = int(updates["is_active"])
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(f"UPDATE endpoints SET {set_clause} WHERE id = ?", (*updates.values(), endpoint_id))
        await db.commit()

    row = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (endpoint_id,))).fetchone()
    return _row_to_endpoint(row)


@router.delete("/{endpoint_id}", status_code=204)
async def delete_endpoint(endpoint_id: int, db: aiosqlite.Connection = Depends(get_db)):
    existing = await (await db.execute("SELECT * FROM endpoints WHERE id = ?", (endpoint_id,))).fetchone()
    if not existing:
        raise HTTPException(404, "Endpoint not found")
    await db.execute("DELETE FROM endpoints WHERE id = ?", (endpoint_id,))
    await db.commit()
