'use client'

import { usePathname } from 'next/navigation'
import UtopiaClock from './UtopiaClock'

export default function CommandClockMount() {
  const pathname = usePathname()
  if (pathname !== '/') return null
  return <UtopiaClock />
}
