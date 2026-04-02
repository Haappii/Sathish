from pathlib import Path

from dotenv import load_dotenv


ROOT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def load_project_env() -> None:
    # Prefer the shared root .env. Keep backend/.env as a legacy fallback.
    load_dotenv(dotenv_path=ROOT_ENV_PATH, override=False)
    load_dotenv(dotenv_path=BACKEND_ENV_PATH, override=False)
