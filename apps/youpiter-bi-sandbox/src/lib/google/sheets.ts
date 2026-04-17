import { JWT } from "google-auth-library";
import fs from "fs";
import path from "path";

// ── Auth ──────────────────────────────────────────────────────────────────────

function loadServiceAccountKey() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyPath) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH не задан в .env");
  const absPath = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
  const raw = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(raw) as { client_email: string; private_key: string };
}

async function getAccessToken(): Promise<string> {
  const key = loadServiceAccountKey();
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Не удалось получить Google access token");
  return token.token;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CellColor {
  red: number;
  green: number;
  blue: number;
}

export interface SheetCell {
  value: string;        // formattedValue
  color: CellColor | null;  // background color, null = white/default
}

export type SheetGrid = SheetCell[][];  // [row][col]

export interface SheetMeta {
  sheetId: number;
  title: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** List all sheet (tab) names in the spreadsheet */
export async function listSheets(spreadsheetId: string): Promise<SheetMeta[]> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API listSheets error ${res.status}: ${err}`);
  }
  const json = await res.json() as {
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  return json.sheets.map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title }));
}

/** Fetch a sheet's grid data including cell text values and background colors */
export async function fetchSheetGrid(
  spreadsheetId: string,
  sheetTitle: string
): Promise<SheetGrid> {
  const token = await getAccessToken();
  const range = encodeURIComponent(sheetTitle);
  const fields = encodeURIComponent(
    "sheets(data(rowData(values(formattedValue,userEnteredFormat/backgroundColor))))"
  );
  const url = `${SHEETS_BASE}/${spreadsheetId}?ranges=${range}&fields=${fields}&includeGridData=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API fetchSheetGrid error ${res.status}: ${err}`);
  }

  const json = await res.json() as {
    sheets?: {
      data?: {
        rowData?: {
          values?: {
            formattedValue?: string;
            userEnteredFormat?: {
              backgroundColor?: { red?: number; green?: number; blue?: number };
            };
          }[];
        }[];
      }[];
    }[];
  };

  const rowData = json.sheets?.[0]?.data?.[0]?.rowData ?? [];

  return rowData.map((row) =>
    (row.values ?? []).map((cell) => {
      const bg = cell.userEnteredFormat?.backgroundColor;
      const color = isColoredBackground(bg) ? {
        red: bg!.red ?? 1,
        green: bg!.green ?? 1,
        blue: bg!.blue ?? 1,
      } : null;
      return {
        value: cell.formattedValue ?? "",
        color,
      };
    })
  );
}

/** True if background is not white / not default */
function isColoredBackground(
  bg: { red?: number; green?: number; blue?: number } | null | undefined
): boolean {
  if (!bg) return false;
  const r = bg.red ?? 1;
  const g = bg.green ?? 1;
  const b = bg.blue ?? 1;
  // White = (1, 1, 1). Anything noticeably different = colored.
  return !(r > 0.9 && g > 0.9 && b > 0.9);
}
