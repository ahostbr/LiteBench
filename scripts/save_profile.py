"""Save the tuned Qwen 3.6 27B model profile to the LiteBench DB."""
import sqlite3, json, os

db_path = os.path.join(os.environ.get("APPDATA", ""), "litebench", "litebench.db")
print(f"DB: {db_path}")

db = sqlite3.connect(db_path)

db.execute("""CREATE TABLE IF NOT EXISTS model_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_pattern TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    base_system_prompt TEXT NOT NULL DEFAULT '',
    prompt_overrides TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)""")

# Remove existing if present
db.execute("DELETE FROM model_profiles WHERE name = ?", ("Qwen 3.6 27B Tuned",))

# Insert the tuned profile
db.execute(
    "INSERT INTO model_profiles (model_pattern, name, description, base_system_prompt, prompt_overrides) VALUES (?, ?, ?, ?, ?)",
    (
        r"qwen.*3\.6.*27b|qwen3\.6-27b",
        "Qwen 3.6 27B Tuned",
        "Tuned agent harness prompts for Qwen 3.6 27B — 100% on all 8 agent tests (browser, search, code, file, chain, judgment). Covers base and Opus distill variants.",
        "",
        json.dumps({}),
    ),
)
db.commit()

row = db.execute("SELECT * FROM model_profiles WHERE name = ?", ("Qwen 3.6 27B Tuned",)).fetchone()
print(f"Profile saved: id={row[0]}, pattern={row[1]}, name={row[2]}")
print(f"Description: {row[3]}")

# List all profiles
rows = db.execute("SELECT id, model_pattern, name FROM model_profiles ORDER BY name").fetchall()
print(f"\nAll profiles ({len(rows)}):")
for r in rows:
    print(f"  [{r[0]}] {r[2]} — pattern: {r[1]}")

db.close()
print("\nDone.")
