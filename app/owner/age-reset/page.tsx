'use client'

import { C, Shell, Tag } from '@/components/spartan/ui'
import AgeReset from '@/app/command/age-reset/page'

export default function OwnerAgeResetPage() {
  return (
    <Shell
      title="Age Reset"
      eyebrow="SPARTAN // OWNER ONLY"
      accent={C.lime}
      subtitle="Archive the ending age's game data and start the new age. Preview first; nothing changes until you confirm."
      right={<Tag color={C.lime}>OWNER LOCKED</Tag>}
    >
      <AgeReset />
    </Shell>
  )
}
