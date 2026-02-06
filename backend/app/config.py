# app/config.py
import os


class Settings:
    SECRET_KEY = os.getenv("JWT_SECRET", "haappii-billing-secret-key")
    ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 24 * 60)
    )  # 1 Day


settings = Settings()
