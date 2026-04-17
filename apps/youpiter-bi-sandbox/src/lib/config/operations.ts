export const TAXICRM_BASE_URL = process.env.TAXICRM_BASE_URL ?? "https://api.taxicrm.ru";

export const SHIFT_STATUS_LABELS: Record<string, string> = {
  open:     "Активна",
  closed:   "Завершена",
  canceled: "Отменена",
};

export const DRIVER_STATUS_LABELS: Record<string, string> = {
  active:   "Активен",
  blocked:  "Заблокирован",
  archive:  "Архив",
};
