import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "litebench.db"
DEFAULT_ENDPOINT = "http://169.254.83.107:1234/v1"
CORS_ORIGINS = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
