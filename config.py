from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    app_username: str
    app_password: str
    session_secret: str
    db_path: str = "wcs_cache.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
