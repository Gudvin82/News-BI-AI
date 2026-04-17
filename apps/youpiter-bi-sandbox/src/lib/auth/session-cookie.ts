import crypto from "crypto";

export const SESSION_COOKIE_NAME = "yb_session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 14;
const MAX_SESSION_AGE_MS = DEFAULT_MAX_AGE * 1000;

export type SessionPayload = {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
  issuedAt: number;
  allowedSections?: string[];
  visibleSections?: string[];
  editableSections?: string[];
  sessionId?: string;
  displayName?: string;
};

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.PORTAL_PIN;
  if (process.env.NODE_ENV === "production" && !secret) {
    return null;
  }
  return secret ?? "dev-session-secret";
}

export function signSession(payload: SessionPayload) {
  const secret = getSessionSecret();
  if (!secret) return null;
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySession(value?: string | null) {
  if (!value) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.userId || !payload?.workspaceId) return null;
    if (payload.role !== "owner" && payload.role !== "member") return null;
    if (!Number.isFinite(payload.issuedAt)) return null;
    if (Date.now() - payload.issuedAt > MAX_SESSION_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  const baseUrl = process.env.APP_BASE_URL ?? "";
  const isHttps = baseUrl.startsWith("https://");
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEFAULT_MAX_AGE
  };
}
