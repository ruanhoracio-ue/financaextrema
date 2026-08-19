'use client'
import { Badge } from '@/components/ui'

const mapa = {
  pago: { tone: 'success', label: 'Pago' },
  previsto: { tone: 'info', label: 'Previsto' },
  vencido: { tone: 'danger', label: 'Vencido' },
} as const

export function StatusBadge({ status }: { status: string }) {
  const s = mapa[status as keyof typeof mapa] ?? { tone: 'neutral', label: status }
  return <Badge tone={s.tone as 'success'}>{s.label}</Badge>
}
