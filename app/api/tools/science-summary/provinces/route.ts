"use strict"

import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sb = createServiceClient()
    const rows: Array<{ province_name: string; kingdom_code: string | null }> = []
    const pageSize = 1000

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await sb
        .from("spartan_province_registry")
        .select("province_name,kingdom_code")
        .not("province_name", "is", null)
        .order("province_name", { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) throw error
      const page = (data || []).filter((row) => typeof row.province_name === "string" && row.province_name.trim())
      rows.push(...page)
      if (!data || data.length < pageSize) break
    }

    const unique = new Map<string, { province_name: string; kingdom_code: string | null }>()
    for (const row of rows) {
      const key = row.province_name.trim().toLowerCase()
      if (!unique.has(key)) {
        unique.set(key, {
          province_name: row.province_name.trim(),
          kingdom_code: row.kingdom_code || null,
        })
      }
    }

    const provinces = [...unique.values()].sort((a, b) =>
      a.province_name.localeCompare(b.province_name)
    )

    return NextResponse.json({ provinces, count: provinces.length })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not load Spartan provinces." },
      { status: 500 }
    )
  }
}
