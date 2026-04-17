import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session-cookie";

export type SessionContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
  sessionId?: string;
  visibleSections?: string[];
  editableSections?: string[];
  displayName?: string;
};

export class SessionRequiredError extends Error {
  constructor() {
    super("Не найдена активная сессия.");
    this.name = "SessionRequiredError";
  }
}

export async function getSessionContext(): Promise<SessionContext> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySession(sessionCookie);

  if (session) {
    return {
      userId: session.userId,
      workspaceId: session.workspaceId,
      role: session.role,
      sessionId: session.sessionId,
      visibleSections: session.visibleSections ?? session.allowedSections,
      editableSections: session.editableSections ?? session.visibleSections ?? session.allowedSections,
      displayName: session.displayName,
    };
  }

  if (process.env.YB_PORTAL_PIN_ENABLED === "true") {
    throw new SessionRequiredError();
  }

  const fallbackWorkspaceId = process.env.DEFAULT_WORKSPACE_ID ?? "00000000-0000-0000-0000-000000000001";
  const fallbackUserId = process.env.DEFAULT_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  return {
    userId: fallbackUserId,
    workspaceId: fallbackWorkspaceId,
    role: "owner"
  };
}
