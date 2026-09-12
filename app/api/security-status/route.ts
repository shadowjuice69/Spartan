import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeDashboard, extractDiscordId } from '@/lib/spartan/security'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const discordId = extractDiscordId(data.user)

    if (!discordId) {
      return NextResponse.json({ recorded: false, reason: 'discord_identity_required' }, { status: 401 })
    }

    const security = await authorizeDashboard(request, discordId)
    return NextResponse.json({
      recorded: security.allowed,
      ip: security.ip,
      access: security.access?.status ?? null,
      role: security.access?.role ?? (security.protectedIdentity ? 'protected' : null),
    })
  } catch (error) {
    return NextResponse.json({ recorded: false, reason: error instanceof Error ? error.message : 'security_check_failed' }, { status: 500 })
  }
}
