/**
 * ДТП module configuration
 * Bitrix24 Smart Processes:
 *   1038 — ДТП - заявки   (initial intake)
 *   1050 — ДТП для юристов (main process, 230+ records)
 */

export const DTP_ENTITY_TYPE  = 1050; // main
export const DTP_ENTITY_INTAKE = 1038; // intake

/** Stage definitions for entityTypeId=1050, categoryId=20 */
export interface DtpStage {
  id: string;       // stageId value from API
  name: string;
  color: string;
  group: "open" | "win" | "fail";
  sort: number;
}

export const DTP_STAGES: DtpStage[] = [
  { id: "DT1050_20:UC_IM4KKN", name: "Случилось происшествие",     color: "#6366F1", group: "open", sort: 10 },
  { id: "DT1050_20:NEW",       name: "Разбор ГИБДД",               color: "#8B5CF6", group: "open", sort: 20 },
  { id: "DT1050_20:PREPARATION",name: "Не виновен",                 color: "#06B6D4", group: "open", sort: 30 },
  { id: "DT1050_20:CLIENT",    name: "Незначительные повреждения",  color: "#0EA5E9", group: "open", sort: 40 },
  { id: "DT1050_20:UC_G28IPD", name: "Запись в осмотр СК",         color: "#F59E0B", group: "open", sort: 50 },
  { id: "DT1050_20:UC_872IOR", name: "Подача в СК",                color: "#F97316", group: "open", sort: 60 },
  { id: "DT1050_20:UC_WUGKXZ", name: "Ждём страх. возмещения",     color: "#EF4444", group: "open", sort: 70 },
  { id: "DT1050_20:UC_3373WQ", name: "Виноват — соглашение",       color: "#EC4899", group: "open", sort: 80 },
  { id: "DT1050_20:UC_933TIW", name: "Виноват — отказ соглашения", color: "#F43F5E", group: "open", sort: 90 },
  { id: "DT1050_20:UC_ND8CR0", name: "Виноват — ремонт сам",       color: "#FB7185", group: "open", sort: 100 },
  { id: "DT1050_20:UC_0XNHIJ", name: "Сверка Фин.Отдел",          color: "#64748B", group: "open", sort: 110 },
  { id: "DT1050_20:UC_7GEBUG", name: "Юристам",                    color: "#475569", group: "open", sort: 120 },
  { id: "DT1050_20:UC_OUXL84", name: "Готово / Завершить",         color: "#10B981", group: "open", sort: 130 },
  { id: "DT1050_20:SUCCESS",   name: "Успех",                      color: "#22C55E", group: "win",  sort: 140 },
  { id: "DT1050_20:FAIL",      name: "Провал",                     color: "#94A3B8", group: "fail", sort: 150 },
];

export const DTP_STAGE_MAP = Object.fromEntries(DTP_STAGES.map((s) => [s.id, s]));

/** Groups for summary display */
export const DTP_GROUPS = [
  { key: "register", label: "Регистрация",   stageSort: [10, 20] },
  { key: "assess",   label: "Оценка",        stageSort: [30, 40, 50, 60] },
  { key: "resolve",  label: "Урегулирование",stageSort: [70, 80, 90, 100] },
  { key: "close",    label: "Завершение",    stageSort: [110, 120, 130, 140, 150] },
];

/** Parse DTP title: "01.12.2025 (49 неделя) АТП Ладога Джили Атлас Н130МХ198 Сорокин Алексей..." */
export interface DtpTitleParts {
  date: string | null;
  park: string | null;
  car: string | null;
  plate: string | null;
  driver: string | null;
}

const PARK_ALIASES: Record<string, string> = {
  "ладог":    "Ладожская",
  "стар":     "Старая Деревня",
  "парнас":   "Парнас",
  "девяткин": "Девяткино",
  "автово":   "Автово",
  "лесн":     "Лесная",
  "дунайск":  "Дунайская",
  "купчин":   "Купчино",
};

export function parseDtpTitle(title: string): DtpTitleParts {
  const dateMatch = title.match(/^(\d{2}\.\d{2}\.\d{4})/);
  const plateMatch = title.match(/([АВЕКМНОРСТУХABEKMHOPCTYXАВЕКМНОРСТУХ]{1}[0-9]{3}[АВЕКМНОРСТУХABEKMHOPCTYXАВЕКМНОРСТУХ]{2}[0-9]{2,3})/i);
  const phoneMatch = title.match(/\+?[\d\s\(\)\-]{11,}/);

  // park detection
  const lower = title.toLowerCase();
  let park: string | null = null;
  for (const [key, val] of Object.entries(PARK_ALIASES)) {
    if (lower.includes(key)) { park = val; break; }
  }

  // driver: text after plate and before phone
  let driver: string | null = null;
  if (plateMatch && phoneMatch) {
    const afterPlate = title.slice(title.indexOf(plateMatch[0]) + plateMatch[0].length).trim();
    const beforePhone = afterPlate.slice(0, afterPlate.indexOf(phoneMatch[0].trim())).trim();
    if (beforePhone.length > 3 && beforePhone.length < 60) driver = beforePhone;
  }

  // car model: between park/week info and plate
  let car: string | null = null;
  if (plateMatch) {
    const beforePlate = title.slice(0, title.indexOf(plateMatch[0]));
    const carPart = beforePlate.replace(/^\d{2}\.\d{2}\.\d{4}/, "").replace(/\(\d+ неделя\)/gi, "").replace(/АТП\s+\S+/gi, "").trim();
    if (carPart.length > 2) car = carPart;
  }

  return {
    date:   dateMatch ? dateMatch[1] : null,
    park,
    car,
    plate:  plateMatch ? plateMatch[0] : null,
    driver,
  };
}
