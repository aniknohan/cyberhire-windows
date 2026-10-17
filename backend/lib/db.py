"""Shared database handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from lib.localdb import ASCENDING, DESCENDING, IndexModel, LocalClient
from lib.paths import DATA_DIR

load_dotenv(Path(__file__).parent.parent / ".env")

# Desktop build: an embedded, file-backed database replaces the MongoDB server.
# It lives in the user's app-data folder (DATA_DIR) and keeps the motor API the app uses.
client = LocalClient(DATA_DIR / "soc-interview-simulator.db")
db = client[os.environ.get("DB_NAME", "soc_interview_simulator")]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "interviews": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                   IndexModel([("user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)], name="user_status_created")],
    "turns": [IndexModel([("interview_id", ASCENDING), ("round_index", ASCENDING), ("created_at", ASCENDING)], name="iv_round_created")],
    "responses": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                  IndexModel([("interview_id", ASCENDING), ("round_index", ASCENDING), ("created_at", ASCENDING)], name="iv_round_created"),
                  IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)], name="user_created"),
                  IndexModel([("seed_question_id", ASCENDING)], name="seed_q")],
    "practice_sessions": [IndexModel([("user_id", ASCENDING), ("module", ASCENDING), ("created_at", DESCENDING)], name="user_module_created")],
    "drills": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created")],
    "payment_transactions": [IndexModel([("session_id", ASCENDING)], name="session_id", unique=True)],
    "questions": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("round", ASCENDING)], name="round")],
    "personas": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "scenarios": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "company_templates": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
