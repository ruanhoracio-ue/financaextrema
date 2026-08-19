'use client'
import { useMemo, useState } from 'react'
import { Text } from '@/components/ui'
import { money, moneyCompact, monthLabel, niceStep } from '@/lib/format'

export type MesPonto = { mes: string; receitas_cents: number; despesas_cents: number }

const W = 640, H = 220, PAD = { t: 14, r: 8, b: 26, l: 56 }

/**
 * Entradas × saídas, mês a mês. A cor segue a entidade em ordem fixa:
 * entradas = --chart-1, saídas = --chart-2 (nunca por ranking).
 * Barras ≤ 12px, ponta arredondada, base quadrada no zero; a faixa
 * inteira do mês é o alvo de hover, não só os pixels pintados.
 */
export function MonthlyBarsChart({ dados }: { dados: MesPonto[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const { topo, ticks, ih, iw, slot } = useMemo(() => {
    const max = Math.max(...dados.map((d) => Math.max(d.receitas_cents, d.despesas_cents)), 1)
    const passo = niceStep(max)
    const topo = Math.ceil(max / passo) * passo
    const iw = W - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const ticks: number[] = []
    for (let v = 0; v <= topo; v += passo) ticks.push(v)
    return { topo, ticks, ih, iw, slot: iw / Math.max(dados.length, 1) }
  }, [dados])

  if (dados.length === 0) {
    return <Text size="sm" tone="mute" className="mt-4 block">Sem movimento pago nos últimos 12 meses.</Text>
  }

  const bw = Math.min(12, slot / 3.2)
  const y = (v: number) => PAD.t + ih - (v / topo) * ih
  const h = hover != null ? dados[hover] : null

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Entradas e saídas por mês">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgb(var(--c-hairline))" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="rgb(var(--c-faint))">
              {moneyCompact(v)}
            </text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = PAD.l + i * slot + slot / 2
          const hr = (d.receitas_cents / topo) * ih
          const hd = (d.despesas_cents / topo) * ih
          return (
            <g key={d.mes}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* a faixa do mês inteira é o alvo; realce sutil, nunca esmaecer o resto */}
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={ih}
                fill={hover === i ? 'rgb(var(--c-ink) / 0.04)' : 'transparent'} rx={4} />
              <path d={barra(cx - bw - 1, y(d.receitas_cents), bw, PAD.t + ih)} fill="var(--chart-1)" />
              <path d={barra(cx + 1, y(d.despesas_cents), bw, PAD.t + ih)} fill="var(--chart-2)" />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--c-mute))">
                {monthLabel(d.mes)}
              </text>
            </g>
          )
        })}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-md"
          style={{
            left: `${((PAD.l + hover * slot + slot / 2) / W) * 100}%`,
            top: 0,
            transform: hover > dados.length / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
          }}
        >
          <p className="text-caption text-mute">{monthLabel(h.mes)}</p>
          <p className="flex items-center gap-1.5 text-sm tabular-nums">
            <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-1)' }} />
            <strong className="text-ink">{money(h.receitas_cents)}</strong>
            <span className="text-mute">entrou</span>
          </p>
          <p className="flex items-center gap-1.5 text-sm tabular-nums">
            <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-2)' }} />
            <strong className="text-ink">{money(h.despesas_cents)}</strong>
            <span className="text-mute">saiu</span>
          </p>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-caption text-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-1)' }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--chart-2)' }} /> Saídas
        </span>
      </div>
    </div>
  )
}

/** Barra vertical: ponta arredondada (4px) em cima, base quadrada no eixo. */
function barra(x: number, yTopo: number, w: number, yBase: number): string {
  const r = Math.min(4, w / 2, Math.max(yBase - yTopo, 0))
  if (yBase - yTopo < 1) return `M${x},${yBase} h${w} v0 h${-w} Z`
  return `M${x},${yBase} V${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} H${x + w - r} Q${x + w},${yTopo} ${x + w},${yTopo + r} V${yBase} Z`
}
