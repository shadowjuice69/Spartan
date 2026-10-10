import { redirect } from 'next/navigation'
import IntelVerticalPage from '@/components/spartan/IntelVerticalPage'

const intelSections = new Set([
  'intel',
  'magic',
  'thievery',
  'science',
  'buildings',
  'throne',
  'news',
  'war-room',
])

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params

  // Keep the shared intelligence view for supported dynamic sections.
  // Unknown paths should land on the main Intel page instead of rendering
  // misleading Intel Core content for an invalid section.
  if (!intelSections.has(section)) {
    redirect('/command/intel')
  }

  return <IntelVerticalPage />
}
