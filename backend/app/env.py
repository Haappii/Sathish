import os
from pathlib import Path

from dotenv import dotenv_values


ROOT_CONFIG_EXAMPLE_PATH = Path(__file__).resolve().parents[2] / "config.example.txt"
ROOT_CONFIG_PATH = Path(__file__).resolve().parents[2] / "config.txt"
ROOT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def load_project_env() -> None:
    # Tracked production/shared config lives in config.example.txt.
    # Local config.txt can override it without being committed.
    # Legacy .env files remain as fallbacks.
    merged: dict[str, str] = {}

    for env_path in (
        ROOT_ENV_PATH,
        BACKEND_ENV_PATH,
        ROOT_CONFIG_EXAMPLE_PATH,
        ROOT_CONFIG_PATH,
    ):
        if not env_path.exists():
            continue

        for key, value in dotenv_values(env_path).items():
            if key and value is not None:
                merged[key] = value

    for key, value in merged.items():
        os.environ.setdefault(key, value)
