'use client'
import type { ReactNode } from 'react'
import { Heading, Text } from '@/components/ui'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Heading level={1}>{title}</Heading>
        {description && <Text size="sm" tone="mute" className="mt-1">{description}</Text>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
