 
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import logging
from logging.handlers import RotatingFileHandler
from app.env import load_project_env

# Load shared root .env first, then backend/.env as a fallback.
load_project_env()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/shop_billing"
)

# ================= SQL LOGGING =================
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)


class _WinSafeRotatingFileHandler(RotatingFileHandler):
    """RotatingFileHandler that skips rollover when the file is locked (Windows)."""

    def doRollover(self):
        try:
            super().doRollover()
        except PermissionError:
            pass  # Another process holds the file; skip this rotation cycle


sql_log_path = os.path.join(LOG_DIR, "sql.log")
sql_handler = _WinSafeRotatingFileHandler(
    sql_log_path,
    maxBytes=5 * 1024 * 1024,  # 5MB
    backupCount=10,
    encoding="utf-8"
)
sql_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)s | %(message)s"
))

sql_logger = logging.getLogger("sqlalchemy.engine")
sql_logger.setLevel(logging.INFO)
sql_logger.addHandler(sql_handler)
sql_logger.propagate = False

connect_args = {}
if str(DATABASE_URL or "").startswith("postgresql"):
    # Fail fast when DB is down (prevents app "buffering" for long time on startup/requests)
    connect_args = {"connect_timeout": 5}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
