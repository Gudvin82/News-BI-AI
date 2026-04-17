"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/utils";
import { DTP_STAGES, parseDtpTitle } from "@/lib/config/dtp";
import {
  RefreshCw, AlertTriangle, ChevronLeft, ChevronRight,
  Search, Calendar, Car, Filter, ShieldAlert,
} from "lucide-react";
import Link from "next/link";

interface DtpItem {
  id: number; title: string; stageId: string; stageName: string;
  stageColor: string; stageGroup: string;
  createdTime: string; movedTime: string; opportunity: number;
}

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
  catch { return iso?.slice(0, 10) ?? ""; }
}

// ── Inner component uses useSearchParams ──────────────────────────────────────
function DtpListInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read URL params as primitives (safe as effect dependencies)
  const stageFromUrl = searchParams.get("stage") ?? "";
  const fromUrl      = searchParams.get("from")  ?? "";
  const toUrl        = searchParams.get("to")    ?? "";

  const [items, setItems]     = useState<DtpItem[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState(stageFromUrl);
  const [search, setSearch]   = useState("");

  const perPage = 50;

  // Sync stageFilter with URL when URL changes (e.g. navigating from overview)
  useEffect(() => {
    setStageFilter(stageFromUrl);
    setPage(0);
  }, [stageFromUrl]);

  const load = useCallback(async (p: number, stage: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (stage)  params.set("stage", stage);
      if (fromUrl) params.set("from", fromUrl);
      if (toUrl)   params.set("to",   toUrl);
      const res  = await apiFetch(`/api/dtp/items?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
      setItems(json.data.items);
      setTotal(json.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fromUrl, toUrl]);

  // Single effect — fires whenever page or stageFilter changes
  // stageFilter is set from URL on mount (and when URL changes), so Bug 2 is fixed
  useEffect(() => {
    load(page, stageFilter);
  }, [page, stageFilter, load]);

  function handleStageChange(val: string) {
    setStageFilter(val);
    setPage(0);
    // Update URL without navigation (keeps from/to if present)
    const params = new URLSearchParams();
    if (val)    params.set("stage", val);
    if (fromUrl) { params.set("from", fromUrl); params.set("to", toUrl); }
    router.replace(`/dtp/list${params.toString() ? "?" + params.toString() : ""}`, { scroll: false });
  }

  const totalPages = Math.ceil(total / perPage);
  const filtered = search.trim()
    ? items.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()))
    : items;

  const activeStage = stageFilter ? DTP_STAGES.find((s) => s.id === stageFilter) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/dtp${fromUrl ? `?from=${fromUrl}&to=${toUrl}` : ""}`}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--color-muted)" }}>
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(239,68,68,0.1)" }}>
              <ShieldAlert className="w-4 h-4" style={{ color: "#EF4444" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
                {activeStage ? activeStage.name : "Все дела ДТП"}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {fmt(total)} записей · стр. {page + 1} из {totalPages || 1}
                {fromUrl && ` · ${fromUrl} — ${toUrl}`}
              </p>
            </div>
          </div>
        </div>
        <button onClick={() => load(page, stageFilter)} disabled={loading}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Active stage badge */}
      {activeStage && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: activeStage.color + "15", border: `1px solid ${activeStage.color}40` }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: activeStage.color }} />
          <span className="font-medium text-sm" style={{ color: activeStage.color }}>
            Фильтр: {activeStage.name}
          </span>
          <button onClick={() => handleStageChange("")}
            className="ml-auto text-xs px-2 py-0.5 rounded-lg transition-colors"
            style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
            Сбросить
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: "var(--color-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full h-9 pl-9 pr-3 rounded-lg text-sm outline-none"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--color-muted)" }} />
          <select value={stageFilter} onChange={(e) => handleStageChange(e.target.value)}
            className="h-9 pl-9 pr-8 rounded-lg text-sm outline-none appearance-none cursor-pointer"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            <option value="">Все стадии</option>
            {DTP_STAGES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <Card>
        {/* Loading overlay */}
        <div className="relative">
          {loading && items.length > 0 && (
            <div className="absolute inset-0 rounded-xl flex items-center justify-center z-10"
              style={{ background: "var(--color-surface)", opacity: 0.7 }}>
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "var(--color-brand)" }} />
            </div>
          )}

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["#", "Дата", "Парк", "Автомобиль", "Водитель", "Стадия", "Ущерб"].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="py-3">
                          <div className="h-4 rounded skeleton" style={{ width: `${50 + (i * j % 3) * 20}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                      Нет дел
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const parts = parseDtpTitle(item.title);
                    return (
                      <tr key={item.id} className="transition-colors"
                        style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="py-2.5 text-xs font-mono tabular-nums" style={{ color: "var(--color-muted)" }}>
                          {item.id}
                        </td>
                        <td className="py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            {parts.date ?? fmtDate(item.createdTime)}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs">
                          {parts.park ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                              {parts.park}
                            </span>
                          ) : <span style={{ color: "var(--color-muted)" }}>—</span>}
                        </td>
                        <td className="py-2.5 text-xs">
                          <span className="flex items-center gap-1.5">
                            <Car className="w-3 h-3 flex-shrink-0 opacity-40" />
                            {parts.car && (
                              <span className="truncate max-w-[90px]" style={{ color: "var(--color-text)" }}>{parts.car}</span>
                            )}
                            {parts.plate && (
                              <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded"
                                style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                                {parts.plate}
                              </span>
                            )}
                            {!parts.car && !parts.plate && <span style={{ color: "var(--color-muted)" }}>—</span>}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs max-w-[130px] truncate" style={{ color: "var(--color-text)" }}>
                          {parts.driver ?? <span style={{ color: "var(--color-muted)" }}>—</span>}
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{ background: item.stageColor + "20", color: item.stageColor }}>
                            {item.stageName}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs font-mono tabular-nums"
                          style={{ color: item.opportunity > 0 ? "var(--color-text)" : "var(--color-muted)" }}>
                          {item.opportunity > 0 ? `₽ ${fmt(item.opportunity)}` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4"
            style={{ borderTop: "1px solid var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              {page * perPage + 1}–{Math.min((page + 1) * perPage, total)} из {fmt(total)}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const pageNum = Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: pageNum === page ? "var(--color-brand)" : "var(--color-surface-2)",
                      color: pageNum === page ? "#fff" : "var(--color-muted)",
                    }}>
                    {pageNum + 1}
                  </button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
                style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Page wrapper with Suspense (required for useSearchParams) ─────────────────
export default function DtpListPage() {
  return (
    <Suspense fallback={
      <div className="space-y-5 animate-pulse">
        <div className="h-8 w-48 rounded-lg skeleton" />
        <div className="h-9 w-full max-w-sm rounded-lg skeleton" />
        <div className="h-96 rounded-xl skeleton" />
      </div>
    }>
      <DtpListInner />
    </Suspense>
  );
}
