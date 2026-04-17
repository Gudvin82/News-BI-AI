/**
 * Shared types for Google Sheets integration.
 * Used in: settings UI, gsheets connector, API routes, context providers.
 */

// ── Column mapping ────────────────────────────────────────────────────────────

/** Maps each semantic field to a 0-based column index in the sheet */
export interface ColumnMap {
  date:     number | null;
  category: number | null;
  amount:   number | null;
  park:     number | null;
  type:     number | null;
  comment:  number | null;
}

// ── Sheet mapping (full configuration for one document) ───────────────────────

export interface SheetMapping {
  sheetGid:       string;
  sheetName:      string;
  headerRow:      number;   // 0-based index of the header row in the raw CSV
  dataStartRow:   number;   // 0-based index of the first data row
  columnMap:      ColumnMap;
  skipEmptyRows:  boolean;
  skipSummaryRows: boolean;
  detectedAt:     string;   // ISO timestamp of auto-detection
  confirmedByUser: boolean;
}

// ── Document stored in localStorage / passed to API ──────────────────────────

export interface SheetDoc {
  id:       string;
  name:     string;
  url:      string;
  sections: string[];
  prompt?:  string;
  mapping?: SheetMapping;
}

// ── Preview API response shapes ───────────────────────────────────────────────

export interface SheetInfo {
  gid:  string;
  name: string;
}

export interface SheetPreviewData {
  gid:       string;
  rows:      string[][];   // raw rows (up to 25)
  totalRows: number;
  headers:   string[];     // row at headerRow index
}

export interface SheetsPreviewResponse {
  spreadsheetId:       string;
  urlGid:              string;
  sheets:              SheetInfo[];
  preview:             SheetPreviewData;
  detectedHeaderRow:   number;
  detectedMapping:     Partial<Record<keyof ColumnMap, number | null>>;
}
