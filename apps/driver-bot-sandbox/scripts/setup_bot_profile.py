"""Set bot profile info (description + short description + commands)."""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aiogram import Bot
from aiogram.types import BotCommand

from src.config import get_settings
from src.models import load_bot_profile


COMMANDS = [
    ("start", "Начать квиз"),
    ("restart", "Начать заново"),
    ("help", "Помощь"),
]


async def main() -> None:
    settings = get_settings()
    profile = load_bot_profile(settings.bots_file, settings.bot_slug)

    bot = Bot(token=profile.token)
    await bot.set_my_description(profile.full_description)
    await bot.set_my_short_description(profile.short_description)
    await bot.set_my_commands([BotCommand(command=c, description=d) for c, d in COMMANDS])

    await bot.session.close()
    print(f"Profile updated for @{profile.username}")
    print("Note: bot avatar cannot be changed via Bot API; use @BotFather -> /setuserpic")


if __name__ == "__main__":
    asyncio.run(main())
