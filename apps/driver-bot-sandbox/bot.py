from __future__ import annotations

import asyncio
from io import BytesIO
import logging
import re
from datetime import datetime
from typing import Any
import aiohttp

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import CallbackQuery, Message
from aiogram.types.input_file import BufferedInputFile

from src.bitrix import (
    add_followup_note_to_lead,
    add_photo_to_lead,
    add_text_comment_to_lead,
    extract_bitrix_lead_id,
    get_lead_status,
    list_timeline_comments,
    upsert_lead_to_bitrix,
)
from src.config import get_settings
from src.keyboards import (
    consent_kb,
    multi_choice_kb,
    offices_kb,
    quick_menu_kb,
    single_choice_kb,
    site_kb,
)
from src.models import load_bot_profile, load_scenario
from src.storage import (
    bump_followup_count,
    get_user_last_lead,
    get_bridge_records_full,
    has_user_consent,
    init_db,
    save_lead,
    set_lead_bitrix_id,
    set_user_consent,
    set_user_last_lead,
    update_bridge_cursor,
    update_bridge_status,
    update_bitrix_status,
    upsert_bridge_state,
)

settings = get_settings()
bot_profile = load_bot_profile(
    settings.bots_file,
    settings.bot_slug,
    token_override=settings.telegram_bot_token,
)
scenario = load_scenario(settings.root_dir, bot_profile.scenario_slug)

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

PHONE_RE = re.compile(r"^[+0-9()\-\s]{7,22}$")
MAX_MEDIA_BYTES = 10 * 1024 * 1024

OFFICES = [
    ("Ⓜ️ Старая Деревня", "Мебельная ул., д.2Ж"),
    ("Ⓜ️ Проспект Славы", "Бухарестская ул., д.69"),
    ("Ⓜ️ Лесная", "Литовская ул., д.10"),
    ("Ⓜ️ Автово", "дорога на Турухтанные Острова, д.12"),
    ("Ⓜ️ Девяткино", "Бульвар Менделеева, д.7"),
    ("Ⓜ️ Ладожская", "Магнитогорская ул., д.51М"),
    ("Ⓜ️ Парнас", "ул. Михаила Дудина, д.17"),
    ("Ⓜ️ Купчино", "Шекснинский переулок, уч.3"),
]

PARK_ENUM_MAP = {
    "Старая Деревня": "98",
    "Ладожская": "96",
    "Парнас": "100",
    "Автово": "104",
    "Лесная": "106",
}

CONSENT_TEXT = (
    "Перед началом анкеты подтвердите согласие на обработку персональных данных.\n\n"
    "Оператор: ООО 'САЙРУС АЙТИ СОЛЮШНС'\n"
    "ИНН 7841090051\n"
    "КПП 780101001"
)


class QuizState(StatesGroup):
    answering = State()
    contact_name = State()
    contact_phone = State()


bot = Bot(token=bot_profile.token)
dp = Dispatcher(storage=MemoryStorage())
reminder_tasks: dict[int, asyncio.Task] = {}
bridge_task: asyncio.Task | None = None
MENU_BUTTON_TEXTS = {
    "📝 Начать анкету",
    "💰 Условия работы",
    "📍 Адреса автопарков",
    "🌐 Сайт",
    "📞 Позвонить",
    "⏰ Поторопить менеджера",
    "📄 Текущая заявка",
}


def _build_options(question_index: int) -> list[tuple[str, str]]:
    question = scenario.questions[question_index]
    return [(opt.key, opt.text) for opt in question.options]


def _extract_park_from_answer(raw_text: str) -> tuple[str, str] | None:
    text = (raw_text or "").strip()
    if not text:
        return None

    if text.isdigit():
        idx = int(text) - 1
        if 0 <= idx < len(OFFICES):
            return OFFICES[idx]

    lowered = text.lower()
    for metro, address in OFFICES:
        metro_plain = metro.lower().replace("Ⓜ️ ", "").strip()
        if metro_plain in lowered or address.lower() in lowered:
            return metro, address
    return None


def _humanize_answers(answers: dict[str, Any]) -> list[str]:
    labels = {
        "city": "Удобный автопарк/район",
        "work_scheme": "Формат работы",
        "license_category": "Категория прав",
        "experience": "Стаж вождения",
        "preferred_schedule": "Предпочтительный график",
        "comment": "Комментарий кандидата",
    }
    lines: list[str] = []
    for key in ["city", "work_scheme", "license_category", "experience", "preferred_schedule", "comment"]:
        if key not in answers:
            continue
        value = answers[key]
        if isinstance(value, dict):
            text_value = str(value.get("text") or value.get("key") or value)
        elif isinstance(value, list):
            parts = []
            for item in value:
                if isinstance(item, dict):
                    parts.append(str(item.get("text") or item.get("key") or item))
                else:
                    parts.append(str(item))
            text_value = ", ".join(parts)
        else:
            text_value = str(value)
        lines.append(f"{labels.get(key, key)}: {text_value}")
    return lines


def _cancel_reminder(chat_id: int) -> None:
    task = reminder_tasks.pop(chat_id, None)
    if task and not task.done():
        task.cancel()


def _schedule_reminder(chat_id: int, user_name: str) -> None:
    _cancel_reminder(chat_id)

    async def _job() -> None:
        try:
            await asyncio.sleep(1800)
            await bot.send_message(
                chat_id,
                f"{user_name}, вы не завершили анкету. Если актуально, вернитесь — это займет 1-2 минуты.\n\n"
                "Нажмите «📝 Начать анкету» или напишите /start.",
                reply_markup=quick_menu_kb(),
            )
        except asyncio.CancelledError:
            return

    reminder_tasks[chat_id] = asyncio.create_task(_job())


async def _bridge_poll_loop() -> None:
    while True:
        try:
            records = get_bridge_records_full(settings.leads_db_file)
            for bitrix_lead_id, chat_id, cursor, _last_sem, closed_notified in records:
                ok, detail, rows = await list_timeline_comments(settings, bitrix_lead_id, cursor)
                if not ok:
                    logger.warning("Bridge poll error for lead %s: %s", bitrix_lead_id, detail)
                    continue

                max_id = cursor
                for row in rows:
                    comment_id = int(row.get("ID") or 0)
                    if comment_id <= cursor:
                        continue
                    max_id = max(max_id, comment_id)

                    comment_text = (row.get("COMMENT") or "").strip()
                    # Ignore messages produced by bot side to avoid echo loop.
                    if comment_text.startswith("[Бот ТГ]"):
                        continue

                    files_info = row.get("FILES") or {}
                    if comment_text:
                        await bot.send_message(chat_id, f"Сообщение от менеджера:\n{comment_text}")

                    if isinstance(files_info, dict) and files_info:
                        links = []
                        for f in files_info.values():
                            if not isinstance(f, dict):
                                continue
                            name = f.get("name") or "file"
                            url = f.get("urlDownload") or f.get("urlShow")
                            if url:
                                lower_name = str(name).lower()
                                is_image = any(lower_name.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"])
                                if is_image:
                                    try:
                                        timeout = aiohttp.ClientTimeout(total=20)
                                        async with aiohttp.ClientSession(timeout=timeout) as session:
                                            async with session.get(url) as resp:
                                                if resp.status == 200:
                                                    cl_header = resp.headers.get("Content-Length", "")
                                                    if cl_header.isdigit() and int(cl_header) > MAX_MEDIA_BYTES:
                                                        raise ValueError("manager image too large")
                                                    body = await resp.read()
                                                    if body and len(body) <= MAX_MEDIA_BYTES:
                                                        photo_file = BufferedInputFile(body, filename=name)
                                                        await bot.send_photo(chat_id, photo=photo_file, caption=f"Фото от менеджера: {name}")
                                                        continue
                                    except Exception:
                                        pass
                                links.append(f"{name}: {url}")
                        if links:
                            await bot.send_message(
                                chat_id,
                                "Менеджер отправил вложения:\n" + "\n".join(links),
                            )

                if max_id > cursor:
                    update_bridge_cursor(settings.leads_db_file, bitrix_lead_id, max_id)

                st_ok, _, semantic, status_id = await get_lead_status(settings, bitrix_lead_id)
                if st_ok and semantic:
                    if semantic.upper() == "F" and not closed_notified:
                        await bot.send_message(
                            chat_id,
                            "Ваша заявка закрыта. Если есть вопросы, можете еще раз написать или позвонить нам. Спасибо.",
                        )
                        update_bridge_status(settings.leads_db_file, bitrix_lead_id, semantic, 1)
                    else:
                        update_bridge_status(settings.leads_db_file, bitrix_lead_id, semantic, closed_notified)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bridge loop error: %s", exc)

        await asyncio.sleep(8)


async def _ask_question(message: Message, state: FSMContext, question_index: int) -> None:
    question = scenario.questions[question_index]
    await state.update_data(current_question_index=question_index)
    progress = f"Вопрос {question_index + 1} из {len(scenario.questions)}.\n"
    question_text = question.text

    if question_index == 0:
        office_lines = [f"{idx}. {metro} — {address}" for idx, (metro, address) in enumerate(OFFICES, start=1)]
        question_text = (
            f"{question.text}\n\n"
            f"У нас 8 автопарков в Санкт-Петербурге:\n" + "\n".join(office_lines) + "\n\n"
            "Напишите цифру автопарка (1-8) или текстом район/метро, где вам удобнее."
        )

    if question.answer_type == "text":
        await message.answer(progress + question_text)
        await state.set_state(QuizState.answering)
        return

    options = _build_options(question_index)

    if question.answer_type == "single_choice":
        await message.answer(progress + question_text, reply_markup=single_choice_kb(options))
        await state.set_state(QuizState.answering)
        return

    if question.answer_type == "multi_choice":
        data = await state.get_data()
        selected = set(data.get(f"multi_{question.key}", []))
        await message.answer(progress + question_text, reply_markup=multi_choice_kb(options, selected))
        await state.set_state(QuizState.answering)
        return

    await message.answer("Ошибка сценария: неизвестный тип вопроса.")


async def _go_next(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    idx = int(data.get("current_question_index", 0))
    next_idx = idx + 1

    while next_idx < len(scenario.questions):
        next_q = scenario.questions[next_idx]
        if next_q.key == "preferred_schedule":
            work_scheme = data.get("answers", {}).get("work_scheme", {})
            scheme_key = ""
            if isinstance(work_scheme, dict):
                scheme_key = str(work_scheme.get("key", ""))
            # Вопрос про график нужен только для схемы "Смена"
            if scheme_key != "shift":
                next_idx += 1
                continue
        await _ask_question(message, state, next_idx)
        return

    tg_first_name = str(data.get("tg_first_name", "")).strip()
    if tg_first_name and len(tg_first_name) >= 2:
        await state.update_data(contact_name=tg_first_name)
        await message.answer(f"Имя в анкете: {tg_first_name}")
        await message.answer(scenario.contact_form.ask_phone_text)
        await state.set_state(QuizState.contact_phone)
        return

    await message.answer(scenario.contact_form.ask_name_text)
    await state.set_state(QuizState.contact_name)


async def _upload_pending_photos_for_lead(state: FSMContext, bitrix_lead_id: int) -> int:
    data = await state.get_data()
    pending_photos = data.get("pending_photos", [])
    if not isinstance(pending_photos, list) or not pending_photos:
        return 0

    uploaded = 0
    for item in pending_photos:
        if not isinstance(item, dict):
            continue
        file_id = str(item.get("file_id", "")).strip()
        caption = str(item.get("caption", "")).strip()
        if not file_id:
            continue
        try:
            tg_file = await bot.get_file(file_id)
            if tg_file.file_size and int(tg_file.file_size) > MAX_MEDIA_BYTES:
                continue
            buffer = BytesIO()
            await bot.download(tg_file, destination=buffer)
            content = buffer.getvalue()
            if not content or len(content) > MAX_MEDIA_BYTES:
                continue
            filename = f"candidate_{bitrix_lead_id}_{file_id}.jpg"
            ok, _ = await add_photo_to_lead(settings, bitrix_lead_id, filename, content, caption)
            if ok:
                uploaded += 1
        except Exception:
            continue

    await state.update_data(pending_photos=[])
    return uploaded


async def _begin_quiz(message: Message, state: FSMContext, start_param: str = "") -> None:
    await state.clear()
    await state.update_data(
        answers={},
        start_param=start_param,
        tg_first_name=(message.from_user.first_name or "").strip(),
    )

    user_name = message.from_user.first_name or "Коллега"
    _schedule_reminder(message.chat.id, user_name)

    await message.answer(
        f"<b>Приветствую, {message.from_user.first_name or 'друг'}! Я бот компании Youpiter Taxi.</b>\n\n"
        "<b>Автомобили:</b> Комфорт+.\n"
        "Помогу вам быстро начать работать в такси Санкт-Петербурга на лучших условиях.\n\n"
        "<b>Доход:</b> от 6500₽ за смену.\n"
        "<b>Форматы работы:</b> смена, аренда, раскат (аренда с правом выкупа).\n\n"
        "Я проведу вас по анкете по шагам и зафиксирую заявку.",
        parse_mode="HTML",
        reply_markup=quick_menu_kb(),
    )

    if not scenario.questions:
        await message.answer("Сценарий пуст. Добавьте вопросы в config/scenarios.")
        return

    await _ask_question(message, state, 0)


@dp.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext) -> None:
    text = (message.text or "").strip()
    start_param = ""
    if text.startswith("/start "):
        start_param = text.split(" ", 1)[1].strip()

    if not has_user_consent(settings.leads_db_file, message.chat.id):
        await state.clear()
        await state.update_data(pending_start_param=start_param)
        await message.answer(CONSENT_TEXT, reply_markup=consent_kb())
        return

    await _begin_quiz(message, state, start_param)


@dp.callback_query(F.data == "consent_accept")
async def consent_accept_handler(cb: CallbackQuery, state: FSMContext) -> None:
    set_user_consent(settings.leads_db_file, cb.message.chat.id)
    data = await state.get_data()
    start_param = data.get("pending_start_param", "")

    await cb.answer("Условия приняты. Спасибо!", show_alert=True)
    await cb.message.answer("Отлично, начинаем анкету.")
    await _begin_quiz(cb.message, state, start_param)


@dp.message(F.text == "📝 Начать анкету")
async def menu_start_quiz(message: Message, state: FSMContext) -> None:
    if not has_user_consent(settings.leads_db_file, message.chat.id):
        await message.answer(CONSENT_TEXT, reply_markup=consent_kb())
        return
    await _begin_quiz(message, state)


@dp.message(F.text == "💰 Условия работы")
async def menu_conditions(message: Message) -> None:
    await message.answer(
        "Схемы работы:\n\n"
        "1. Смена: 0₽ аренды, платите только процент с дохода (70/75/80%).\n"
        "2. Аренда: от 2500₽, обслуживание за счет компании, домашнее хранение.\n"
        "3. Раскат: аренда с правом выкупа от 3400₽, авто К+, рассрочка 3-4 года."
    )


@dp.message(F.text == "📍 Адреса автопарков")
async def menu_offices(message: Message) -> None:
    labels = [f"{metro}, {address}" for metro, address in OFFICES]
    await message.answer(
        "Выберите удобный автопарк:",
        reply_markup=offices_kb(labels),
    )


@dp.message(F.text == "🌐 Сайт")
async def menu_site(message: Message) -> None:
    await message.answer("Сайт компании: https://youpiter.taxi", reply_markup=site_kb())


@dp.message(F.text == "📞 Позвонить")
async def menu_phone(message: Message) -> None:
    await message.answer("Телефон: 561 38 84")


@dp.message(F.text == "⏰ Поторопить менеджера")
async def menu_hurry_manager(message: Message) -> None:
    bitrix_lead_id = get_user_last_lead(settings.leads_db_file, message.chat.id)
    if not bitrix_lead_id:
        await message.answer("Сначала заполните анкету, чтобы я мог связать запрос с вашим лидом.")
        return

    followup_no = bump_followup_count(settings.leads_db_file, message.chat.id)
    note = (
        f"[Бот ТГ] Повторное обращение кандидата #{followup_no}\n"
        f"Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Кандидат просит ускорить звонок менеджера."
    )
    ok, detail = await add_followup_note_to_lead(settings, bitrix_lead_id, note)
    if ok:
        await message.answer(
            f"Ваша заявка №{bitrix_lead_id} в работе. Я потороплю менеджера, с вами скоро свяжутся."
        )
        logger.info("Followup sent for bitrix lead %s (%s)", bitrix_lead_id, detail)
    else:
        await message.answer("Принято. Передал запрос, но CRM сейчас отвечает с задержкой. Мы всё равно ускорим звонок.")
        logger.warning("Followup failed for bitrix lead %s: %s", bitrix_lead_id, detail)


@dp.message(F.text == "📄 Текущая заявка")
async def menu_current_application(message: Message) -> None:
    bitrix_lead_id = get_user_last_lead(settings.leads_db_file, message.chat.id)
    if not bitrix_lead_id:
        await message.answer("У вас пока нет активной заявки. Нажмите «📝 Начать анкету».")
        return
    ok, detail, semantic, status_id = await get_lead_status(settings, bitrix_lead_id)
    if not ok:
        await message.answer(f"Заявка №{bitrix_lead_id} найдена, но CRM временно недоступна. Попробуйте чуть позже.")
        return

    if semantic.upper() == "F":
        status_text = f"закрыта (статус: {status_id})"
    else:
        status_text = f"в работе (статус: {status_id})"
    await message.answer(f"Текущая заявка №{bitrix_lead_id}: {status_text}.")


@dp.callback_query(F.data.startswith("office:"))
async def show_office(cb: CallbackQuery) -> None:
    await cb.answer()
    idx = int(cb.data.split(":", 1)[1])
    if 0 <= idx < len(OFFICES):
        metro, address = OFFICES[idx]
        await cb.message.answer(f"{metro}, {address}")


@dp.message(Command("restart"))
async def cmd_restart(message: Message, state: FSMContext) -> None:
    await cmd_start(message, state)


@dp.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Команды:\n"
        "/start - начать\n"
        "/restart - начать заново\n"
        "/help - помощь\n\n"
        "Или используйте кнопки внизу экрана."
    )


@dp.message(QuizState.answering)
async def answer_text_handler(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    idx = int(data.get("current_question_index", 0))
    question = scenario.questions[idx]

    if question.answer_type != "text":
        await message.answer("Для этого вопроса выберите вариант кнопкой.")
        return

    answers: dict[str, Any] = data.get("answers", {})
    raw_answer = (message.text or "").strip()
    if raw_answer in MENU_BUTTON_TEXTS:
        await message.answer("Сначала ответьте на текущий вопрос анкеты.")
        return
    if idx == 0 and raw_answer.isdigit():
        office_num = int(raw_answer)
        if 1 <= office_num <= len(OFFICES):
            metro, address = OFFICES[office_num - 1]
            raw_answer = f"{metro}, {address}"
    answers[question.key] = raw_answer
    await state.update_data(answers=answers)

    await _go_next(message, state)


@dp.callback_query(QuizState.answering, F.data.startswith("single:"))
async def answer_single_handler(cb: CallbackQuery, state: FSMContext) -> None:
    await cb.answer()
    data = await state.get_data()
    idx = int(data.get("current_question_index", 0))
    question = scenario.questions[idx]

    if question.answer_type != "single_choice":
        return

    selected_key = cb.data.split(":", 1)[1]
    options_map = {opt.key: opt.text for opt in question.options}
    if selected_key not in options_map:
        await cb.message.answer("Не удалось распознать вариант ответа.")
        return

    answers: dict[str, Any] = data.get("answers", {})
    answers[question.key] = {
        "key": selected_key,
        "text": options_map[selected_key],
    }
    await state.update_data(answers=answers)

    await cb.message.answer(f"Вы выбрали: {options_map[selected_key]}")
    await _go_next(cb.message, state)


@dp.callback_query(QuizState.answering, F.data.startswith("multi_toggle:"))
async def answer_multi_toggle_handler(cb: CallbackQuery, state: FSMContext) -> None:
    await cb.answer()
    data = await state.get_data()
    idx = int(data.get("current_question_index", 0))
    question = scenario.questions[idx]

    if question.answer_type != "multi_choice":
        return

    selected_key = cb.data.split(":", 1)[1]
    valid_keys = {opt.key for opt in question.options}
    if selected_key not in valid_keys:
        return

    bag_key = f"multi_{question.key}"
    selected = set(data.get(bag_key, []))

    if selected_key in selected:
        selected.remove(selected_key)
    else:
        selected.add(selected_key)

    await state.update_data(**{bag_key: list(selected)})

    options = _build_options(idx)
    await cb.message.edit_reply_markup(reply_markup=multi_choice_kb(options, selected))


@dp.callback_query(QuizState.answering, F.data == "multi_next")
async def answer_multi_next_handler(cb: CallbackQuery, state: FSMContext) -> None:
    await cb.answer()
    data = await state.get_data()
    idx = int(data.get("current_question_index", 0))
    question = scenario.questions[idx]

    if question.answer_type != "multi_choice":
        return

    bag_key = f"multi_{question.key}"
    selected = data.get(bag_key, [])
    if not selected:
        await cb.message.answer("Выберите хотя бы один вариант и нажмите «Далее».")
        return

    options_map = {opt.key: opt.text for opt in question.options}
    answers: dict[str, Any] = data.get("answers", {})
    answers[question.key] = [{"key": key, "text": options_map.get(key, key)} for key in selected]
    await state.update_data(answers=answers)

    await _go_next(cb.message, state)


@dp.message(QuizState.contact_name)
async def contact_name_handler(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if len(name) < 2:
        await message.answer("Введите имя (минимум 2 символа).")
        return

    await state.update_data(contact_name=name)
    await message.answer(scenario.contact_form.ask_phone_text)
    await state.set_state(QuizState.contact_phone)


@dp.message(QuizState.contact_phone)
async def contact_phone_handler(message: Message, state: FSMContext) -> None:
    phone = (message.text or "").strip()
    if not PHONE_RE.match(phone):
        await message.answer("Похоже, это не телефон. Пример: +7 999 123-45-67")
        return

    await state.update_data(contact_phone=phone)
    data = await state.get_data()
    answers = data.get("answers", {})
    contact_name = data.get("contact_name", "")
    contact_phone = data.get("contact_phone", "")
    start_param = data.get("start_param", "")
    email = ""

    # Anti-spam: if candidate already has an open lead, do not create one more.
    existing_lead_id = get_user_last_lead(settings.leads_db_file, message.chat.id)
    if existing_lead_id:
        st_ok, _, semantic, status_id = await get_lead_status(settings, existing_lead_id)
        if st_ok and semantic and semantic.upper() != "F":
            await message.answer(
                f"У вас уже есть заявка №{existing_lead_id} (статус: {status_id}). "
                "Если нужно ускорить обработку, нажмите «⏰ Поторопить менеджера».",
                reply_markup=quick_menu_kb(),
            )
            await state.clear()
            return

    lead_id = save_lead(
        settings.leads_db_file,
        bot_slug=bot_profile.slug,
        scenario_slug=scenario.slug,
        chat_id=message.chat.id,
        username=message.from_user.username or "",
        full_name=contact_name,
        phone=contact_phone,
        email=email,
        answers=answers,
    )

    comments_lines = ["[Бот ТГ] Анкета кандидата", *_humanize_answers(answers)]
    if start_param:
        comments_lines.append(f"utm/start_param: {start_param}")
    comments = "\n".join(comments_lines)

    park_info = _extract_park_from_answer(str(answers.get("city", "")))
    park_text = ""
    park_enum = ""
    park_title_part = ""
    if park_info:
        park_metro, park_address = park_info
        park_text = f"{park_metro}, {park_address}"
        metro_clean = park_metro.replace("Ⓜ️ ", "").strip()
        park_enum = PARK_ENUM_MAP.get(metro_clean, "")
        park_title_part = metro_clean

    lead_fields: dict[str, Any] = {
        "TITLE": f"Бот ТГ | Кандидат. {park_title_part}" if park_title_part else "Бот ТГ | Кандидат.",
        "NAME": contact_name,
        "PHONE": [{"VALUE": contact_phone, "VALUE_TYPE": "WORK"}],
        "COMMENTS": comments,
        "SOURCE_DESCRIPTION": "Бот ТГ @Youpiter_quiz_bot",
        "STATUS_ID": "14",
        "ASSIGNED_BY_ID": settings.bitrix_assigned_by_id,
        "UTM_SOURCE": "telegram",
        "UTM_MEDIUM": "bot",
        "UTM_CAMPAIGN": start_param or "driver_hiring_spb",
    }
    if park_text:
        lead_fields["UF_CRM_1745483677126"] = park_text
    if park_enum:
        lead_fields["UF_CRM_1741343224057"] = park_enum
    if email:
        lead_fields["EMAIL"] = [{"VALUE": email, "VALUE_TYPE": "WORK"}]

    ok, detail = await upsert_lead_to_bitrix(
        settings,
        lead_fields,
        contact_phone,
        email,
        force_new=True,
    )
    if ok:
        update_bitrix_status(settings.leads_db_file, lead_id, "sent", detail)
        bitrix_lead_id = extract_bitrix_lead_id(detail)
        if bitrix_lead_id:
            set_lead_bitrix_id(settings.leads_db_file, lead_id, bitrix_lead_id)
            set_user_last_lead(settings.leads_db_file, message.chat.id, bitrix_lead_id)
            upsert_bridge_state(settings.leads_db_file, bitrix_lead_id, message.chat.id, 0)
            uploaded_count = await _upload_pending_photos_for_lead(state, bitrix_lead_id)
            if uploaded_count:
                logger.info("Uploaded %s pending photos for lead %s", uploaded_count, bitrix_lead_id)
        logger.info("Lead %s sent to Bitrix (%s)", lead_id, detail)
    else:
        update_bitrix_status(settings.leads_db_file, lead_id, "error", detail)
        logger.warning("Lead %s failed to send to Bitrix: %s", lead_id, detail)

    _cancel_reminder(message.chat.id)
    bitrix_lead_id = extract_bitrix_lead_id(detail) if ok else None
    if bitrix_lead_id:
        await message.answer(
            f"Спасибо! Заявка отправлена. Номер {bitrix_lead_id} ✅ Мы свяжемся с вами до 15 минут.",
            reply_markup=quick_menu_kb(),
        )
    else:
        await message.answer("Спасибо! Заявка отправлена ✅ Мы свяжемся с вами до 15 минут.", reply_markup=quick_menu_kb())
    await state.clear()


async def run_bot() -> None:
    init_db(settings.leads_db_file)
    logger.info("Starting bot slug=%s scenario=%s", bot_profile.slug, scenario.slug)
    global bridge_task
    bridge_task = asyncio.create_task(_bridge_poll_loop())
    await dp.start_polling(bot)


@dp.message(F.photo)
async def photo_handler(message: Message, state: FSMContext) -> None:
    bitrix_lead_id = get_user_last_lead(settings.leads_db_file, message.chat.id)
    caption = message.caption or ""
    photo = message.photo[-1]

    if not bitrix_lead_id:
        data = await state.get_data()
        pending_photos = data.get("pending_photos", [])
        if not isinstance(pending_photos, list):
            pending_photos = []
        pending_photos.append({"file_id": photo.file_id, "caption": caption})
        await state.update_data(pending_photos=pending_photos)
        await message.answer("Фото сохранено. Я прикреплю его к заявке сразу после отправки анкеты.")
        return

    tg_file = await bot.get_file(photo.file_id)
    if tg_file.file_size and int(tg_file.file_size) > MAX_MEDIA_BYTES:
        await message.answer("Фото слишком большое. Отправьте файл до 10 МБ.")
        return
    buffer = BytesIO()
    await bot.download(tg_file, destination=buffer)
    content = buffer.getvalue()
    if not content:
        await message.answer("Не удалось получить фото. Попробуйте отправить ещё раз.")
        return

    filename = f"candidate_{message.chat.id}_{photo.file_unique_id}.jpg"
    ok, detail = await add_photo_to_lead(settings, bitrix_lead_id, filename, content, caption)
    if ok:
        try:
            timeline_id = int(detail.split(":")[-1])
            update_bridge_cursor(settings.leads_db_file, bitrix_lead_id, timeline_id)
        except Exception:
            pass
        await message.answer("Фото получено и прикреплено к вашей заявке.")
        logger.info("Photo attached for lead %s (%s)", bitrix_lead_id, detail)
    else:
        await message.answer("Фото получил, но не смог прикрепить в CRM. Попробуйте позже.")
        logger.warning("Photo attach failed for lead %s: %s", bitrix_lead_id, detail)


@dp.message(StateFilter(None))
async def relay_candidate_text_to_crm(message: Message) -> None:
    text = (message.text or "").strip()
    if not text:
        return
    if text in MENU_BUTTON_TEXTS:
        return
    bitrix_lead_id = get_user_last_lead(settings.leads_db_file, message.chat.id)
    if not bitrix_lead_id:
        if not has_user_consent(settings.leads_db_file, message.chat.id):
            await message.answer(CONSENT_TEXT, reply_markup=consent_kb())
            return
        await message.answer(
            "Чтобы продолжить, нажмите «📝 Начать анкету».",
            reply_markup=quick_menu_kb(),
        )
        return
    ok, detail, timeline_id = await add_text_comment_to_lead(
        settings,
        bitrix_lead_id,
        f"[Бот ТГ] Сообщение кандидата:\n{text}",
    )
    if ok:
        if timeline_id:
            update_bridge_cursor(settings.leads_db_file, bitrix_lead_id, timeline_id)
        await message.answer("Передал сообщение менеджеру.")
    else:
        logger.warning("Relay candidate text failed for lead %s: %s", bitrix_lead_id, detail)
        await message.answer("Не удалось передать сообщение менеджеру, попробуйте чуть позже.")
