import { NextResponse } from "next/server"
import { PDFParse } from "pdf-parse"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No PDF or TXT file was uploaded." }, { status: 400 })
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    const isTxt = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")

    if (!isPdf && !isTxt) {
      return NextResponse.json({ error: "Please upload a PDF or TXT file." }, { status: 400 })
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large. Maximum size is 15 MB." }, { status: 413 })
    }

    if (isTxt) {
      const text = (await file.text()).trim()
      if (!text) {
        return NextResponse.json({ error: "That TXT file is empty." }, { status: 422 })
      }
      return NextResponse.json({ text, filename: file.name, type: "text" })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      const text = result.text?.trim() ?? ""
      if (!text) {
        return NextResponse.json(
          { error: "No selectable text was found in that PDF. A scanned/image-only PDF needs OCR first." },
          { status: 422 },
        )
      }
      return NextResponse.json({ text, pages: result.total ?? undefined, filename: file.name, type: "pdf" })
    } finally {
      await parser.destroy()
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Could not read that file: " + (error instanceof Error ? error.message : String(error)) },
      { status: 500 },
    )
  }
}
