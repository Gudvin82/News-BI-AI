from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import json


@dataclass
class Option:
    key: str
    text: str
    order: int = 100


@dataclass
class Question:
    key: str
    text: str
    answer_type: str
    options: list[Option] = field(default_factory=list)


@dataclass
class ContactForm:
    ask_name_text: str
    ask_phone_text: str
    ask_email_text: str
    after_submit_text: str


@dataclass
class Scenario:
    slug: str
    title: str
    welcome_messages: list[dict[str, Any]]
    questions: list[Question]
    contact_form: ContactForm


@dataclass
class BotProfile:
    slug: str
    token: str
    display_name: str
    username: str
    short_description: str
    full_description: str
    scenario_slug: str


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_bot_profile(bots_file: Path, slug: str, token_override: str = "") -> BotProfile:
    data = _load_json(bots_file)
    bots = data.get("bots", [])
    for item in bots:
        if item.get("slug") == slug:
            raw_token = token_override.strip() or str(item.get("token", "")).strip()
            if not raw_token:
                raise ValueError(
                    f"Token is empty for bot slug '{slug}'. Set TELEGRAM_BOT_TOKEN in config/.env "
                    "or provide token in config/bots.json"
                )
            return BotProfile(
                slug=item["slug"],
                token=raw_token,
                display_name=item.get("display_name", ""),
                username=item.get("username", ""),
                short_description=item.get("short_description", ""),
                full_description=item.get("full_description", ""),
                scenario_slug=item["scenario_slug"],
            )
    raise ValueError(f"Bot slug '{slug}' not found in {bots_file}")


def load_scenario(root_dir: Path, scenario_slug: str) -> Scenario:
    path = root_dir / "config" / "scenarios" / f"{scenario_slug}.json"
    data = _load_json(path)

    questions: list[Question] = []
    for item in data.get("questions", []):
        options = [
            Option(
                key=o["key"],
                text=o["text"],
                order=int(o.get("order", 100)),
            )
            for o in item.get("options", [])
        ]
        options.sort(key=lambda x: x.order)
        questions.append(
            Question(
                key=item["key"],
                text=item["text"],
                answer_type=item["answer_type"],
                options=options,
            )
        )

    contact_data = data.get("contact_form", {})
    contact_form = ContactForm(
        ask_name_text=contact_data.get("ask_name_text", "Как вас зовут?"),
        ask_phone_text=contact_data.get("ask_phone_text", "Оставьте ваш телефон:"),
        ask_email_text=contact_data.get("ask_email_text", "Оставьте email для связи:"),
        after_submit_text=contact_data.get(
            "after_submit_text",
            "Спасибо! Мы скоро свяжемся с вами.",
        ),
    )

    return Scenario(
        slug=data["slug"],
        title=data.get("title", data["slug"]),
        welcome_messages=sorted(
            data.get("welcome_messages", []),
            key=lambda m: int(m.get("delay_seconds", 0)),
        ),
        questions=questions,
        contact_form=contact_form,
    )
