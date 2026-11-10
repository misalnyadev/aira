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

  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (deploymentHost && /^[a-z0-9.-]+(?::\d+)?$/i.test(deploymentHost)) {
    return `https://${deploymentHost}`;
  }

  return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

export function createPasswordResetUrl(token: string): string | null {
  const origin = getAppOrigin();
  if (!origin) return null;

  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
