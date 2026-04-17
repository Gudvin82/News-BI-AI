from __future__ import annotations

from aiogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    ReplyKeyboardMarkup,
    KeyboardButton,
)


def single_choice_kb(options: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=text, callback_data=f"single:{key}")] for key, text in options]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def multi_choice_kb(
    options: list[tuple[str, str]],
    selected: set[str],
) -> InlineKeyboardMarkup:
    rows = []
    for key, text in options:
        mark = "[x]" if key in selected else "[ ]"
        rows.append(
            [InlineKeyboardButton(text=f"{mark} {text}", callback_data=f"multi_toggle:{key}")]
        )
    rows.append([InlineKeyboardButton(text="Далее", callback_data="multi_next")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def offices_kb(offices: list[str]) -> InlineKeyboardMarkup:
    rows = []
    for idx, office in enumerate(offices):
        rows.append([InlineKeyboardButton(text=office, callback_data=f"office:{idx}")])
    rows.append([InlineKeyboardButton(text="🌐 Сайт Youpiter Taxi", url="https://youpiter.taxi/")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def park_choice_kb(offices: list[tuple[str, str]]) -> InlineKeyboardMarkup:
    rows = []
    for idx, (metro, address) in enumerate(offices):
        rows.append([InlineKeyboardButton(text=f"{metro} — {address}", callback_data=f"park:{idx}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def quick_menu_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="📝 Начать анкету")],
            [
                KeyboardButton(text="💰 Условия работы"),
                KeyboardButton(text="📍 Адреса автопарков"),
            ],
            [
                KeyboardButton(text="🌐 Сайт"),
                KeyboardButton(text="📞 Позвонить"),
            ],
            [
                KeyboardButton(text="⏰ Поторопить менеджера"),
                KeyboardButton(text="📄 Текущая заявка"),
            ],
        ],
        resize_keyboard=True,
    )


def consent_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Принимаю условия", callback_data="consent_accept")],
            [InlineKeyboardButton(text="🌐 Сайт компании", url="https://youpiter.taxi/")],
        ]
    )


def site_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть сайт", url="https://youpiter.taxi/")]]
    )
