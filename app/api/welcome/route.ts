import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { extractDiscordId } from "@/lib/spartan/security";

export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type Snapshot = Row & {
  observed_at: string;
  province_id: string | null;
  kingdom_id: string | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Spartan welcome service is not configured.");
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function numberValue(value: unknown): number | null {
  const number = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(row: Row, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return null;
}

function unwrap(value: unknown, preferred: string[] = []): Row {
  let current = asObject(value);
  for (let depth = 0; depth < 8; depth += 1) {
    const next = firstValue(current, [...preferred, "data", "payload", "parsed", "state"]);
    if (!next || typeof next !== "object" || Array.isArray(next)) break;
    current = asObject(next);
  }
  return current;
}

function snapshotFromIntel(row: Row): Snapshot {
  const raw = asObject(row.raw_payload);
  const parsed = asObject(row.parsed_payload);
  const source = { ...raw, ...parsed };
  const throne = asObject(raw.throne ?? parsed.throne ?? source.throne);
  const data = Object.keys(throne).length ? throne : unwrap(source, ["throne"]);

  return {
    observed_at: String(row.captured_at ?? row.created_at ?? new Date().toISOString()),
    province_id: row.province_id ? String(row.province_id) : null,
    kingdom_id: row.kingdom_id ? String(row.kingdom_id) : null,
    acres: numberValue(firstValue(data, ["acres", "land"])),
    networth: numberValue(firstValue(data, ["nw", "networth"])),
    population: numberValue(firstValue(data, ["peons", "peasants", "population"])),
    soldiers: numberValue(firstValue(data, ["soldiers"])),
    off_specs: numberValue(firstValue(data, ["off_specs", "offSpecs", "strongarms"])),
    def_specs: numberValue(firstValue(data, ["def_specs", "defSpecs", "slingers"])),
    elites: numberValue(firstValue(data, ["elites", "brutes"])),
    thieves: numberValue(firstValue(data, ["thieves"])),
    wizards: numberValue(firstValue(data, ["wizards"])),
    offense: numberValue(firstValue(data, ["offense", "off"])),
    defense: numberValue(firstValue(data, ["defense", "def"])),
    mana: numberValue(firstValue(data, ["mana"])),
    stealth: numberValue(firstValue(data, ["stealth", "stlth"])),
    build_efficiency: numberValue(firstValue(data, ["build_efficiency", "buildEfficiency", "be"])),
    wages: numberValue(firstValue(data, ["wages"])),
    source: row.source ?? "spartan_intel_records",
  };
}

function fillMissing(current: Snapshot, fallback: Snapshot): Snapshot {
  const result = { ...fallback, ...current } as Snapshot;
  for (const key of [
    "acres", "networth", "population", "soldiers", "off_specs", "def_specs", "elites",
    "thieves", "wizards", "offense", "defense", "mana", "stealth", "build_efficiency", "wages",
  ]) if (result[key] == null) result[key] = fallback[key];
  return result;
}

async function verifiedIdentity() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const admin = adminClient();
  const { data: account, error: accountError } = await admin
    .from("spartan_accounts")
    .select("screen_name,discord_user_id,province_name,province_location,previous_login_at,last_login_at,created_at,role")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) return { error: NextResponse.json({ error: "Spartan account identity not found." }, { status: 404 }) };

  const { data: jeeves, error: jeevesError } = await admin
    .from("spartan_jeeves_profiles")
    .select("preferred_name,introduced_at,last_briefing_at,briefing_count,province_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (jeevesError) throw jeevesError;

  const discordId = String(account.discord_user_id || extractDiscordId(auth.user) || "") || null;
  return { admin, authUserId: auth.user.id, account, jeeves, discordId };
}

async function findProvince(admin: ReturnType<typeof adminClient>, account: Row, jeeves: Row | null) {
  if (jeeves?.province_id) {
    const byId = await admin.from("spartan_province_registry").select("*").eq("province_id", String(jeeves.province_id)).maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data as Row;
  }

  let query = admin
    .from("spartan_province_registry")
    .select("*")
    .eq("province_name", account.province_name || "");
  if (account.province_location) query = query.eq("kingdom_code", account.province_location);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function latestIntel(admin: ReturnType<typeof adminClient>, province: Row, kingdom: string | null) {
  const provinceId = String(province.province_id);
  const query = admin
    .from("spartan_intel_records")
    .select("id,capture_id,province_id,kingdom_id,captured_at,created_at,source,page_kind,parsed_payload,raw_payload")
    .eq("province_id", provinceId)
    .eq("page_kind", "throne")
    .order("captured_at", { ascending: false })
    .limit(20);
  const { data, error } = await query;
  if (error) throw error;
  if (data?.length) return data as Row[];

  const fallback = await admin
    .from("spartan_intel_records")
    .select("id,capture_id,province_id,kingdom_id,captured_at,created_at,source,page_kind,parsed_payload,raw_payload")
    .eq("kingdom_id", kingdom || "")
    .eq("page_kind", "throne")
    .order("captured_at", { ascending: false })
    .limit(20);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as Row[];
}

export async function POST(request: Request) {
  try {
    const identity = await verifiedIdentity();
    if ("error" in identity) return identity.error;

    const body = await request.json().catch(() => ({}));
    const preferredName = typeof body.screenName === "string" ? body.screenName.trim().replace(/\s+/g, " ") : "";
    if (!preferredName) return NextResponse.json({ error: "A Spartan name is required." }, { status: 400 });
    if (preferredName.length > 40) return NextResponse.json({ error: "Keep your Spartan name to 40 characters or fewer." }, { status: 400 });

    const province = await findProvince(identity.admin, identity.account, identity.jeeves);
    const now = new Date().toISOString();
    const { data: profile, error } = await identity.admin
      .from("spartan_jeeves_profiles")
      .upsert({
        auth_user_id: identity.authUserId,
        discord_user_id: identity.discordId,
        province_id: province?.province_id ?? null,
        preferred_name: preferredName,
        introduced_at: identity.jeeves?.introduced_at ?? now,
        updated_at: now,
      }, { onConflict: "auth_user_id" })
      .select("preferred_name,introduced_at,last_briefing_at,briefing_count")
      .single();
    if (error) throw error;

    const { error: accountError } = await identity.admin
      .from("spartan_accounts")
      .update({ screen_name: preferredName, updated_at: now })
      .eq("auth_user_id", identity.authUserId);
    if (accountError) throw accountError;

    return NextResponse.json({ ok: true, jeeves: profile });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Unable to establish Jeeves." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const identity = await verifiedIdentity();
    if ("error" in identity) return identity.error;

    const province = await findProvince(identity.admin, identity.account, identity.jeeves);
    if (!province) return NextResponse.json({ error: "Your Spartan account is verified, but your province is not linked to the canonical province registry." }, { status: 404 });

    const kingdom = province.kingdom_code ? String(province.kingdom_code) : identity.account.province_location ? String(identity.account.province_location) : null;
    const since = identity.account.previous_login_at || identity.account.created_at;
    const [intelRows, eventResult] = await Promise.all([
      latestIntel(identity.admin, province, kingdom),
      identity.admin
        .from("spartan_event_history")
        .select("id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,payload")
        .eq("province_id", String(province.province_id))
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);
    if (eventResult.error) throw eventResult.error;

    const snapshots = intelRows.map(snapshotFromIntel);
    const latest = snapshots[0] ?? null;
    const prior = snapshots[1] ?? null;
    const events = (eventResult.data ?? []) as Row[];
    const change = (key: string) => {
      const current = numberValue(latest?.[key]);
      const old = numberValue(prior?.[key]);
      return current != null && old != null ? current - old : null;
    };
    const total = (key: string) => events.length ? events.reduce((sum, event) => sum + (numberValue(event[key]) ?? 0), 0) : null;

    const alerts: string[] = [];
    const criticalEvents = events.filter((event) => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${event.event_type ?? ""} ${event.raw_text ?? ""}`));
    if (criticalEvents.length) alerts.push(`${criticalEvents.length} combat or loss event${criticalEvents.length === 1 ? "" : "s"} occurred while you were away.`);

    const metadata = asObject(province.metadata);
    const firstArrival = !identity.jeeves?.introduced_at;
    const screenName = identity.jeeves?.preferred_name || identity.account.screen_name || "Spartan";
    const briefingId = String(latest?.observed_at ?? identity.account.last_login_at ?? identity.account.created_at ?? Date.now());
    const summary = latest
      ? `Your province is at ${latest.acres?.toLocaleString?.() ?? "unknown"} acres and ${latest.networth?.toLocaleString?.() ?? "unknown"} networth, with ${latest.offense?.toLocaleString?.() ?? "unknown"} offense and ${latest.defense?.toLocaleString?.() ?? "unknown"} defense. ${events.length ? `${events.length} recorded event${events.length === 1 ? "" : "s"} occurred since your previous login.` : "No recorded province events occurred since your previous login."}`
      : "Jeeves is connected to your canonical province identity, but no Throne capture has been recorded yet.";

    return NextResponse.json({
      ok: true,
      firstArrival,
      historyAvailable: prior !== null,
      briefingId,
      summary,
      jeeves: {
        preferredName: screenName,
        lastBriefingAt: identity.jeeves?.last_briefing_at ?? null,
        briefingCount: identity.jeeves?.briefing_count ?? 0,
      },
      identity: {
        screenName,
        provinceName: String(province.province_name ?? identity.account.province_name ?? "Unknown province"),
        provinceLocation: String(province.slot ?? identity.account.province_location ?? "") || null,
        kingdom,
        race: metadata.race ? String(metadata.race) : null,
        personality: metadata.personality ? String(metadata.personality) : null,
        lastLoginAt: identity.account.previous_login_at ?? null,
        currentLoginAt: identity.account.last_login_at ?? identity.account.created_at ?? null,
      },
      latest: latest ?? {},
      changes: {
        acres: change("acres"),
        networth: change("networth"),
        population: change("population"),
        soldiers: change("soldiers"),
        off_specs: change("off_specs"),
        def_specs: change("def_specs"),
        elites: change("elites"),
        thieves: change("thieves"),
        wizards: change("wizards"),
        offense: change("offense"),
        defense: change("defense"),
        mana: change("mana"),
        stealth: change("stealth"),
      },
      away: {
        since,
        eventCount: events.length,
        troopsLost: total("troops_lost"),
        thievesLost: total("thieves_lost"),
        wizardsLost: total("wizards_lost"),
        acresChange: total("acres_change"),
        alerts,
      },
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Jeeves briefing failed." }, { status: 500 });
  }
}
