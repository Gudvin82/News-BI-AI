export const SHEET_COLUMNS = {
  date:     ["date", "дата"],
  category: ["category", "категория"],
  amount:   ["amount", "сумма"],
  park:     ["park", "парк"],
  type:     ["type", "тип"],
  comment:  ["comment", "комментарий", "примечание"],
} as const;

export const INCOME_LABELS  = new Set(["income", "приход", "доход", "in"]);
export const EXPENSE_LABELS = new Set(["expense", "расход", "out"]);

export type EntryType = "income" | "expense" | "unknown";
