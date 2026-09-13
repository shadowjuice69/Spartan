const WIKI_SOURCE = "https://raw.githubusercontent.com/shadowjuice69/utopia-nexus/main/utopia-wiki.html";

export async function GET() {
  const response = await fetch(WIKI_SOURCE, { cache: "no-store" });

  if (!response.ok) {
    return new Response("Utopia Wiki source is temporarily unavailable.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const html = await response.text();

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
