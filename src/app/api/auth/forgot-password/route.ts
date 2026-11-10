import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, users } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";
import { checkEmail, normalizeEmail } from "@/lib/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_COOLDOWN_MS = 15 * 60 * 1000;
const GENERIC_MESSAGE =
  "Jika email akun terdaftar, pengajuan sudah diteruskan ke Admin. Admin akan memverifikasi identitasmu sebelum memberi tautan reset.";

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const requestBody = body as { email?: unknown; contactInfo?: unknown };
  const email = normalizeEmail(typeof requestBody.email === "string" ? requestBody.email : "");
  const emailError = checkEmail(email);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });

  const contactInfo =
    typeof requestBody.contactInfo === "string"
      ? requestBody.contactInfo.trim().replace(/[\r\n\t]+/g, " ")
      : "";
  if (contactInfo.length > 120) {
    return NextResponse.json(
      { error: "Kontak tambahan maksimal 120 karakter." },
      { status: 400 }
    );
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Respons tetap sama untuk email yang tidak terdaftar agar akun tidak bisa ditebak.
  if (!user) return NextResponse.json({ message: GENERIC_MESSAGE });

  try {
    await db.transaction(async (tx) => {
      // Serialisasi per akun menegakkan cooldown sekaligus mencegah pengajuan ganda.
      const [lockedUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update")
        .limit(1);
      if (!lockedUser) return;

      const [pendingRequest] = await tx
        .select({ id: passwordResetRequests.id })
        .from(passwordResetRequests)
        .where(
          and(
            eq(passwordResetRequests.userId, user.id),
            eq(passwordResetRequests.status, "pending")
          )
        )
        .limit(1);
      if (pendingRequest) return;

      const [latestRequest] = await tx
        .select({ createdAt: passwordResetRequests.createdAt })
        .from(passwordResetRequests)
        .where(eq(passwordResetRequests.userId, user.id))
        .orderBy(desc(passwordResetRequests.createdAt))
        .limit(1);
      const cooldownCutoff = Date.now() - REQUEST_COOLDOWN_MS;
      if (latestRequest && latestRequest.createdAt.getTime() > cooldownCutoff) return;

      await tx.insert(passwordResetRequests).values({
        userId: user.id,
        contactInfo,
        status: "pending",
      });
    });
  } catch (error) {
    // Tetap berikan respons umum untuk kegagalan indeks unik akibat pengajuan serentak.
    const message = error instanceof Error ? error.message : "";
    if (!/duplicate key|unique/i.test(message)) throw error;
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
