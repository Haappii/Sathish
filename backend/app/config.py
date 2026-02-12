# app/config.py
from pathlib import Path
import os

from dotenv import load_dotenv

# Load backend/.env early (if present)
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=False)


class Settings:
    SECRET_KEY = os.getenv("JWT_SECRET", "haappii-billing-secret-key")
    ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 24 * 60)
    )  # 1 Day


settings = Settings()
