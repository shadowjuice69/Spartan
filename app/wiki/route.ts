import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function latestWikiFromDb(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.from("spartan_wiki")
      .select("content_html").eq("document_key", "utopia-reference").eq("approved", true)
      .order("age_number", { ascending: false }).limit(1).maybeSingle();
    if (error || !data?.content_html) return null;
    return data.content_html as string;
  } catch {
    return null;
  }
}

export async function GET() {
  let html = await latestWikiFromDb();
  if (!html) {
    const wikiPath = path.join(process.cwd(), "lib", "spartan", "knowledge", "utopia-reference.html");
    html = await readFile(wikiPath, "utf8");
  }
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
