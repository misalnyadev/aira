const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getAppOrigin(): string | null {
  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      const isLocalDevelopment =
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if (url.username || url.password || url.search || url.hash) return null;
      if (url.protocol !== "https:" && !isLocalDevelopment) return null;
      return url.origin;
    } catch {
      return null;
    }
  }

  // Vercel supplies this value for each deployment; APP_URL is preferred for
  // production so links use the app's stable, user-facing domain.
  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(deploymentHost)) {
    return `https://${deploymentHost}`;
  }

  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export function isPasswordResetEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.PASSWORD_RESET_FROM?.trim() &&
      getAppOrigin()
  );
}

export function createPasswordResetUrl(token: string): string | null {
  const origin = getAppOrigin();
  if (!origin) return null;

  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.PASSWORD_RESET_FROM?.trim();
  if (!apiKey || !from) throw new Error("Password reset email is not configured.");

  const safeUrl = escapeHtml(resetUrl);
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Atur ulang kata sandi HeyTalent",
      text: [
        "Kami menerima permintaan untuk mengatur ulang kata sandi akun HeyTalent kamu.",
        "",
        `Buka tautan ini untuk membuat kata sandi baru: ${resetUrl}`,
        "",
        "Tautan hanya bisa dipakai sekali dan berlaku selama 30 menit.",
        "Jika kamu tidak meminta pengaturan ulang, abaikan email ini.",
      ].join("\n"),
      html: [
        "<!doctype html>",
        '<html lang="id"><body style="font-family:Arial,sans-serif;color:#171717;line-height:1.6">',
        "<h1 style=\"font-size:20px\">Atur ulang kata sandi</h1>",
        "<p>Kami menerima permintaan untuk mengatur ulang kata sandi akun HeyTalent kamu.</p>",
        `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171717;color:#fff;text-decoration:none">Buat kata sandi baru</a></p>`,
        "<p>Tautan hanya bisa dipakai sekali dan berlaku selama 30 menit.</p>",
        "<p>Jika kamu tidak meminta pengaturan ulang, abaikan email ini.</p>",
        "</body></html>",
      ].join(""),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Password reset email provider returned ${response.status}.`);
  }
}
