import { NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSessionContext();
    return NextResponse.json({
      ok: true,
      data: {
        role: session.role,
        visibleSections: session.visibleSections ?? [],
        displayName: session.displayName ?? null,
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
