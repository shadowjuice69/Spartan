import crypto from 'crypto'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function inferPageKind(url: string) {
  const value = url.toLowerCase()
  if (value.includes('throne')) return 'throne'
  if (value.includes('military')) return 'military'
  if (value.includes('science')) return 'science'
  if (value.includes('magic')) return 'magic'
  if (value.includes('thievery')) return 'thievery'
  if (value.includes('news')) return 'news'
  return 'utopiaintel'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  try {
    const expectedKey = process.env.UTOPIA_INTEL_KEY?.trim()
    const captureToken = process.env.UTOPIA_INTEL_CAPTURE_TOKEN?.trim()
    const captureKey = process.env.SPARTAN_CAPTURE_KEY?.trim()

    if (!expectedKey || !captureToken || !captureKey) {
      return response({ success: false, error: 'UtopiaIntel receiver is not configured.' }, 503)
    }

    const form = await request.formData()
    const key = text(form.get('key'))
    const expectedBytes = Buffer.from(expectedKey)
    const suppliedBytes = Buffer.from(key)
    if (!key || suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
      return response({ success: false, error: 'Invalid key.' }, 401)
    }

    const dataHtml = text(form.get('data_html'))
    const dataSimple = text(form.get('data_simple'))
    const sourceUrl = text(form.get('url'))
    const province = text(form.get('prov'))

    if (!dataHtml && !dataSimple) {
      return response({ success: false, error: 'No intel payload received.' }, 400)
    }

    const receivedAt = new Date().toISOString()
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify([sourceUrl, province, dataHtml, dataSimple]))
      .digest('hex')

    const capture = {
      captureId: `utopiaintel-${fingerprint}`,
      capturedAt: receivedAt,
      source: 'utopiaintel',
      sourceId: province || fingerprint,
      pageKind: inferPageKind(sourceUrl),
      url: sourceUrl || null,
      provinceName: province || null,
      province: province || null,
      rawText: dataSimple || dataHtml,
      rawPayload: {
        data_html: dataHtml,
        data_simple: dataSimple,
        url: sourceUrl,
        prov: province,
      },
      parsedPayload: {
        url: sourceUrl,
        prov: province,
        data_simple: dataSimple,
      },
    }

    const captureUrl = new URL('/api/capture', request.url)
    const captureResponse = await fetch(captureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-spartan-capture-key': captureKey,
        'x-spartan-capture-token': captureToken,
      },
      body: JSON.stringify({ capture }),
      cache: 'no-store',
    })

    const captureBody = await captureResponse.json().catch(() => ({}))
    if (!captureResponse.ok && captureResponse.status !== 202) {
      return response({
        success: false,
        error: 'Spartan capture pipeline rejected the intel.',
        details: captureBody,
      }, 502)
    }

    return response({
      success: true,
      captured: captureBody.captured ?? true,
      storedInVault: captureBody.storedInVault ?? false,
      stewardDecision: captureBody.stewardDecision ?? 'accepted',
    })
  } catch (error) {
    return response({
      success: false,
      error: error instanceof Error ? error.message : 'UtopiaIntel receiver failed.',
    }, 500)
  }
}
