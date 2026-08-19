'use client'
import { Text } from '@/components/ui'
import { money } from '@/lib/format'

export type TopDespesa = { category_id: string; category_name: string; total_cents: number }

/**
 * Magnitude de uma medida só → barras horizontais num único matiz
 * (saídas são sempre --chart-2). O comprimento carrega o valor;
 * o texto usa tokens de texto, nunca a cor da série.
 */
export function TopExpensesBars({ dados, totalMes }: { dados: TopDespesa[]; totalMes?: number }) {
  if (dados.length === 0) {
    return <Text size="sm" tone="mute" className="mt-3 block">Nenhuma despesa paga neste mês.</Text>
  }
  const max = Math.max(...dados.map((d) => d.total_cents), 1)
  const total = totalMes ?? dados.reduce((s, d) => s + d.total_cents, 0)

  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {dados.map((d) => {
        const pct = Math.round((d.total_cents / total) * 100)
        return (
          <li key={d.category_id} className="group/bar" title={`${d.category_name}: ${money(d.total_cents)} (${pct}% das saídas do mês)`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-body">{d.category_name}</span>
              <span className="shrink-0 tabular-nums font-medium text-ink">{money(d.total_cents)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-r-[4px] bg-ink/[0.05]">
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-slow ease-out-soft group-hover/bar:opacity-80"
                style={{ width: `${(d.total_cents / max) * 100}%`, background: 'var(--chart-2)' }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
