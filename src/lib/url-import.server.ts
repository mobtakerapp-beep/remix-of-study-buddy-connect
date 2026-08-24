const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type UrlExtract = { title: string; text: string; source: "youtube" | "web" };

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageTitle(html: string) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1] ?? "").trim().slice(0, 200) : "";
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (!host.endsWith("youtube.com")) return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
    return m ? (m[2] ?? null) : null;
  } catch {
    return null;
  }
}

async function fetchYoutubeTranscript(id: string): Promise<UrlExtract> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en`, {
    headers: { "user-agent": UA, "accept-language": "ar,en;q=0.8" },
  });
  if (!res.ok) throw new Error("youtube_fetch_failed");
  const html = await res.text();

  const title =
    /"title":\s*{\s*"simpleText":\s*"([^"]+)"/.exec(html)?.[1] ??
    pageTitle(html).replace(/\s*-\s*YouTube$/, "");

  const tracksRaw = /"captionTracks":(\[[\s\S]*?\])/.exec(html)?.[1];
  let transcript = "";
  if (tracksRaw) {
    try {
      const tracks = JSON.parse(tracksRaw.replace(/\\u0026/g, "&")) as Array<{
        baseUrl?: string;
        languageCode?: string;
        kind?: string;
      }>;
      const preferred =
        tracks.find((t) => t.languageCode === "ar") ??
        tracks.find((t) => t.languageCode?.startsWith("en")) ??
        tracks[0];
      if (preferred?.baseUrl) {
        const capRes = await fetch(`${preferred.baseUrl}&fmt=json3`, {
          headers: { "user-agent": UA },
        });
        if (capRes.ok) {
          const json = (await capRes.json()) as {
            events?: Array<{ segs?: Array<{ utf8?: string }> }>;
          };
          transcript = (json.events ?? [])
            .flatMap((e) => (e.segs ?? []).map((s) => s.utf8 ?? ""))
            .join("")
            .replace(/\n+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        }
      }
    } catch {
      /* fall through to description */
    }
  }

  if (transcript.length < 80) {
    const desc =
      /"shortDescription":"([\s\S]*?)","isCrawlable"/.exec(html)?.[1]?.replace(/\\n/g, "\n") ?? "";
    transcript = decodeEntities(desc).trim();
  }

  if (transcript.length < 40) throw new Error("no_transcript");

  return {
    title: (title || "YouTube video").slice(0, 200),
    text: `${title}\n\n${transcript}`.slice(0, 40000),
    source: "youtube",
  };
}

export async function extractFromUrl(rawUrl: string): Promise<UrlExtract> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid_url");

  const yt = youtubeId(url.toString());
  if (yt) return fetchYoutubeTranscript(yt);

  const res = await fetch(url.toString(), {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error("fetch_failed");
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("html") && !ct.includes("text/plain")) throw new Error("unsupported_content");

  const html = await res.text();
  const title = pageTitle(html);
  const body = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  const text = htmlToText(body);
  if (text.length < 200) throw new Error("no_text");

  return { title: title || url.hostname, text: `${title}\n\n${text}`.slice(0, 40000), source: "web" };
}
