import os
import logging

from app.env import load_project_env

load_project_env()

_logger = logging.getLogger(__name__)

_INSECURE_DEFAULT = "haappii-billing-secret-key"


class Settings:
    SECRET_KEY: str = os.getenv("JWT_SECRET", _INSECURE_DEFAULT)
    ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 24 * 60)
    )  # 1 Day

    # CORS — comma-separated list of allowed origins.
    # Example: ALLOWED_ORIGINS=https://app.myshop.com,https://admin.myshop.com
    ALLOWED_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if o.strip()
    ] or ["*"]

    # Deployment environment: "production" triggers stricter checks.
    ENV: str = os.getenv("APP_ENV", "development").lower()

    def validate(self) -> None:
        """
        Warn loudly about insecure defaults.
        Called once at startup from main.py.
        """
        if self.SECRET_KEY == _INSECURE_DEFAULT:
            _logger.warning(
                "SECURITY WARNING: JWT_SECRET is using the insecure default value. "
                "Set JWT_SECRET in your .env file before going to production."
            )
        if self.ENV == "production" and self.SECRET_KEY == _INSECURE_DEFAULT:
            raise RuntimeError(
                "JWT_SECRET must be changed from the default before running in production. "
                "Set JWT_SECRET in your environment or .env file."
            )
        if self.ENV == "production" and "*" in self.ALLOWED_ORIGINS:
            raise RuntimeError(
                "ALLOWED_ORIGINS must be set to specific origins in production. "
                "Set ALLOWED_ORIGINS=https://yourdomain.com in your environment or .env file."
            )


settings = Settings()
