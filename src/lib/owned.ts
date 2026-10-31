import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";

/**
 * Pastikan karakter yang diminta memang milik pengguna ini.
 *
 * Dipakai semua route yang menerima `id` karakter. Tanpa pemeriksaan ini,
 * siapa pun yang tahu ID karakter bisa membaca atau mengubahnya — ID memang
 * sulit ditebak, tapi itu bukan pengamanan.
 */
export async function findOwnedCharacter(characterId: string, userId: string) {
  const [row] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.userId, userId)))
    .limit(1);
  return row ?? null;
}
