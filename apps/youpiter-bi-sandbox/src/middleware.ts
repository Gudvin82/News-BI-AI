import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/pin", "/api-docs"];
const PUBLIC_API_PATHS = [
  "/api/auth/pin",
  "/api/auth/logout",
  "/api/health",
  "/api/v1/ingest",  // partner ingest — auth via API key, not session
  "/api/v1/keys",    // managed separately via session inside route
];
const SESSION_COOKIE_NAME = "yb_session";
const MAX_SESSION_AGE_MS = 60 * 60 * 24 * 14 * 1000;

// Settings routes — owner-only
const OWNER_ONLY_PATHS = ["/settings/users", "/settings/integrations", "/settings/ai", "/settings"];

// Map URL path segments to section IDs used in allowedSections
function pathToSection(pathname: string): string | null {
  // /dashboard → "dashboard"
  // /finance/cashflow → "finance/cashflow" or "finance"
  // /workshop/cars → "workshop/cars" or "workshop"
  const segments = pathname.replace(/^\//, "").split("/");
  const root = segments[0];
  if (!root || root === "pin" || root === "api" || root === "settings") return null;
  const sub = segments[1];
  return sub ? `${root}/${sub}` : root;
}

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

interface SessionPayload {
  userId?: string;
  workspaceId?: string;
  role?: string;
  issuedAt?: number;
  allowedSections?: string[];
  visibleSections?: string[];
  editableSections?: string[];
}

export async function middleware(req: NextRequest) {
  const pinEnabled = process.env.YB_PORTAL_PIN_ENABLED === "true";
  if (!pinEnabled) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;

  if (
    isPublicAsset(pathname) ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookieValue ? await verifySession(cookieValue) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Не найдена активная сессия.", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/pin";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // ── Owner: full access ──────────────────────────────────────────────────────
  if (session.role === "owner") {
    return NextResponse.next();
  }

  // ── Member: enforce section access ─────────────────────────────────────────
  // Owners-only paths
  const isOwnerOnly = OWNER_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isOwnerOnly) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Доступ запрещён.", code: "FORBIDDEN" }, { status: 403 });
    }
    const dashUrl = req.nextUrl.clone(); dashUrl.pathname = "/dashboard"; dashUrl.search = ""; return NextResponse.redirect(dashUrl);
  }

  const sectionId = pathToSection(pathname);
  if (sectionId && sectionId !== "dashboard") {
    const allowed = session.visibleSections ?? session.allowedSections ?? [];
    // Check exact match OR parent section match
    const hasAccess = allowed.some(
      (s) => s === sectionId || sectionId.startsWith(`${s}/`) || sectionId === s.split("/")[0]
    );
    if (!hasAccess) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ ok: false, error: "Доступ запрещён.", code: "FORBIDDEN" }, { status: 403 });
      }
      const dashUrl = req.nextUrl.clone(); dashUrl.pathname = "/dashboard"; dashUrl.search = ""; return NextResponse.redirect(dashUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

async function verifySession(value: string): Promise<SessionPayload | null> {
  const secret = process.env.SESSION_SECRET || process.env.PORTAL_PIN;
  if (!secret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = await hmacSha256(encoded, secret);
  if (expected !== signature) return null;
  try {
    const json = base64UrlDecode(encoded);
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.userId || !payload.workspaceId) return null;
    if (payload.role !== "owner" && payload.role !== "member") return null;
    if (!Number.isFinite(payload.issuedAt)) return null;
    if (Date.now() - Number(payload.issuedAt) > MAX_SESSION_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmacSha256(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bufferToBase64Url(sig);
}

function bufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}
