from __future__ import annotations

from typing import Any
import base64

import aiohttp

from src.config import Settings


class BitrixClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _method_url(self, method_name: str) -> str:
        base = self.settings.bitrix_webhook_url.strip().rstrip("/")
        if not base:
            raise ValueError("BITRIX_WEBHOOK_URL is empty")
        return f"{base}/{method_name}.json"

    async def call(self, method_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        timeout = aiohttp.ClientTimeout(total=25)
        url = self._method_url(method_name)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as resp:
                body = await resp.json(content_type=None)
                if resp.status >= 400:
                    raise RuntimeError(f"Bitrix HTTP {resp.status}: {body}")
                if isinstance(body, dict) and body.get("error"):
                    raise RuntimeError(f"Bitrix API error: {body}")
                return body


async def _pick_best_duplicate_lead(client: BitrixClient, candidate_ids: list[int]) -> int | None:
    if not candidate_ids:
        return None

    # Prefer non-closed leads. If all are closed, return None to create a fresh lead.
    non_closed: list[int] = []
    for lead_id in sorted(set(candidate_ids), reverse=True):
        lead_resp = await client.call("crm.lead.get", {"id": lead_id})
        lead = lead_resp.get("result", {}) or {}
        semantic = (lead.get("STATUS_SEMANTIC_ID") or "").upper()
        if semantic != "F":
            non_closed.append(lead_id)

    if non_closed:
        return max(non_closed)
    return None


async def upsert_lead_to_bitrix(
    settings: Settings,
    lead_fields: dict[str, Any],
    phone: str,
    email: str,
    force_new: bool = False,
) -> tuple[bool, str]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled"

    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build"

    try:
        client = BitrixClient(settings)

        if not force_new:
            duplicate_ids: list[int] = []
            if phone:
                dup_resp = await client.call(
                    "crm.duplicate.findbycomm",
                    {"type": "PHONE", "values": [phone]},
                )
                duplicate_ids = [int(x) for x in dup_resp.get("result", {}).get("LEAD", [])]

            if not duplicate_ids and email:
                dup_resp = await client.call(
                    "crm.duplicate.findbycomm",
                    {"type": "EMAIL", "values": [email]},
                )
                duplicate_ids = [int(x) for x in dup_resp.get("result", {}).get("LEAD", [])]

            selected_duplicate_id = await _pick_best_duplicate_lead(client, duplicate_ids)
            if selected_duplicate_id:
                lead_id = selected_duplicate_id
                lead_fields = dict(lead_fields)
                lead_fields["TITLE"] = f"Бот ТГ | Повторный кандидат-водитель"
                await client.call(
                    "crm.lead.update",
                    {"id": lead_id, "fields": lead_fields},
                )
                return True, f"updated:{lead_id}"

        create_resp = await client.call("crm.lead.add", {"fields": lead_fields})
        lead_id = create_resp.get("result")
        return True, f"created:{lead_id}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def extract_bitrix_lead_id(detail: str) -> int | None:
    # detail format: created:123 or updated:123
    if not detail or ":" not in detail:
        return None
    right = detail.split(":", 1)[1].strip()
    if right.isdigit():
        return int(right)
    return None


async def add_followup_note_to_lead(
    settings: Settings,
    lead_id: int,
    note_text: str,
) -> tuple[bool, str]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled"

    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build"

    try:
        client = BitrixClient(settings)
        lead_resp = await client.call("crm.lead.get", {"id": lead_id})
        current = lead_resp.get("result", {}) or {}
        current_comments = (current.get("COMMENTS") or "").strip()

        merged_comments = (current_comments + "\n\n" + note_text).strip() if current_comments else note_text
        await client.call(
            "crm.lead.update",
            {
                "id": lead_id,
                "fields": {
                    "COMMENTS": merged_comments,
                    "TITLE": "Бот ТГ | Повторное обращение кандидата",
                },
            },
        )
        return True, f"followup_updated:{lead_id}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


async def add_photo_to_lead(
    settings: Settings,
    lead_id: int,
    filename: str,
    content: bytes,
    caption: str = "",
) -> tuple[bool, str]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled"

    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build"

    try:
        client = BitrixClient(settings)
        comment = "[Бот ТГ] Кандидат отправил фото"
        if caption:
            comment += f"\nПодпись: {caption.strip()}"
        payload = {
            "fields": {
                "ENTITY_ID": lead_id,
                "ENTITY_TYPE": "lead",
                "COMMENT": comment,
                "FILES": [[filename, base64.b64encode(content).decode()]],
            }
        }
        resp = await client.call("crm.timeline.comment.add", payload)
        timeline_id = resp.get("result")
        return True, f"photo_attached:{lead_id}:{timeline_id}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


async def add_text_comment_to_lead(
    settings: Settings,
    lead_id: int,
    text: str,
) -> tuple[bool, str, int | None]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled", None
    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build", None
    try:
        client = BitrixClient(settings)
        payload = {
            "fields": {
                "ENTITY_ID": lead_id,
                "ENTITY_TYPE": "lead",
                "COMMENT": text,
            }
        }
        resp = await client.call("crm.timeline.comment.add", payload)
        timeline_id = resp.get("result")
        return True, "ok", int(timeline_id) if timeline_id else None
    except Exception as exc:  # noqa: BLE001
        return False, str(exc), None


async def list_timeline_comments(
    settings: Settings,
    lead_id: int,
    min_comment_id: int,
) -> tuple[bool, str, list[dict[str, Any]]]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled", []
    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build", []
    try:
        client = BitrixClient(settings)
        payload = {
            "filter": {
                "ENTITY_TYPE": "lead",
                "ENTITY_ID": int(lead_id),
                ">ID": int(min_comment_id),
            },
            "order": {"ID": "ASC"},
        }
        resp = await client.call("crm.timeline.comment.list", payload)
        rows = resp.get("result", [])
        if isinstance(rows, dict):
            # Safety fallback in case Bitrix changes shape
            rows = list(rows.values())
        if not isinstance(rows, list):
            rows = []
        return True, "ok", rows
    except Exception as exc:  # noqa: BLE001
        return False, str(exc), []


async def get_lead_status(
    settings: Settings,
    lead_id: int,
) -> tuple[bool, str, str, str]:
    if (settings.bitrix_mode or "disabled").lower() == "disabled":
        return True, "disabled", "", ""
    if (settings.bitrix_mode or "").lower() != "webhook":
        return False, "Only webhook mode is supported in this build", "", ""
    try:
        client = BitrixClient(settings)
        resp = await client.call("crm.lead.get", {"id": int(lead_id)})
        lead = resp.get("result", {}) or {}
        return True, "ok", str(lead.get("STATUS_SEMANTIC_ID") or ""), str(lead.get("STATUS_ID") or "")
    except Exception as exc:  # noqa: BLE001
        return False, str(exc), "", ""
