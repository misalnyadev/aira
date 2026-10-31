/**
 * Seed manual (opsional).
 *
 * Karakter awal otomatis diberikan saat pendaftaran, jadi skrip ini hanya
 * berguna untuk keadaan darurat: memberi karakter awal ke akun yang sudah ada
 * (misalnya pendaftaran sempat gagal di tengah jalan).
 *
 * Jalankan: npx -y tsx src/db/seed.ts nama@email.com
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { users } from "./schema";
import { ensureDb } from "../lib/dbReady";
import { seedStarterCharacter } from "../lib/seedDemo";

async function main() {
  await ensureDb();

  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    const rows = await db.select({ email: users.email }).from(users);
    console.log(
      rows.length
        ? `Sertakan email. Akun yang ada:\n${rows.map((r) => `- ${r.email}`).join("\n")}`
        : "Belum ada akun sama sekali. Daftar lewat halaman masuk dulu."
    );
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.log(`Akun ${email} tidak ditemukan.`);
    return;
  }

  const id = await seedStarterCharacter(user.id);
  console.log(id ? `Karakter awal dibuat untuk ${email}.` : "Gagal membuat karakter awal.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
