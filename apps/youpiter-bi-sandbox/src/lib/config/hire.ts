/**
 * Hire module configuration — domain constants for YouPiter Taxi.
 * White-label: override via tenant_settings in DB or env vars.
 */

/** Managers who author leads (авторы лидов — считаются в метриках) */
export const AVTOPARK_IDS = new Set([
  "20", "28", "26", "1148", "7766", "10232", "12564", "13212", "14138", "15830",
]);

/** All known team members: id → display name */
export const TEAM_NAMES: Record<string, string> = {
  "14":    "Головатенко Оксана",
  "20":    "Скрипникова Мария",
  "28":    "Давыдова Елена",
  "26":    "Борщ Светлана",
  "1148":  "Незнаева Екатерина",
  "7766":  "Толстикова Алина",
  "10232": "Анашкина Ксения",
  "12564": "Воробей Дарья",
  "13212": "Рыжова Дарья",
  "14138": "Соловьева Полина",
  "74":    "Лёвкин Алексей",
  "15830": "Чоловская Анастасия",
};

/** Lead statuses
 * RELEVANT = все кому позвонили и они были "в процессе" (мы подходим + НЕ подходим).
 * CONVERTED исключён — он считается отдельно через firstShift (DATE_MODIFY).
 * Классификация выровнена с bitrix-jupiter:
 *   Мы подходим:   PROCESSED, UC_EYZ7FL, UC_3AIP7Y, UC_WS497Q
 *   НЕ подходим:   UC_WC0XML, UC_HUN2C0, UC_D2I498, 7, 1, 3, 4, 9, UC_YOVQCF, JUNK
 *   Нерелевантные: 12, 10, UC_0WF98D, 6, 5, 2
 */
export const STATUS = {
  REL_YES:    new Set(["PROCESSED","UC_EYZ7FL","UC_3AIP7Y","UC_WS497Q"]),
  REL_NO:     new Set(["UC_WC0XML","UC_HUN2C0","UC_D2I498","7","1","3","4","9","UC_YOVQCF","JUNK"]),
  RELEVANT:   new Set(["PROCESSED","UC_EYZ7FL","UC_3AIP7Y","UC_WS497Q","UC_WC0XML","UC_HUN2C0","UC_D2I498","7","1","3","4","9","UC_YOVQCF","JUNK"]),
  IRRELEVANT: new Set(["12","10","UC_0WF98D","6","5","2"]),
  SOBES:      "UC_WS497Q",
  DUMAET:     "UC_3AIP7Y",
  NO_ANS:     new Set(["UC_WC0XML","UC_HUN2C0","UC_D2I498"]),
  CONVERTED:  "CONVERTED",
} as const;

/** Доставка: single status UC_ARJPWQ */
export const STATUS_DOSTAVKA = new Set(["UC_ARJPWQ"]);

/** Раскат: manager IDs and statuses */
export const RASKAT_IDS = new Set(["14", "74"]);

export const STATUS_RASKAT = new Set([
  "UC_9XXLR3", "UC_D044BD", "UC_WSYABG", "UC_L51SYC",
  "UC_U8ZJ1Q", "UC_SI4PWJ", "UC_XMRHAC", "UC_1P6NJ7", "15",
]);

export const RASKAT_RELEVANT   = new Set(["UC_L51SYC", "UC_WSYABG", "UC_U8ZJ1Q", "CONVERTED"]);
export const RASKAT_IRRELEVANT = new Set(["UC_SI4PWJ", "UC_XMRHAC", "UC_1P6NJ7", "15"]);

export const RASKAT_STATUS_NAMES: Record<string, string> = {
  "UC_9XXLR3": "Новый лид",
  "UC_D044BD": "Прозвон / новый лид",
  "UC_WSYABG": "Думают",
  "UC_L51SYC": "В работе (целевой)",
  "UC_U8ZJ1Q": "Запись на встречу",
  "UC_SI4PWJ": "Нецелевой (брак)",
  "UC_XMRHAC": "Не подходят условия",
  "UC_1P6NJ7": "Не подходят условия",
  "15":        "СПАМ",
  "CONVERTED": "Качественный лид",
};

/** Human-readable reject reasons */
export const REJECT_NAMES: Record<string, string> = {
  "1": "Тех. часть ТС",
  "2": "Сотрудники парка",
  "3": "Перестал выходить",
  "4": "Не устроил договор",
  "5": "Чёрный список",
  "6": "Судимость",
  "UC_0WF98D": "Иностранец",
  "9": "Другое",
  "10": "Дубли (Avito)",
  "12": "Спам",
  "UC_YOVQCF": "Не актуально",
};

/** Deal category → park name */
export const DEAL_CAT_TO_PARK: Record<string, string> = {
  "2": "Ладожская", "4": "Старая Деревня", "6": "Парнас",
  "8": "Девяткино", "10": "Автово", "12": "Лесная",
};

export const STATUS_LABELS: Record<string, string> = {
  "UC_WS497Q": "Собеседование",
  "UC_3AIP7Y": "Думает",
  "UC_WC0XML": "Не отвечает",
  "UC_HUN2C0": "Не отвечает",
  "UC_D2I498": "Не отвечает",
  "CONVERTED": "Первая смена",
  "PROCESSED": "В работе",
  "UC_EYZ7FL": "Новый",
  "7":         "Новый",
};

/** All parks */
export const KNOWN_PARKS = [
  "Ладожская", "Старая Деревня", "Парнас",
  "Девяткино", "Автово", "Лесная",
  "Дунайская", "Купчино", "Проспект Славы",
];

export const PARK_ICONS: Record<string, string> = {
  "Ладожская": "🔵", "Старая Деревня": "🟣", "Парнас": "🟢",
  "Девяткино": "🟡", "Автово": "🔴", "Лесная": "🟠",
};

/** Parse Bitrix24 SOURCE_ID + UTM_SOURCE into human-readable source name */
export function parseSource(sourceId: string | undefined, utmSource?: string): string {
  const src = sourceId ?? "";
  const utm = (utmSource ?? "").toLowerCase();

  if (!src) return "Не указан";
  if (src === "CALL")                              return "Входящий звонок";
  if (src === "UC_NO4CVM" || src === "HH2CRM_HH") return "HH.ru";
  if (src === "UC_HRXCYL")                         return "Яндекс Гараж";
  if (src === "31")                                return "Обзвон по базе";
  if (src === "29")                                return "Авито Раскат";
  if (src === "24" || src === "24|AVITO")          return "Авито Доставка";
  if (src.includes("AVITOJOB"))                    return "AvitoJob";
  if (src.includes("AVITO") || src === "HH2CRM_AVITO") return "Авито";
  if (src === "WEB") {
    if (utm.includes("yandex")) return "Яндекс Директ";
    if (utm.includes("google")) return "Google Реклама";
    if (utm.includes("vk"))     return "ВКонтакте";
    if (utm.includes("avito"))  return "Авито Реклама";
    if (utm.includes("2gis"))   return "2GIS";
    return "Сайт (прямой)";
  }
  if (src === "EMAIL")            return "Email";
  if (src === "WEBFORM")          return "CRM-форма";
  if (src === "CALLBACK")         return "Обратный звонок";
  if (src === "RECOMMENDATION")   return "По рекомендации";
  if (src.startsWith("WZ"))       return "WhatsApp";
  if (src === "UC_38J6Z3")        return "Соц. сети";
  if (src === "UC_3PKZSM")        return "Шёл мимо";
  if (src === "UC_DEU9E7")        return "От друга";
  if (src === "UC_8U93UN")        return "Перехват лидов";
  if (src === "UC_ABJP4X")        return "Архив";
  if (src === "OTHER")            return "Другое";
  if (src === "PARTNER")          return "Существующий клиент";
  if (src === "RC_GENERATOR")     return "Генератор продаж";
  if (src === "REPEAT_SALE")      return "Повторные продажи";
  if (src === "1")                return "TaxiCRM";
  return "Другое";
}

/** Detect park from lead COMMENTS or TITLE (fallback after deal lookup) */
export function detectParkFromText(comments?: string, title?: string): string | null {
  const text = ((comments ?? "") + " " + (title ?? "")).toLowerCase();
  if (text.includes("автово"))                         return "Автово";
  if (text.includes("стар") && text.includes("дерев")) return "Старая Деревня";
  if (text.includes("дунайск"))                        return "Дунайская";
  if (text.includes("лесн"))                           return "Лесная";
  if (text.includes("девяткин"))                       return "Девяткино";
  if (text.includes("ладожск"))                        return "Ладожская";
  if (text.includes("парнас"))                         return "Парнас";
  if (text.includes("купчин"))                         return "Купчино";
  if (text.includes("проспект слав"))                  return "Проспект Славы";
  return null;
}
