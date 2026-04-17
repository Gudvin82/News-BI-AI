from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    bot_slug: str = "youpiter_quiz_bot"
    telegram_bot_token: str = ""
    bots_config_path: str = "config/bots.json"
    leads_db_path: str = "data/leads.sqlite3"
    debug: bool = False

    bitrix_mode: str = "webhook"  # webhook | api | disabled
    bitrix_webhook_url: str = ""
    bitrix_api_url: str = ""
    bitrix_access_token: str = ""
    bitrix_assigned_by_id: int = 1

    model_config = SettingsConfigDict(
        env_file="config/.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def root_dir(self) -> Path:
        return Path(__file__).resolve().parent.parent

    @property
    def bots_file(self) -> Path:
        return self.root_dir / self.bots_config_path

    @property
    def leads_db_file(self) -> Path:
        return self.root_dir / self.leads_db_path


@lru_cache
def get_settings() -> Settings:
    return Settings()
