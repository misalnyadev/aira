import { AuthGate } from "@/components/AuthGate";
import { ChatApp } from "@/components/ChatApp";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  /*
   * Sesi diperiksa di server, bukan lewat fetch dari browser.
   * Dengan begitu layar masuk muncul langsung tanpa sempat berkedip
   * menampilkan aplikasi, dan isi percakapan tidak pernah terkirim ke
   * browser sebelum terbukti ada sesi yang sah.
   */
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Database belum siap / belum bisa dihubungi: tampilkan layar masuk.
    user = null;
  }

  return (
    <AuthGate initialUser={user}>
      <ChatApp />
    </AuthGate>
  );
}
