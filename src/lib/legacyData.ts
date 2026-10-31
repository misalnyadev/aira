import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, attachments, characters } from "@/db/schema";

/**
 * Ambil alih data yang dibuat sebelum ada sistem akun.
 *
 * Database produksi sudah berisi karakter dan API key dari versi lama, dan
 * semuanya belum punya pemilik (`user_id` kosong). Daripada menghapusnya,
 * akun PERTAMA yang mendaftar mengambil semuanya. Itu sebabnya akun sendiri
 * harus didaftarkan sebelum link undangan disebar — kalau tidak, data lama
 * jatuh ke akun orang lain.
 *
 * Hanya menyentuh baris yang pemiliknya masih kosong, jadi aman dipanggil
 * berkali-kali.
 */
export async function adoptLegacyData(userId: string): Promise<void> {
  await db.update(characters).set({ userId }).where(isNull(characters.userId));
  await db.update(apiProviders).set({ userId }).where(isNull(apiProviders.userId));
  await db.update(attachments).set({ userId }).where(isNull(attachments.userId));
}
