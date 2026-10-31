/**
 * Mesin Browsing Internet & Pembaca Link Aman untuk Karakter Aisherly.
 *
 * Dirancang agar karakter (khususnya Teman Perencanaan) bisa:
 * 1) Membaca langsung link aplikasi / website / artikel / repo publik (`https://...`)
 *    yang dikirim pengguna di chat untuk memberi masukan ide & perencanaan.
 * 2) Mencari referensi terkini di web publik (baik mendampingi Google Search
 *    bawaan Gemini maupun memberi kemampuan browsing ke Groq / OpenRouter).
 * 3) Tetap aman dari SSRF (memblokir IP lokal, jaringan privat, dan cloud metadata).
 */

const MAX_URLS_PER_TURN = 2;
const MAX_FETCH_BYTES = 512 * 1024; // 512 KB
const MAX_PAGE_TEXT_CHARS = 3_200;
const FETCH_TIMEOUT_MS = 6_500;
const SEARCH_TIMEOUT_MS = 5_500;
const MAX_REDIRECTS = 3;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const URL_EXTRACT_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

const WEB_SEARCH_CUE_RE =
  /\b(browsing|browse|googling|searching|cari\s+(?:di\s+)?(?:internet|google|web|online)|cek\s+(?:di\s+)?(?:internet|google|web|website|situs|link)|coba\s+cari|tolong\s+cari(?:kan)?|info\s+terbaru|berita\s+terbaru|update\s+terbaru|rilis\s+terbaru|harga\s+terbaru|tren\s+terbaru|referensi\s+(?:aplikasi|fitur|desain|produk|ide)|kompetitor|cuaca\s+hari\s+ini|kurs\s+hari\s+ini)\b/i;

export type WebBrowsePlan = {
  urls: string[];
  shouldSearch: boolean;
  searchQuery: string;
};

function trimUrlTrailingPunct(raw: string): string {
  return raw.replace(/[.,;:!?)'"\]]+$/g, "");
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/**
 * Validasi ketat URL publik untuk mencegah SSRF ke jaringan lokal / metadata cloud.
 */
export function isSafePublicUrl(rawUrl: string): boolean {
  if (!rawUrl || rawUrl.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return false;
  }

  // Tolak format IP numerik tunggal/hex/oktal seperti http://2130706433 atau http://0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return false;

  // Tolak IPv6 lokal / link-local / unique-local
  if (host.includes(":")) {
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb") ||
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.") ||
      host.startsWith("::ffff:169.254.")
    ) {
      return false;
    }
    return true;
  }

  if (!host.includes(".")) return false;
  if (isPrivateIpv4(host)) return false;

  return true;
}

/**
 * Analisis pesan pengguna untuk mendeteksi URL yang perlu dibaca dan/atau
 * niat pencarian informasi di internet.
 */
export function extractWebBrowsePlan(userText: string): WebBrowsePlan {
  const clean = (userText || "").trim();
  if (!clean) return { urls: [], shouldSearch: false, searchQuery: "" };

  const matches = clean.match(URL_EXTRACT_RE) ?? [];
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const raw of matches) {
    const candidate = trimUrlTrailingPunct(raw);
    if (!isSafePublicUrl(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    urls.push(candidate);
    if (urls.length >= MAX_URLS_PER_TURN) break;
  }

  const textWithoutUrls = clean
    .replace(URL_EXTRACT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  const shouldSearch = WEB_SEARCH_CUE_RE.test(textWithoutUrls);
  const searchQuery = shouldSearch
    ? textWithoutUrls
        .replace(
          /\b(tolong|coba|dong|ya|deh|browsing|browse|googling|searching|cari\s+di\s+internet|cari\s+di\s+google|cari\s+di\s+web|cek\s+di\s+internet)\b/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140) || textWithoutUrls.slice(0, 140)
    : "";

  return { urls, shouldSearch, searchQuery };
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&lsquo;|&rsquo;|&#39;|&apos;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/gi, '"')
    .replace(/&bull;/gi, "•")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    });
}

function extractMetaContent(html: string, attrPattern: RegExp): string {
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    if (!attrPattern.test(tag)) continue;
    const contentMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const val = contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3] ?? "";
    const decoded = decodeHtmlEntities(val).replace(/\s+/g, " ").trim();
    if (decoded) return decoded;
  }
  return "";
}

/**
 * Ubah HTML mentah menjadi ringkasan teks bersih (lengkap dengan Title & Meta/OG
 * agar aplikasi SPA/Next.js tetap terbaca deskripsinya dengan baik).
 */
export function htmlToReadableText(html: string, maxChars = MAX_PAGE_TEXT_CHARS): string {
  if (!html) return "";

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
    : "";

  const metaDesc =
    extractMetaContent(html, /\bname\s*=\s*["']?description["']?/i) ||
    extractMetaContent(html, /\bproperty\s*=\s*["']?og:description["']?/i);

  const ogTitle = extractMetaContent(html, /\bproperty\s*=\s*["']?og:title["']?/i);

  const bodyCleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(h[1-6]|p|div|section|article|main|header|li|tr|br|hr|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = decodeHtmlEntities(bodyCleaned)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);

  // Buang baris duplikat berurutan yang sering muncul pada menu navigasi
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  const headerParts: string[] = [];
  const bestTitle = title || ogTitle;
  if (bestTitle) headerParts.push(`Judul: ${bestTitle}`);
  if (metaDesc && metaDesc !== bestTitle) headerParts.push(`Deskripsi: ${metaDesc}`);

  const bodyText = deduped.join("\n");
  const combined = [...headerParts, bodyText].filter(Boolean).join("\n\n").trim();

  if (combined.length <= maxChars) return combined;
  return `${combined.slice(0, maxChars).trim()}…`;
}

async function readLimitedText(res: Response, maxBytes = MAX_FETCH_BYTES): Promise<string> {
  if (!res.body) {
    const txt = await res.text();
    return txt.slice(0, maxBytes);
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remain = maxBytes - total;
    const slice = value.byteLength > remain ? value.subarray(0, remain) : value;
    chunks.push(slice);
    total += slice.byteLength;
    if (value.byteLength > remain) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ finalUrl: string; contentType: string; body: string } | null> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafePublicUrl(currentUrl)) return null;

    const res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      const resolved = new URL(location, currentUrl).toString();
      currentUrl = resolved;
      continue;
    }

    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/") &&
      !contentType.includes("html") &&
      !contentType.includes("json") &&
      !contentType.includes("xml")
    ) {
      return null;
    }

    const body = await readLimitedText(res);
    return { finalUrl: currentUrl, contentType, body };
  }

  return null;
}

async function tryFetchGitHubRepoOverview(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== "github.com") return null;

  const segs = parsed.pathname.split("/").filter(Boolean);
  if (segs.length < 2 || segs.length > 4) return null;
  const [owner, repoRaw, third] = segs;
  if (third && third !== "tree" && third !== "readme") return null;
  const repo = repoRaw.replace(/\.git$/i, "");

  try {
    const [metaRes, readmeRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Aisherly-Companion",
        },
        signal: AbortSignal.timeout(4_500),
      }),
      fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
        {
          headers: {
            Accept: "application/vnd.github.raw+json",
            "User-Agent": "Aisherly-Companion",
          },
          signal: AbortSignal.timeout(4_500),
        }
      ),
    ]);

    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as {
      full_name?: string;
      description?: string | null;
      language?: string | null;
      topics?: string[];
      homepage?: string | null;
    };

    const readmeText = readmeRes.ok ? (await readmeRes.text()).slice(0, 2_400).trim() : "";
    const lines = [
      `Repositori GitHub: ${meta.full_name || `${owner}/${repo}`}`,
      meta.description ? `Deskripsi: ${meta.description}` : "",
      meta.language ? `Bahasa utama: ${meta.language}` : "",
      meta.homepage ? `Website live: ${meta.homepage}` : "",
      Array.isArray(meta.topics) && meta.topics.length ? `Topik: ${meta.topics.join(", ")}` : "",
      readmeText ? `Isi README:\n${readmeText}` : "",
    ].filter(Boolean);

    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * Baca isi halaman publik dengan aman dan kembalikan ringkasan teksnya.
 */
export async function fetchSafeWebPage(
  rawUrl: string
): Promise<{ url: string; excerpt: string } | null> {
  if (!isSafePublicUrl(rawUrl)) return null;

  try {
    const ghOverview = await tryFetchGitHubRepoOverview(rawUrl);
    if (ghOverview) {
      return { url: rawUrl, excerpt: ghOverview.slice(0, MAX_PAGE_TEXT_CHARS) };
    }

    const fetched = await fetchWithSafeRedirects(rawUrl);
    if (!fetched || !fetched.body.trim()) return null;

    const excerpt = fetched.contentType.includes("html")
      ? htmlToReadableText(fetched.body, MAX_PAGE_TEXT_CHARS)
      : fetched.body.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_TEXT_CHARS);

    if (!excerpt) return null;
    return { url: fetched.finalUrl, excerpt };
  } catch {
    return null;
  }
}

type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export function parseDuckDuckGoHtml(html: string, maxHits = 5): SearchHit[] {
  const hits: SearchHit[] = [];
  const blockRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,1200}?)(?=<a[^>]*class="[^"]*result__a|$)/gi;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null && hits.length < maxHits) {
    let rawHref = decodeHtmlEntities(m[1]);
    if (rawHref.includes("uddg=")) {
      try {
        const u = new URL(rawHref, "https://html.duckduckgo.com");
        const target = u.searchParams.get("uddg");
        if (target) rawHref = target;
      } catch {
        /* biarkan rawHref */
      }
    }
    if (!isSafePublicUrl(rawHref)) continue;

    const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i.exec(
      m[3]
    );
    const snippet = snippetMatch
      ? decodeHtmlEntities(snippetMatch[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
      : "";

    if (title) {
      hits.push({ title, url: rawHref, snippet: snippet.slice(0, 260) });
    }
  }

  return hits;
}

async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=id-id`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const html = await readLimitedText(res, 256 * 1024);
    return parseDuckDuckGoHtml(html, 5);
  } catch {
    return [];
  }
}

async function searchWikipediaFallback(query: string): Promise<SearchHit[]> {
  for (const lang of ["id", "en"]) {
    try {
      const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=1&format=json&srlimit=3`;
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "Aisherly-Companion/1.0" },
        signal: AbortSignal.timeout(3_500),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        query?: { search?: { title?: string; snippet?: string }[] };
      };
      const items = data?.query?.search ?? [];
      if (!items.length) continue;
      return items
        .filter((it) => it.title)
        .map((it) => ({
          title: `${it.title} (Wikipedia)`,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
            (it.title || "").replace(/\s+/g, "_")
          )}`,
          snippet: decodeHtmlEntities((it.snippet || "").replace(/<[^>]+>/g, ""))
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 260),
        }));
    } catch {
      /* lanjut coba bahasa berikutnya */
    }
  }
  return [];
}

export async function searchPublicWeb(query: string): Promise<SearchHit[]> {
  const clean = query.trim();
  if (!clean) return [];
  const ddgHits = await searchDuckDuckGo(clean);
  if (ddgHits.length > 0) return ddgHits;
  return searchWikipediaFallback(clean);
}

/**
 * Jalankan pembacaan link URL dan/atau pencarian web sesuai rencana giliran ini,
 * lalu format menjadi blok konteks ringkas untuk disuntikkan ke prompt karakter.
 */
export async function gatherWebContext(
  plan: WebBrowsePlan,
  options?: { skipServerSearch?: boolean }
): Promise<string> {
  const blocks: string[] = [];

  const [pages, hits] = await Promise.all([
    plan.urls.length > 0
      ? Promise.all(plan.urls.map((u) => fetchSafeWebPage(u)))
      : Promise.resolve([]),
    plan.shouldSearch && plan.searchQuery && !options?.skipServerSearch
      ? searchPublicWeb(plan.searchQuery)
      : Promise.resolve([]),
  ]);

  const validPages = pages.filter((p): p is { url: string; excerpt: string } => p !== null);
  for (const page of validPages) {
    blocks.push(`[Isi Halaman dari ${page.url}]\n${page.excerpt}`);
  }

  if (plan.urls.length > 0 && validPages.length === 0) {
    blocks.push(
      `[Catatan Akses Link: Halaman ${plan.urls.join(", ")} tidak dapat dibaca langsung (mungkin terkunci login atau memblokir akses otomatis). Sampaikan dengan santai bila kamu butuh dia mengirim tangkapan layar atau cuplikannya.]`
    );
  }

  if (hits.length > 0) {
    const formattedHits = hits
      .map(
        (h, i) =>
          `${i + 1}. ${h.title}\n   Sumber: ${h.url}${h.snippet ? `\n   Ringkasan: ${h.snippet}` : ""}`
      )
      .join("\n\n");
    blocks.push(`[Hasil Pencarian Internet untuk "${plan.searchQuery}"]\n${formattedHits}`);
  }

  return blocks.join("\n\n---\n\n");
}
