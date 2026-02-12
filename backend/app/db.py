 
from pathlib import Path
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import logging
from logging.handlers import RotatingFileHandler

# Load backend/.env early (if present)
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/shop_billing"
)

# ================= SQL LOGGING =================
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

sql_log_path = os.path.join(LOG_DIR, "sql.log")
sql_handler = RotatingFileHandler(
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

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
