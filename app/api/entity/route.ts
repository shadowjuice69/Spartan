import { NextResponse } from "next/server"
import { createClient as admin } from "@supabase/supabase-js"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import fs from "node:fs/promises"
import path from "node:path"

export const dynamic = "force-dynamic"

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Spartan Intel service is not configured.")
  return admin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
function slug(v: unknown) {
  return String(v || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
function payload(row: any) {
  if (row.parsed_payload && typeof row.parsed_payload === "object") return row.parsed_payload
  if (typeof row.parsed_payload === "string") { try { return JSON.parse(row.parsed_payload) } catch {} }
  return row.raw_payload || {}
}
function first(p: any, keys: string[]) {
  for (const k of keys) if (p?.[k] !== undefined && p?.[k] !== null && p?.[k] !== "") return String(p[k])
  return null
}
function wikiRow(html: string, name: string) {
  const marker = "<strong>" + name + "</strong>"
  const i = html.toLowerCase().indexOf(marker.toLowerCase())
  if (i < 0) return null
  const end = html.indexOf("</tr>", i)
  if (end < 0) return null
  const row = html.slice(Math.max(0, html.lastIndexOf("<tr", i)), end + 5)
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => String(x[1]).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
  if (cells.length < 4) return null
  return { name: cells[0], ability: cells[1], bonuses: cells[2], penalties: cells[3], military: cells[4] || null, sourceAge: 116, source: "Spartan authoritative Utopia Wiki snapshot" }
}

export async function GET(request: Request) {
  try {
    const session = await createClient()
    const auth = await session.auth.getUser()
    if (!auth.data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const q = new URL(request.url).searchParams
    const type = String(q.get("type") || "province").toLowerCase()
    const wanted = slug(q.get("slug"))
    if (!wanted) return NextResponse.json({ error: "Entity slug is required." }, { status: 400 })

    const supabase = db()
    const acct = await supabase.from("spartan_accounts").select("province_name,province_location").eq("auth_user_id", auth.data.user.id).maybeSingle()
    if (acct.error) throw acct.error
    if (!acct.data?.province_name || !acct.data?.province_location) return NextResponse.json({ error: "Your Spartan account identity is not linked." }, { status: 403 })

    const result = await supabase.from("spartan_intel_records")
      .select("id,capture_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,created_at,source,page_kind,classification_confidence,classification_reason,age,game_year,game_tick,raw_text,parsed_payload,raw_payload")
      .or("kingdom_id.eq." + acct.data.province_location + ",kingdom_id.is.null")
      .order("created_at", { ascending: false }).limit(1000)
    if (result.error) throw result.error

    const rows = (result.data || []).filter((r: any) => {
      const p = payload(r)
      const fields = type === "province" ? ["province","provinceName","province_name","attackerProvince","targetProvince"] :
        type === "attack" ? ["attackerProvince","attacker","targetProvince","target","attackType"] :
        type === "race" ? ["race","raceName"] :
        type === "personality" ? ["personality","personalityName"] :
        type === "kingdom" ? ["kingdom","kingdomCode","attackerKingdom","targetKingdom"] : ["name","title"]
      return fields.some(k => slug(p[k]) === wanted) || (type === "province" && slug(r.province_id) === wanted) || (type === "attack" && r.page_kind === "attack")
    })

    const sample = rows[0] ? payload(rows[0]) : {}
    const wikiName = type === "race" ? first(sample, ["race","raceName"]) : first(sample, ["personality","personalityName"])
    let knowledge = null
    if (wikiName && (type === "race" || type === "personality")) {
      const html = await fs.readFile(path.join(process.cwd(), "utopia-wiki.html"), "utf8")
      knowledge = wikiRow(html, wikiName)
    }

    const related = rows.slice(0, 100).map((r: any) => ({
      id:r.id,page_kind:r.page_kind,captured_at:r.captured_at,created_at:r.created_at,
      province_id:r.province_id,kingdom_id:r.kingdom_id,target_province_id:r.target_province_id,target_kingdom_id:r.target_kingdom_id,
      source:r.source,confidence:r.classification_confidence,reason:r.classification_reason,
      age:r.age,game_year:r.game_year,game_tick:r.game_tick,payload:payload(r),raw_text:r.raw_text
    }))

    const sets: Record<string, Set<string>> = { provinces:new Set(), kingdoms:new Set(), races:new Set(), personalities:new Set(), events:new Set() }
    for (const r of related) {
      const p=r.payload || {}
      ;[p.province,p.provinceName,p.province_name,p.attackerProvince,p.targetProvince].filter(Boolean).forEach((v:any)=>sets.provinces.add(String(v)))
      ;[p.kingdom,p.kingdomCode,p.attackerKingdom,p.targetKingdom].filter(Boolean).forEach((v:any)=>sets.kingdoms.add(String(v)))
      ;[p.race,p.raceName].filter(Boolean).forEach((v:any)=>sets.races.add(String(v)))
      ;[p.personality,p.personalityName].filter(Boolean).forEach((v:any)=>sets.personalities.add(String(v)))
      sets.events.add(String(r.page_kind))
    }
    const connections = Object.fromEntries(Object.entries(sets).map(([k,v]) => [k, [...v].slice(0,60)]))
    const name = knowledge?.name || first(sample, ["province","provinceName","province_name","kingdom","kingdomCode","race","raceName","personality","personalityName"]) || wanted.replaceAll("-"," ")

    return NextResponse.json({ ok:true, entity:{ type, slug:wanted, name, currentAge:rows[0]?.age ?? knowledge?.sourceAge ?? null, knowledge }, related, connections })
  } catch (error) {
    return NextResponse.json({ error:error instanceof Error ? error.message : "Entity query failed" }, { status:500 })
  }
}