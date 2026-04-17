import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const saveKeySchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().optional()
});

export async function GET() {
  // TODO: fetch from ai_keys table once DB is connected
  return NextResponse.json({ ok: true, data: [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = saveKeySchema.parse(await req.json());
    // TODO: encrypt and save to ai_keys table
    console.log("Save AI key for provider:", body.provider);
    return NextResponse.json({ ok: true, data: { provider: body.provider, saved: true } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Некорректные данные." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Внутренняя ошибка." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const provider = searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider обязателен." }, { status: 400 });
  }
  // TODO: delete from ai_keys table
  return NextResponse.json({ ok: true });
}
