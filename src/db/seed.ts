/**
 * Seed manual (opsional) — aplikasi juga auto-seed saat daftar karakter
 * pertama kali dimuat dan database masih kosong.
 *
 * Jalankan: npx -y tsx src/db/seed.ts
 */
import "dotenv/config";
import { pool } from "./index";
import { ensureDemoCharacters } from "../lib/seedDemo";

async function main() {
  const count = await ensureDemoCharacters();
  console.log(
    count > 0
      ? `Seeded ${count} karakter contoh.`
      : "Karakter sudah ada, seed dilewati."
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
