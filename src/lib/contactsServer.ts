import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, contactMessages } from "@/db/schema";

/**
 * Ketika sambungan kontak karakter baru saja aktif (`admin_status = 'approved'`
 * DAN `owner_status = 'approved'`), pastikan ada sapaan pembuka (`greeting`)
 * dari karakter jika utas pesan kontak tersebut masih kosong.
 */
export async function ensureInitialContactGreeting(
  contactId: string,
  characterId: string
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(eq(contactMessages.contactId, contactId));

  if (Number(count) > 0) return;

  const [charRow] = await db
    .select({ greeting: characters.greeting })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const greeting = charRow?.greeting?.trim();
  if (!greeting) return;

  await db.insert(contactMessages).values({
    contactId,
    senderKind: "character_ai",
    content: greeting,
    status: "sent",
  });
}
