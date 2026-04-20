import json
import re
from fastapi import APIRouter, Depends, HTTPException
import aiosqlite
from db import get_db
from models import ModelProfileCreate, ModelProfileUpdate, ModelProfileOut

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


def _row_to_profile(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "model_pattern": row["model_pattern"],
        "name": row["name"],
        "description": row["description"],
        "base_system_prompt": row["base_system_prompt"],
        "prompt_overrides": json.loads(row["prompt_overrides"]),
        "created_at": row["created_at"],
    }


@router.get("/")
async def list_profiles(db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM model_profiles ORDER BY name")
    rows = await cursor.fetchall()
    return [_row_to_profile(r) for r in rows]


@router.post("/")
async def create_profile(body: ModelProfileCreate, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute(
        """INSERT INTO model_profiles (model_pattern, name, description, base_system_prompt, prompt_overrides)
           VALUES (?, ?, ?, ?, ?)""",
        (body.model_pattern, body.name, body.description,
         body.base_system_prompt, json.dumps(body.prompt_overrides)),
    )
    await db.commit()
    row = await (await db.execute("SELECT * FROM model_profiles WHERE id = ?", (cursor.lastrowid,))).fetchone()
    return _row_to_profile(row)


@router.put("/{profile_id}")
async def update_profile(profile_id: int, body: ModelProfileUpdate, db: aiosqlite.Connection = Depends(get_db)):
    row = await (await db.execute("SELECT * FROM model_profiles WHERE id = ?", (profile_id,))).fetchone()
    if not row:
        raise HTTPException(404, "Profile not found")

    updates = {}
    if body.model_pattern is not None:
        updates["model_pattern"] = body.model_pattern
    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if body.base_system_prompt is not None:
        updates["base_system_prompt"] = body.base_system_prompt
    if body.prompt_overrides is not None:
        updates["prompt_overrides"] = json.dumps(body.prompt_overrides)

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE model_profiles SET {set_clause} WHERE id = ?",
            (*updates.values(), profile_id),
        )
        await db.commit()

    row = await (await db.execute("SELECT * FROM model_profiles WHERE id = ?", (profile_id,))).fetchone()
    return _row_to_profile(row)


@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, db: aiosqlite.Connection = Depends(get_db)):
    await db.execute("DELETE FROM model_profiles WHERE id = ?", (profile_id,))
    await db.commit()
    return {"deleted": True}


def match_profile(model_id: str, profiles: list[dict]) -> dict | None:
    """Find the best matching profile for a model_id using regex patterns."""
    for p in profiles:
        if re.search(p["model_pattern"], model_id, re.IGNORECASE):
            return p
    return None
