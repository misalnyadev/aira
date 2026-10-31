import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_BUBBLE_STYLE,
  normalizeBubbleStyle,
  parseBubbleStyle,
} from "@/lib/bubbleStyle";
import { ensureDb } from "@/lib/dbReady";
import {
  DEFAULT_CHAT_BACKGROUND,
  normalizeChatBackground,
  parseChatBackground,
} from "@/lib/chatBackground";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = { error: "Kamu belum masuk." };

/**
 * Tampilan chat milik akun (latar chat & gaya gelembung pesan bawaan).
 *
 * Disimpan di server, bukan di HP, supaya tampilan yang dipilih di satu
 * perangkat ikut terbawa ke perangkat lain.
 */
export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [row] = await db
    .select({
      chatBackground: users.chatBackground,
      bubbleStyle: users.bubbleStyle,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({
    chatBackground: parseChatBackground(row?.chatBackground),
    bubbleStyle: parseBubbleStyle(row?.bubbleStyle),
  });
}

export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    (!("chatBackground" in body) && !("bubbleStyle" in body))
  ) {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if ("chatBackground" in body) {
    updates.chatBackground = JSON.stringify(
      normalizeChatBackground((body as { chatBackground?: unknown }).chatBackground)
    );
  }
  if ("bubbleStyle" in body) {
    updates.bubbleStyle = JSON.stringify(
      normalizeBubbleStyle((body as { bubbleStyle?: unknown }).bubbleStyle)
    );
  }

  const [row] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning({
      chatBackground: users.chatBackground,
      bubbleStyle: users.bubbleStyle,
    });

  return NextResponse.json({
    chatBackground: parseChatBackground(row?.chatBackground),
    bubbleStyle: parseBubbleStyle(row?.bubbleStyle),
  });
}

/** Kembalikan latar & gelembung bawaan akun. */
export async function DELETE() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  await db
    .update(users)
    .set({
      chatBackground: JSON.stringify(DEFAULT_CHAT_BACKGROUND),
      bubbleStyle: JSON.stringify(DEFAULT_BUBBLE_STYLE),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    chatBackground: DEFAULT_CHAT_BACKGROUND,
    bubbleStyle: DEFAULT_BUBBLE_STYLE,
  });
}
