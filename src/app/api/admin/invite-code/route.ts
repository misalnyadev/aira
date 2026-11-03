import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  clearSignupCodeOverride,
  setSignupCodeOverride,
} from "@/lib/inviteServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN = { error: "Hanya Admin yang dapat mengubah kode undangan." };

export async function PATCH(req: Request) {
  await ensureDb();

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const mode = String((body as Record<string, unknown>).mode ?? "custom");

  if (mode === "close") {
    const signupInvite = await setSignupCodeOverride("");
    return NextResponse.json({ signupInvite });
  }

  if (mode === "reset_env") {
    const signupInvite = await clearSignupCodeOverride();
    return NextResponse.json({ signupInvite });
  }

  const rawCode = String((body as Record<string, unknown>).code ?? "").trim();
  if (rawCode.length < 4 || rawCode.length > 64) {
    return NextResponse.json(
      { error: "Kode undangan harus 4–64 karakter." },
      { status: 400 }
    );
  }

  const signupInvite = await setSignupCodeOverride(rawCode);
  return NextResponse.json({ signupInvite });
}
