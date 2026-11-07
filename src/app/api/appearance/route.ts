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
 * Tampilan bawaan akun untuk Chat dan Tatap Muka.
 *
 * Tiap mode disimpan terpisah di server supaya pilihan tampilannya tidak
 * saling memengaruhi dan ikut terbawa ke perangkat lain.
 */
export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [row] = await db
    .select({
      chatBackground: users.chatBackground,
      meetupBackground: users.meetupBackground,
      bubbleStyle: users.bubbleStyle,
      meetupBubbleStyle: users.meetupBubbleStyle,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({
    chatBackground: parseChatBackground(row?.chatBackground),
    meetupBackground: parseChatBackground(row?.meetupBackground),
    bubbleStyle: parseBubbleStyle(row?.bubbleStyle),
    meetupBubbleStyle: parseBubbleStyle(row?.meetupBubbleStyle),
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
    (!("chatBackground" in body) &&
      !("meetupBackground" in body) &&
      !("bubbleStyle" in body) &&
      !("meetupBubbleStyle" in body))
  ) {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if ("chatBackground" in body) {
    updates.chatBackground = JSON.stringify(
      normalizeChatBackground((body as { chatBackground?: unknown }).chatBackground)
    );
  }
  if ("meetupBackground" in body) {
    updates.meetupBackground = JSON.stringify(
      normalizeChatBackground((body as { meetupBackground?: unknown }).meetupBackground)
    );
  }
  if ("bubbleStyle" in body) {
    updates.bubbleStyle = JSON.stringify(
      normalizeBubbleStyle((body as { bubbleStyle?: unknown }).bubbleStyle)
    );
  }
  if ("meetupBubbleStyle" in body) {
    updates.meetupBubbleStyle = JSON.stringify(
      normalizeBubbleStyle((body as { meetupBubbleStyle?: unknown }).meetupBubbleStyle)
    );
  }

  const [row] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, user.id))
    .returning({
      chatBackground: users.chatBackground,
      meetupBackground: users.meetupBackground,
      bubbleStyle: users.bubbleStyle,
      meetupBubbleStyle: users.meetupBubbleStyle,
    });

  return NextResponse.json({
    chatBackground: parseChatBackground(row?.chatBackground),
    meetupBackground: parseChatBackground(row?.meetupBackground),
    bubbleStyle: parseBubbleStyle(row?.bubbleStyle),
    meetupBubbleStyle: parseBubbleStyle(row?.meetupBubbleStyle),
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
      meetupBackground: JSON.stringify(DEFAULT_CHAT_BACKGROUND),
      bubbleStyle: JSON.stringify(DEFAULT_BUBBLE_STYLE),
      meetupBubbleStyle: JSON.stringify(DEFAULT_BUBBLE_STYLE),
    })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    chatBackground: DEFAULT_CHAT_BACKGROUND,
    meetupBackground: DEFAULT_CHAT_BACKGROUND,
    bubbleStyle: DEFAULT_BUBBLE_STYLE,
    meetupBubbleStyle: DEFAULT_BUBBLE_STYLE,
  });
}
