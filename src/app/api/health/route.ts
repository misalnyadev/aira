import { db } from "@/db";
import { ensureDb } from "@/lib/dbReady";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Sekaligus membuat tabel otomatis bila database masih kosong
    // (berguna saat pertama kali deploy ke Vercel + Neon).
    await ensureDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Database tidak dapat dihubungi",
      },
      { status: 500 }
    );
  }
}
