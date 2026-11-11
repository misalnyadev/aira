import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  // Only active guest contacts, newest post for each kind (seen or not).
  const result = await db.execute<{ character_id: string; kind: string; id: string; viewed: boolean }>(sql`
    SELECT DISTINCT ON (s.character_id, s.kind)
      s.character_id,
      s.kind,
      s.id,
      EXISTS (SELECT 1 FROM status_views v WHERE v.status_id = s.id AND v.user_id = ${user.id}) AS viewed
    FROM character_statuses s
    JOIN character_contacts c ON c.character_id = s.character_id AND c.owner_user_id = s.user_id
    WHERE c.guest_user_id = ${user.id}
      AND c.owner_status = 'approved'
      AND c.admin_status <> 'rejected'
      AND s.user_id <> ${user.id}
      AND s.kind IN ('status', 'reel')
      AND (s.expires_at IS NULL OR s.expires_at > now())
    ORDER BY s.character_id, s.kind, s.created_at DESC, s.id DESC
  `);
  const updates: Record<string, { storyId?: string; reelId?: string; viewed?: boolean }> = {};
  for (const row of result.rows) {
    const entry = updates[row.character_id] ??= {};
    if (row.kind === "status") {
      entry.storyId = row.id;
      entry.viewed = row.viewed;
    }
    if (row.kind === "reel") {
      entry.reelId = row.id;
    }
  }
  return NextResponse.json({ updates }, { headers: { "Cache-Control": "no-store" } });
}
