import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanVoiceId,
  DEFAULT_TTS_ACCOUNT_SUMMARY,
  normalizeHdModelId,
  normalizeTtsConfig,
  parseTtsConfig,
  toTtsAccountSummary,
} from "@/lib/hdVoice";
import { mergePatchedBackupKeys } from "@/lib/providerPool";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [row] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ tts: DEFAULT_TTS_ACCOUNT_SUMMARY });
  }

  return NextResponse.json({ tts: toTtsAccountSummary(parseTtsConfig(row.ttsConfig)) });
}

export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data setelan suara tidak valid." }, { status: 400 });
  }

  const patch = body as {
    apiKey?: string;
    clearApiKey?: boolean;
    backupKeys?: unknown;
    keepBackupIndexes?: unknown;
    newBackupKeys?: unknown;
    modelId?: unknown;
    femaleVoiceId?: unknown;
    maleVoiceId?: unknown;
    stability?: unknown;
    similarityBoost?: unknown;
  };

  if (patch.femaleVoiceId !== undefined && !cleanVoiceId(patch.femaleVoiceId)) {
    return NextResponse.json(
      { error: "Voice ID Perempuan tidak valid. Pastikan hanya huruf/angka tanpa spasi." },
      { status: 400 }
    );
  }
  if (patch.maleVoiceId !== undefined && !cleanVoiceId(patch.maleVoiceId)) {
    return NextResponse.json(
      { error: "Voice ID Laki-laki tidak valid. Pastikan hanya huruf/angka tanpa spasi." },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const current = parseTtsConfig(row?.ttsConfig);

  let nextPrimary = current.apiKey;
  if (patch.clearApiKey) {
    nextPrimary = "";
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    nextPrimary = patch.apiKey.trim();
  }

  const nextBackups = mergePatchedBackupKeys(
    current.backupKeys,
    {
      backupKeys: patch.backupKeys,
      keepBackupIndexes: patch.keepBackupIndexes,
      newBackupKeys: patch.newBackupKeys,
    },
    nextPrimary
  );

  const merged = normalizeTtsConfig({
    apiKey: nextPrimary,
    backupKeys: nextBackups,
    modelId: patch.modelId !== undefined ? normalizeHdModelId(patch.modelId) : current.modelId,
    femaleVoiceId:
      patch.femaleVoiceId !== undefined
        ? cleanVoiceId(patch.femaleVoiceId, current.femaleVoiceId)
        : current.femaleVoiceId,
    maleVoiceId:
      patch.maleVoiceId !== undefined
        ? cleanVoiceId(patch.maleVoiceId, current.maleVoiceId)
        : current.maleVoiceId,
    stability: patch.stability !== undefined ? patch.stability : current.stability,
    similarityBoost:
      patch.similarityBoost !== undefined ? patch.similarityBoost : current.similarityBoost,
  });

  await db
    .update(users)
    .set({ ttsConfig: JSON.stringify(merged) })
    .where(eq(users.id, user.id));

  return NextResponse.json({ tts: toTtsAccountSummary(merged) });
}
