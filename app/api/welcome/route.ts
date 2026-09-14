import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { extractDiscordId } from "@/lib/spartan/security";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Snapshot = Row & { observed_at: string; province_id: string | null; kingdom_id: string | null };

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
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function unwrapCapture(capture: Row): Row {
  let value = asObject(capture.parsed_payload ?? capture.raw_payload);
  for (let depth = 0; depth < 6; depth += 1) {
    const next = firstValue(value, ["data", "payload", "throne", "state", "parsed"]);
    if (!next || typeof next !== "object" || Array.isArray(next)) break;
    value = asObject(next);
  }
  return value;
}

function provinceSnapshot(province: Row): Snapshot {
  const state = asObject(province.state_data);
  const throne = asObject(state.throne);
  return {
    observed_at: String(throne.throne_captured_at ?? province.updated_at ?? new Date().toISOString()),
    province_id: String(province.id ?? ""),
    kingdom_id: province.kd_code ? String(province.kd_code) : null,
    acres: numberValue(throne.acres ?? province.acres),
    networth: numberValue(throne.nw ?? province.nw),
    population: numberValue(throne.peons ?? province.peons),
    soldiers: numberValue(throne.soldiers ?? province.soldiers),
    off_specs: numberValue(throne.off_specs ?? province.off_specs),
    def_specs: numberValue(throne.def_specs ?? province.def_specs),
    elites: numberValue(throne.elites ?? province.elites),
    thieves: numberValue(throne.thieves ?? province.thieves),
    wizards: numberValue(throne.wizards ?? province.wizards),
    offense: numberValue(throne.off ?? province.off),
    defense: numberValue(throne.def ?? province.def),
    mana: numberValue(throne.mana ?? province.mana),
    stealth: numberValue(throne.stlth ?? province.stlth),
    build_efficiency: numberValue(throne.be ?? province.be),
    wages: numberValue(throne.wages ?? province.wages),
    source: "canonical_province",
  };
}

function captureSnapshot(capture: Row, province: Row): Snapshot {
  const data = unwrapCapture(capture);
  return {
    observed_at: String(capture.captured_at ?? province.updated_at ?? new Date().toISOString()),
    province_id: String(province.id ?? capture.province_id ?? ""),
    kingdom_id: String(province.kd_code ?? capture.kingdom_id ?? "") || null,
    acres: numberValue(firstValue(data, ["acres", "land"])),
    networth: numberValue(firstValue(data, ["nw", "networth"])),
    population: numberValue(firstValue(data, ["population", "peons", "peasants"])),
    soldiers: numberValue(firstValue(data, ["soldiers"])),
    off_specs: numberValue(firstValue(data, ["off_specs", "offSpecs"])),
    def_specs: numberValue(firstValue(data, ["def_specs", "defSpecs"])),
    elites: numberValue(firstValue(data, ["elites"])),
    thieves: numberValue(firstValue(data, ["thieves"])),
    wizards: numberValue(firstValue(data, ["wizards"])),
    offense: numberValue(firstValue(data, ["offense", "off"])),
    defense: numberValue(firstValue(data, ["defense", "def"])),
    mana: numberValue(firstValue(data, ["mana"])),
    stealth: numberValue(firstValue(data, ["stealth", "stlth"])),
    build_efficiency: numberValue(firstValue(data, ["build_efficiency", "buildEfficiency", "be"])),
    wages: numberValue(firstValue(data, ["wages"])),
    source: capture.source ?? "capture_vault",
  };
}

function fillMissing(current: Snapshot, fallback: Snapshot): Snapshot {
  const result: Snapshot = { ...fallback, ...current, observed_at: current.observed_at || fallback.observed_at };
  for (const key of [
    "acres", "networth", "population", "soldiers", "off_specs", "def_specs", "elites",
    "thieves", "wizards", "offense", "defense", "mana", "stealth", "build_efficiency", "wages",
  ]) {
    if (result[key] == null) result[key] = fallback[key];
  }
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
    .select("preferred_name,introduced_at,last_briefing_at,briefing_count")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (jeevesError) throw jeevesError;

  const discordId = String(account.discord_user_id || extractDiscordId(auth.user) || "") || null;
  return { admin, authUserId: auth.user.id, account, jeeves, discordId };
}

async function findProvince(admin: ReturnType<typeof adminClient>, account: Row, discordId: string | null, full: boolean) {
  let query = admin.from("provinces").select(full ? "*" : "id").eq("name", account.province_name || "");
  if (account.province_location) query = query.eq("kd_code", account.province_location);
  let { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;

  if (!data && discordId) {
    const fallback = await admin.from("provinces").select(full ? "*" : "id").eq("discord_id", discordId).limit(1).maybeSingle();
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  }
  return data;
}

export async function POST(request: Request) {
  try {
    const identity = await verifiedIdentity();
    if ("error" in identity) return identity.error;

    const body = await request.json().catch(() => ({}));
    const preferredName = typeof body.screenName === "string" ? body.screenName.trim().replace(/\s+/g, " ") : "";
    if (!preferredName) return NextResponse.json({ error: "A Spartan name is required." }, { status: 400 });
    if (preferredName.length > 40) return NextResponse.json({ error: "Keep your Spartan name to 40 characters or fewer." }, { status: 400 });

    const province = await findProvince(identity.admin, identity.account, identity.discordId, false);
    const now = new Date().toISOString();
    const { data: profile, error } = await identity.admin
      .from("spartan_jeeves_profiles")
      .upsert({
        auth_user_id: identity.authUserId,
        discord_user_id: identity.discordId,
        province_id: province?.id ?? null,
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

    const province = await findProvince(identity.admin, identity.account, identity.discordId, true);
    if (!province) return NextResponse.json({ error: "Your Spartan account is verified, but your province record is not currently available." }, { status: 404 });

    const since = identity.account.previous_login_at || identity.account.created_at;
    const [historyResult, captureResult, eventResult] = await Promise.all([
      identity.admin.from("spartan_province_history").select("*").eq("province_id", province.id).order("observed_at", { ascending: false }).limit(20),
      identity.admin.from("spartan_capture_vault").select("capture_id,province_id,kingdom_id,captured_at,source,page_kind,parsed_payload,raw_payload").eq("province_id", province.id).eq("page_kind", "throne").order("captured_at", { ascending: false }).limit(20),
      identity.admin.from("spartan_event_history").select("id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,payload").eq("province_id", province.id).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(100),
    ]);
    if (historyResult.error) throw historyResult.error;
    if (captureResult.error) throw captureResult.error;
    if (eventResult.error) throw eventResult.error;

    const canonical = provinceSnapshot(province as Row);
    const historical: Snapshot[] = [
      ...(historyResult.data ?? []).map((row) => fillMissing(row as Row as Snapshot, canonical)),
      ...(captureResult.data ?? []).map((row) => captureSnapshot(row as Row, province as Row)),
    ].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));

    const previous = historical.length > 0 ? historical[historical.length - 1] : null;
    const events = (eventResult.data ?? []) as Row[];
    const change = (key: string): number | null => {
      const current = numberValue(canonical[key]);
      const prior = previous ? numberValue(previous[key]) : null;
      return current != null && prior != null ? current - prior : null;
    };
    const total = (key: string): number | null => {
      if (!events.length) return null;
      return events.reduce((sum, event) => sum + (numberValue(event[key]) ?? 0), 0);
    };

    const alerts: string[] = [];
    const defense = numberValue(canonical.defense);
    if (defense != null && defense < 0) alerts.push("Your current defensive state needs attention.");
    const criticalEvents = events.filter((event) => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${event.event_type ?? ""} ${event.raw_text ?? ""}`));
    if (criticalEvents.length) alerts.push(`${criticalEvents.length} combat or loss event${criticalEvents.length === 1 ? "" : "s"} occurred while you were away.`);

    const firstArrival = !identity.jeeves?.introduced_at;
    const screenName = identity.jeeves?.preferred_name || identity.account.screen_name || "Spartan";
    const currentLoginAt = identity.account.last_login_at || identity.account.created_at;
    const briefingId = String(currentLoginAt);
    const currentAcres = numberValue(canonical.acres);
    const currentNetworth = numberValue(canonical.networth);
    const currentOffense = numberValue(canonical.offense);
    const currentDefense = numberValue(canonical.defense);

    const summary = firstArrival
      ? "Your province is connected. Once you introduce yourself, I will use this verified province state for your future briefings."
      : `Your province is currently at ${currentAcres?.toLocaleString() ?? "unknown"} acres and ${currentNetworth?.toLocaleString() ?? "unknown"} networth, with ${currentOffense?.toLocaleString() ?? "unknown"} offense and ${currentDefense?.toLocaleString() ?? "unknown"} defense. ${events.length ? `${events.length} recorded event${events.length === 1 ? "" : "s"} occurred since your previous login.` : "No recorded province events occurred since your previous login."}`;

    return NextResponse.json({
      ok: true,
      firstArrival,
      historyAvailable: previous !== null,
      briefingId,
      summary,
      jeeves: {
        preferredName: screenName,
        lastBriefingAt: identity.jeeves?.last_briefing_at ?? null,
        briefingCount: identity.jeeves?.briefing_count ?? 0,
      },
      identity: {
        screenName,
        provinceName: String(province.name ?? identity.account.province_name ?? "Unknown province"),
        provinceLocation: String(province.location ?? province.slot ?? identity.account.province_location ?? "") || null,
        kingdom: province.kd_code ? String(province.kd_code) : null,
        race: province.race ? String(province.race) : null,
        personality: province.personality ? String(province.personality) : null,
        lastLoginAt: identity.account.previous_login_at ?? null,
        currentLoginAt: currentLoginAt ? String(currentLoginAt) : null,
      },
      latest: canonical,
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
        alerts,
      },
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Jeeves briefing failed." }, { status: 500 });
  }
}
