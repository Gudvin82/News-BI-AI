"use client";

/**
 * 4-step Google Sheets setup wizard.
 *
 * Step 0 — URL
 * Step 1 — Лист + Заголовок  (pub: badge "один лист"; обычные: вкладки + header row)
 * Step 2 — Маппинг столбцов + правила + инлайн-превью
 * Step 3 — Название, разделы, промт, тест, сохранение
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { X, ChevronRight, ChevronLeft, Check, Loader2, AlertCircle, Wifi, WifiOff, FileText } from "lucide-react";
import type { SheetInfo, SheetMapping, ColumnMap } from "@/lib/types/sheets";
import { apiFetch, encodeHeaderJson } from "@/lib/utils";

// ── Section list ──────────────────────────────────────────────────────────────
const ALL_SECTIONS = [
  { id: "finance",    label: "Финансы" },
  { id: "operations", label: "Операции" },
  { id: "hire",       label: "Найм" },
  { id: "dtp",        label: "ДТП" },
  { id: "cash",       label: "Касса" },
  { id: "workshop",   label: "СТО" },
  { id: "reports",    label: "Отчёты" },
  { id: "marketing",  label: "Маркетинг" },
];

const COL_FIELDS: { key: keyof ColumnMap; label: string; required: boolean }[] = [
  { key: "date",     label: "Дата",              required: true  },
  { key: "category", label: "Категория",         required: true  },
  { key: "amount",   label: "Сумма",             required: true  },
  { key: "park",     label: "Парк",              required: false },
  { key: "type",     label: "Тип (приход/расход)", required: false },
  { key: "comment",  label: "Комментарий",       required: false },
];

const STEP_LABELS = ["URL таблицы", "Лист и заголовок", "Маппинг столбцов", "Сохранение"];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WizardResult {
  name:      string;
  url:       string;
  sections:  string[];
  prompt:    string;
  mapping:   SheetMapping;
  totalRows: number;
}

interface Props {
  initialUrl?:      string;
  initialName?:     string;
  initialSections?: string[];
  initialPrompt?:   string;
  initialMapping?:  SheetMapping;
  onSave:  (result: WizardResult) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function callPreviewApi(params: Record<string, string>): Promise<unknown> {
  const qs  = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/sheets/preview?${qs}`, { cache: "no-store" });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Ошибка сервера");
  return json.data;
}

/** Pub/CSV/TSV links don't support tab discovery — single exported sheet */
function isPubLink(url: string): boolean {
  return /\/spreadsheets\/d\/e\//.test(url) ||
    url.includes("output=csv") ||
    url.includes("output=tsv") ||
    url.includes("export?format=csv");
}

function todayMsk() { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); }
function monthAgo()  {
  const d = new Date(Date.now() + 3 * 3600000);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 px-6 pt-4 pb-2 flex-shrink-0">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
          <div
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
            style={{
              background: i <= step ? "var(--color-brand)" : "var(--color-surface-2)",
              color:      i <= step ? "#fff" : "var(--color-muted)",
              opacity:    i > step ? 0.45 : 1,
            }}
          >
            {i < step ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          <span
            className="hidden sm:block text-[10px] font-medium truncate"
            style={{ color: i === step ? "var(--color-text)" : "var(--color-muted)", opacity: i > step ? 0.45 : 1 }}
          >
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <div className="flex-1 h-px ml-1" style={{ background: i < step ? "var(--color-brand)" : "var(--color-border)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg p-3 text-sm"
      style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{msg}</span>
    </div>
  );
}

function ColSelect({ value, headers, onChange }: {
  value: number | null; headers: string[]; onChange: (v: number | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
      className="w-full h-9 px-2 rounded-lg text-sm outline-none"
      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
    >
      <option value="">— не указан —</option>
      {headers.map((h, i) => (
        <option key={i} value={i}>{i + 1}: {h || "(пусто)"}</option>
      ))}
    </select>
  );
}

function ConfirmClose({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}>
      <div className="rounded-xl p-5 space-y-3 max-w-xs w-full mx-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Закрыть мастер?</p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Настройка не сохранена. Прогресс будет потерян.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          >
            Продолжить
          </button>
          <button
            onClick={onConfirm}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{ background: "#EF4444", color: "#fff" }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function SheetsWizard({
  initialUrl = "", initialName = "", initialSections = [], initialPrompt = "",
  initialMapping,
  onSave, onClose,
}: Props) {
  const [step, setStep] = useState(0);
  const [confirmingClose, setConfirmingClose] = useState(false);

  // Step 0
  const [url,        setUrl]        = useState(initialUrl);
  const [urlError,   setUrlError]   = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [pubMode,    setPubMode]    = useState(false); // true for pub/csv/tsv links

  // Step 1
  const [sheets,        setSheets]        = useState<SheetInfo[]>([]);
  const [selectedGid,   setSelectedGid]   = useState(initialMapping?.sheetGid ?? "");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [tabLoading,    setTabLoading]    = useState(false);
  const [tabError,      setTabError]      = useState("");

  // Header row (shared between step 1 and step 2)
  const [rawRows,   setRawRows]   = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [headerRow, setHeaderRow] = useState(initialMapping?.headerRow ?? 0);

  // Step 2
  const [colMap, setColMap] = useState<ColumnMap>(
    initialMapping?.columnMap ?? { date: null, category: null, amount: null, park: null, type: null, comment: null }
  );
  const [skipEmpty,   setSkipEmpty]   = useState(initialMapping?.skipEmptyRows   ?? true);
  const [skipSummary, setSkipSummary] = useState(initialMapping?.skipSummaryRows ?? true);

  // Step 3
  const [name,     setName]     = useState(initialName);
  const [sections, setSections] = useState<string[]>(initialSections);
  const [prompt,   setPrompt]   = useState(initialPrompt);
  const [testState,   setTestState]   = useState<"idle"|"checking"|"ok"|"error">("idle");
  const [testMessage, setTestMessage] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const headers        = rawRows[headerRow] ?? [];
  const requiredMapped = COL_FIELDS.filter((f) => f.required).every((f) => colMap[f.key] !== null);
  const selectedSheet  = sheets.find((s) => s.gid === selectedGid);

  // ── Step 0 → 1 ─────────────────────────────────────────────────────────────
  async function loadSheets() {
    setUrlError("");
    if (!url.trim()) { setUrlError("Вставьте ссылку на Google Sheets"); return; }
    setUrlLoading(true);
    const isPub = isPubLink(url.trim());
    setPubMode(isPub);
    try {
      const data = await callPreviewApi({ url: url.trim(), action: "sheets" }) as {
        spreadsheetId: string; sheets: SheetInfo[]; urlGid: string;
        detectedHeaderRow: number;
        detectedMapping: Partial<Record<keyof ColumnMap, number | null>>;
        preview: { rows: string[][]; totalRows: number };
      };
      setSpreadsheetId(data.spreadsheetId);
      setSheets(data.sheets);
      setSelectedGid(data.urlGid);
      setRawRows(data.preview.rows);
      setTotalRows(data.preview.totalRows);

      // Restore saved mapping if editing same sheet
      if (initialMapping && data.urlGid === initialMapping.sheetGid) {
        setHeaderRow(initialMapping.headerRow);
        setColMap(initialMapping.columnMap);
        setSkipEmpty(initialMapping.skipEmptyRows);
        setSkipSummary(initialMapping.skipSummaryRows);
      } else {
        setHeaderRow(data.detectedHeaderRow);
        setColMap({
          date:     data.detectedMapping.date     ?? null,
          category: data.detectedMapping.category ?? null,
          amount:   data.detectedMapping.amount   ?? null,
          park:     data.detectedMapping.park     ?? null,
          type:     data.detectedMapping.type     ?? null,
          comment:  data.detectedMapping.comment  ?? null,
        });
      }
      setStep(1);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : String(e));
    } finally {
      setUrlLoading(false);
    }
  }

  // ── Switch sheet tab ────────────────────────────────────────────────────────
  const loadRowsForGid = useCallback(async (gid: string) => {
    setTabError("");
    setTabLoading(true);
    try {
      const data = await callPreviewApi({ url, action: "preview", gid }) as {
        preview: { rows: string[][]; totalRows: number };
        detectedHeaderRow: number;
        detectedMapping: Partial<Record<keyof ColumnMap, number | null>>;
      };
      setRawRows(data.preview.rows);
      setTotalRows(data.preview.totalRows);
      if (initialMapping && gid === initialMapping.sheetGid) {
        setHeaderRow(initialMapping.headerRow);
        setColMap(initialMapping.columnMap);
        setSkipEmpty(initialMapping.skipEmptyRows);
        setSkipSummary(initialMapping.skipSummaryRows);
      } else {
        setHeaderRow(data.detectedHeaderRow);
        setColMap({
          date:     data.detectedMapping.date     ?? null,
          category: data.detectedMapping.category ?? null,
          amount:   data.detectedMapping.amount   ?? null,
          park:     data.detectedMapping.park     ?? null,
          type:     data.detectedMapping.type     ?? null,
          comment:  data.detectedMapping.comment  ?? null,
        });
      }
    } catch (e) {
      setTabError(e instanceof Error ? e.message : String(e));
    } finally {
      setTabLoading(false);
    }
  }, [url, initialMapping]);

  function handleGidChange(gid: string) {
    setSelectedGid(gid);
    loadRowsForGid(gid);
  }

  // ── Step 3: test connection ─────────────────────────────────────────────────
  async function testConnection() {
    setTestState("checking");
    setTestMessage("");
    const mapping = buildMapping();
    const docs = [{ url, name: name || "Google Sheets", mapping }];
    const endpoint = sections.includes("workshop")
      ? "/api/workshop/sheets"
      : sections.includes("cash")
      ? "/api/cash/daily"
      : "/api/finance/sheets";
    try {
      const res  = await apiFetch(`${endpoint}?from=${monthAgo()}&to=${todayMsk()}`, {
        headers: { "x-gsheets-docs": encodeHeaderJson(docs) },
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) { setTestState("error"); setTestMessage(json.error ?? "Ошибка сервера"); return; }
      const cnt = json.data?.entries?.length ?? 0;
      setTestState("ok");
      setTestMessage(`Загружено ${cnt} записей за 30 дней`);
    } catch (e) {
      setTestState("error");
      setTestMessage(e instanceof Error ? e.message : "Ошибка соединения");
    }
  }

  // ── Build mapping ───────────────────────────────────────────────────────────
  function buildMapping(): SheetMapping {
    return {
      sheetGid:        selectedGid,
      sheetName:       selectedSheet?.name ?? "Лист 1",
      headerRow,
      dataStartRow:    headerRow + 1,
      columnMap:       colMap,
      skipEmptyRows:   skipEmpty,
      skipSummaryRows: skipSummary,
      detectedAt:      new Date().toISOString(),
      confirmedByUser: true,
    };
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function goNext() {
    if (step === 0) { loadSheets(); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 2) { setStep(3); setTimeout(() => nameInputRef.current?.focus(), 100); return; }
    if (step === 3) { handleSave(); return; }
  }

  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleClose() {
    if (step === 0) { onClose(); return; }
    setConfirmingClose(true);
  }

  function handleSave() {
    onSave({ name: name.trim() || "Google Sheets", url, sections, prompt, mapping: buildMapping(), totalRows });
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", maxHeight: "90vh" }}
      >
        {confirmingClose && (
          <ConfirmClose onConfirm={onClose} onCancel={() => setConfirmingClose(false)} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
              Подключение Google Sheets
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              Шаг {step + 1} из {STEP_LABELS.length} — {STEP_LABELS[step]}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--color-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <StepBar step={step} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">

          {/* ── Step 0: URL ─────────────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Вставьте ссылку на Google Sheets. Таблица должна быть открыта для просмотра всем.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
                  Ссылка на таблицу
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goNext()}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  autoFocus
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
              </div>
              {urlError && <ErrorBox msg={urlError} />}
              <div className="rounded-xl p-4 text-xs space-y-2"
                style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
                <p className="font-medium" style={{ color: "var(--color-text)" }}>Поддерживаемые форматы</p>
                <p>Обычная ссылка: <span style={{ color: "var(--color-text)" }}>…/spreadsheets/d/ID/edit</span> — все вкладки доступны</p>
                <p>Pub/CSV ссылка: <span style={{ color: "var(--color-text)" }}>…/pub?output=csv</span> — один экспортированный лист</p>
                <p className="pt-1">Чтобы открыть доступ к обычной ссылке: <strong>Файл → Поделиться → Все, у кого есть ссылка → Читатель</strong></p>
              </div>
            </div>
          )}

          {/* ── Step 1: Лист + Заголовок ────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Tab selector or pub badge */}
              {pubMode ? (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-brand)" }} />
                  <div>
                    <span className="font-medium" style={{ color: "var(--color-text)" }}>Один экспортированный лист</span>
                    <span className="ml-2 text-xs" style={{ color: "var(--color-muted)" }}>
                      Pub/CSV ссылка — выбор вкладок недоступен
                    </span>
                  </div>
                </div>
              ) : sheets.length > 1 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                    Выберите вкладку с данными
                  </p>
                  {tabError && <ErrorBox msg={tabError} />}
                  <div className="space-y-1.5">
                    {sheets.map((s) => (
                      <button
                        key={s.gid}
                        onClick={() => handleGidChange(s.gid)}
                        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{
                          background: selectedGid === s.gid ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                          border: selectedGid === s.gid ? "1.5px solid var(--color-brand)" : "1.5px solid transparent",
                          color: selectedGid === s.gid ? "var(--color-brand)" : "var(--color-text)",
                        }}
                      >
                        <span>{s.name}</span>
                        {tabLoading && selectedGid === s.gid
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : selectedGid === s.gid ? <Check className="w-3.5 h-3.5" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-brand)" }} />
                  <span style={{ color: "var(--color-text)" }}>
                    {sheets[0]?.name ?? "Лист 1"}
                    <span className="ml-2 text-xs" style={{ color: "var(--color-muted)" }}>единственная вкладка</span>
                  </span>
                </div>
              )}

              {/* Header row selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                    Строка заголовка
                  </p>
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    Выбрана строка{" "}
                    <strong style={{ color: "var(--color-text)" }}>{headerRow + 1}</strong>
                    {" · "}данные с{" "}
                    <strong style={{ color: "var(--color-text)" }}>{headerRow + 2}</strong>
                    {" · "}всего строк{" "}
                    <strong style={{ color: "var(--color-text)" }}>{totalRows}</strong>
                  </span>
                </div>
                {rawRows.length === 0 ? (
                  <div className="text-sm text-center py-8 rounded-xl" style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                    Нет данных для предпросмотра
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        {rawRows.slice(0, 12).map((row, ri) => {
                          const isHeader = ri === headerRow;
                          return (
                            <tr
                              key={ri}
                              onClick={() => setHeaderRow(ri)}
                              className="cursor-pointer transition-colors hover:opacity-80"
                              style={{
                                background: isHeader
                                  ? "var(--color-brand-soft)"
                                  : ri % 2 === 0 ? "var(--color-surface-2)" : "var(--color-surface)",
                                borderBottom: "1px solid var(--color-border)",
                              }}
                            >
                              <td className="px-2 py-1.5 font-mono font-bold w-8 select-none"
                                style={{ color: isHeader ? "var(--color-brand)" : "var(--color-muted)", borderRight: "1px solid var(--color-border)" }}>
                                {ri + 1}
                              </td>
                              {row.slice(0, 8).map((cell, ci) => (
                                <td key={ci} className="px-2 py-1.5 truncate max-w-24"
                                  style={{
                                    color: isHeader ? "var(--color-brand)" : "var(--color-text)",
                                    fontWeight: isHeader ? 600 : 400,
                                  }}>
                                  {cell || <span style={{ opacity: 0.25 }}>—</span>}
                                </td>
                              ))}
                              <td className="px-2 py-1.5 w-20 text-right select-none">
                                {isHeader && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                    style={{ background: "var(--color-brand)", color: "#fff" }}>
                                    заголовок
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Кликните на строку, чтобы задать заголовок. Данные начнутся со следующей строки.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Маппинг + правила + превью ──────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Column mapping */}
              <div className="space-y-3">
                <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  Маппинг столбцов
                  <span className="ml-1.5 font-normal">— автоопределены, проверьте и скорректируйте</span>
                </p>
                {COL_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-2 items-center gap-3">
                    <div>
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{f.label}</span>
                      {f.required && <span className="ml-1 text-xs" style={{ color: "#EF4444" }}>*</span>}
                    </div>
                    <ColSelect value={colMap[f.key]} headers={headers}
                      onChange={(v) => setColMap((prev) => ({ ...prev, [f.key]: v }))} />
                  </div>
                ))}
                {!requiredMapped && <ErrorBox msg="Заполните обязательные поля (*) перед продолжением." />}
              </div>

              {/* Inline mini preview */}
              {headers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Предпросмотр данных</p>
                  <div className="rounded-lg overflow-x-auto" style={{ border: "1px solid var(--color-border)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "var(--color-surface-2)" }}>
                          {headers.slice(0, 10).map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left font-medium truncate max-w-20"
                              style={{ color: "var(--color-text)", borderBottom: "1px solid var(--color-border)" }}>
                              {i + 1}: {h || "(пусто)"}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rawRows.slice(headerRow + 1, headerRow + 4).map((row, ri) => (
                          <tr key={ri} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            {row.slice(0, 10).map((cell, ci) => (
                              <td key={ci} className="px-2 py-1 truncate max-w-20" style={{ color: "var(--color-muted)" }}>{cell || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Skip rules */}
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Правила обработки строк</p>
                {[
                  { val: skipEmpty,   set: setSkipEmpty,   label: "Пропускать пустые строки",   desc: "Строки без даты и суммы не попадут в данные" },
                  { val: skipSummary, set: setSkipSummary, label: "Пропускать итоговые строки",  desc: "Строки, где все ячейки — числа (строки-суммы)" },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => item.set((v) => !v)}
                    className="w-full flex items-start gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
                    style={{
                      background: item.val ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                      border: item.val ? "1.5px solid var(--color-brand)" : "1.5px solid transparent",
                    }}
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center mt-0.5"
                      style={{ background: item.val ? "var(--color-brand)" : "var(--color-surface)", border: "1.5px solid", borderColor: item.val ? "var(--color-brand)" : "var(--color-border)" }}>
                      {item.val && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{item.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Сохранение ───────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
                  Название источника
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Финансовый план 2026"
                  className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
              </div>

              {/* Sections */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: "var(--color-muted)" }}>Применять в разделах</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SECTIONS.map((s) => {
                    const on = sections.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSections((prev) => on ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: on ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                          color: on ? "var(--color-brand)" : "var(--color-muted)",
                          border: on ? "1.5px solid var(--color-brand)" : "1.5px solid transparent",
                        }}
                      >
                        {on && <Check className="w-3 h-3" />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI Prompt */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--color-muted)" }}>
                  Контекст для ИИ <span className="font-normal">(что содержит эта таблица)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder={"Финансовые данные по паркам: дата, категория, сумма, парк.\nАнализировать: план/факт, тренды, отклонения."}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)", lineHeight: "1.5" }}
                />
              </div>

              {/* Mapping summary */}
              <div className="rounded-xl p-3 space-y-1 text-xs"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <p className="font-semibold" style={{ color: "var(--color-text)" }}>Итог настройки</p>
                <p style={{ color: "var(--color-muted)" }}>
                  Лист: <strong style={{ color: "var(--color-text)" }}>{selectedSheet?.name ?? selectedGid}</strong>
                  {pubMode && <span className="ml-1 opacity-60">(pub)</span>}
                  {" · "}Строк: <strong style={{ color: "var(--color-text)" }}>{totalRows}</strong>
                </p>
                <p style={{ color: "var(--color-muted)" }}>
                  Заголовок: строка <strong style={{ color: "var(--color-text)" }}>{headerRow + 1}</strong>
                  {" · "}данные с: <strong style={{ color: "var(--color-text)" }}>{headerRow + 2}</strong>
                </p>
                <p style={{ color: "var(--color-muted)" }}>
                  {COL_FIELDS.filter((f) => colMap[f.key] !== null).map((f) => {
                    const idx = colMap[f.key]!;
                    return `${f.label} → "${headers[idx] || idx}"`;
                  }).join(" · ")}
                </p>
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={testConnection}
                  disabled={testState === "checking" || sections.length === 0}
                  className="h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
                >
                  {testState === "checking"
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Проверяем…</>
                    : "Проверить подключение"}
                </button>
                {testState === "ok" && (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#10B981" }}>
                    <Wifi className="w-3.5 h-3.5" /> {testMessage}
                  </span>
                )}
                {testState === "error" && (
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "#EF4444" }}>
                    <WifiOff className="w-3.5 h-3.5" /> {testMessage}
                  </span>
                )}
                {sections.length === 0 && testState === "idle" && (
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Выберите разделы для проверки</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderTop: "1px solid var(--color-border)" }}>
          <button
            onClick={step === 0 ? handleClose : goBack}
            className="h-9 px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          >
            {step === 0 ? "Отмена" : <><ChevronLeft className="w-4 h-4" /> Назад</>}
          </button>

          <button
            onClick={goNext}
            disabled={
              (step === 0 && urlLoading) ||
              (step === 1 && tabLoading) ||
              (step === 2 && !requiredMapped)
            }
            className="h-9 px-5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            {(urlLoading || (step === 1 && tabLoading)) ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Загрузка…</>
            ) : step === 3 ? (
              <><Check className="w-4 h-4" /> Сохранить</>
            ) : (
              <>Далее <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
