import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl: string = process.env.DATABASE_URL ?? "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * Database cloud (Neon/Supabase/Railway/dsb) mewajibkan SSL, sedangkan
 * PostgreSQL lokal tidak. Dideteksi otomatis dari URL.
 */
function needsSsl(url: string): boolean {
  if (/[?&]sslmode=(require|verify-ca|verify-full)/i.test(url)) return true;
  if (/[?&]ssl=true/i.test(url)) return true;
  return /(neon\.tech|supabase\.co|railway\.app|render\.com|aivencloud\.com|amazonaws\.com|azure\.com|cockroachlabs\.cloud)/i.test(
    url
  );
}

function isLocalHost(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)([:/])/i.test(url);
}

function buildPool(): Pool {
  const local = isLocalHost(databaseUrl);
  return new Pool({
    connectionString: databaseUrl,
    ssl: !local && needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    // Serverless: jangan menahan koneksi terlalu banyak / terlalu lama.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? buildPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
