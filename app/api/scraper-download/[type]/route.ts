import { NextResponse } from 'next/server'

const FILES = {
  chrome: {
    url: 'https://raw.githubusercontent.com/shadowjuice69/Spartan/main/scraper/chrome/spartan-capture-chrome-4.0.12.zip',
    filename: 'spartan-capture-chrome-4.0.12.zip',
    contentType: 'application/zip',
  },
  tampermonkey: {
    url: 'https://raw.githubusercontent.com/shadowjuice69/Spartan/main/scraper/chrome/spartan-universal-capture-4_0_12.user.txt',
    filename: 'spartan-universal-capture-4_0_12.user.txt',
    contentType: 'text/plain; charset=utf-8',
  },
} as const

export async function GET(
  _request: Request,
  context: { params: Promise<{ type: string }> },
) {
  const { type } = await context.params
  const file = FILES[type as keyof typeof FILES]

  if (!file) {
    return NextResponse.json({ error: 'Unknown scraper type' }, { status: 404 })
  }

  const upstream = await fetch(file.url, { cache: 'no-store' })
  if (!upstream.ok) {
    return NextResponse.json({ error: 'Scraper file unavailable' }, { status: 502 })
  }

  const body = await upstream.arrayBuffer()
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
