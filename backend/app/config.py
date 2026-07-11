from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    jwt_secret: str

    # Blank until Stage 2 (image pipeline) / Stage 1 (reset emails) need them.
    supabase_url: str = ""
    supabase_service_key: str = ""
    resend_api_key: str = ""

    frontend_origin: str = "http://localhost:5173"
    cookie_domain: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
