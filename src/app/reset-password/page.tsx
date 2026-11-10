import type { Metadata } from "next";
import { PasswordResetView } from "@/components/PasswordResetView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atur ulang kata sandi | HeyTalent",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] ?? "" : params.token ?? "";
  return <PasswordResetView token={token} />;
}
