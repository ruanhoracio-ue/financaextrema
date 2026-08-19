'use client'
import { useMemo, useRef, useState } from 'react'
import { Text } from '@/components/ui'
import { dateBR, money, moneyCompact, niceStep } from '@/lib/format'

export type FluxoPonto = {
  bucket_start: string
  projetado_in_cents: number
  projetado_out_cents: number
  saldo_projetado_cents: number
}

const W = 640, H = 220, PAD = { t: 14, r: 16, b: 26, l: 56 }

/**
 * Saldo projetado, semana a semana. Série única (o saldo é a entidade),
 * em --chart-3; área a 10%; linha de zero quando o domínio cruza o zero.
 * Crosshair + tooltip com o que entra/sai previsto na semana.
 */
export function CashProjectionChart({ dados }: { dados: FluxoPonto[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { pts, yZero, ticks, min } = useMemo(() => {
    const vals = dados.map((d) => d.saldo_projetado_cents)
    const lo = Math.min(0, ...vals)
    const hi = Math.max(0, ...vals, 1)
    const passo = niceStep(hi - lo)
    const topo = Math.ceil(hi / passo) * passo
    const piso = Math.floor(lo / passo) * passo
    const iw = W - PAD.l - PAD.r
    const ih = H - PAD.t - PAD.b
    const x = (i: number) => PAD.l + (dados.length === 1 ? iw / 2 : (i / (dados.length - 1)) * iw)
    const y = (v: number) => PAD.t + ih - ((v - piso) / (topo - piso)) * ih
    const ticks: number[] = []
    for (let v = piso; v <= topo; v += passo) ticks.push(v)
    return {
      pts: dados.map((d, i) => ({ x: x(i), y: y(d.saldo_projetado_cents), d })),
      yZero: y(0),
      ticks: ticks.map((v) => ({ v, y: y(v) })),
      min: Math.min(...vals),
    }
  }, [dados])

  if (dados.length < 2) {
    return <Text size="sm" tone="mute" className="mt-4 block">Sem previsões futuras — lance contas a pagar e a receber para ver a projeção.</Text>
  }

  const linha = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const area = `${linha} L${pts[pts.length - 1].x},${yZero} L${pts[0].x},${yZero} Z`
  const h = hover != null ? pts[hover] : null
  const cruzaZero = min < 0

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - px) < Math.abs(pts[best].x - px)) best = i
    setHover(best)
  }

  return (
    <div ref={box} className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label="Saldo projetado para os próximos 90 dias"
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="rgb(var(--c-hairline))" strokeWidth="1" />
            <text x={PAD.l - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="rgb(var(--c-faint))">
              {moneyCompact(t.v)}
            </text>
          </g>
        ))}
        {cruzaZero && (
          <line x1={PAD.l} x2={W - PAD.r} y1={yZero} y2={yZero} stroke="rgb(var(--c-hairline-strong))" strokeWidth="1" />
        )}
        <path d={area} fill="var(--chart-3)" opacity="0.1" />
        <path d={linha} fill="none" stroke="var(--chart-3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* marcador do fim da projeção, com anel da superfície */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="6" fill="rgb(var(--c-surface))" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="var(--chart-3)" />
        <text x={pts[pts.length - 1].x} y={pts[pts.length - 1].y - 10} textAnchor="end" fontSize="11" fontWeight="600" fill="rgb(var(--c-ink))">
          {moneyCompact(dados[dados.length - 1].saldo_projetado_cents)}
        </text>
        {/* eixo x: primeira, meio e última semana */}
        {[0, Math.floor((dados.length - 1) / 2), dados.length - 1].map((i) => (
          <text key={i} x={pts[i].x} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--c-mute))">
            {dateBR(dados[i].bucket_start).slice(0, 5)}
          </text>
        ))}
        {h && (
          <g>
            <line x1={h.x} x2={h.x} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--c-hairline-strong))" strokeWidth="1" />
            <circle cx={h.x} cy={h.y} r="6" fill="rgb(var(--c-surface))" />
            <circle cx={h.x} cy={h.y} r="4" fill="var(--chart-3)" />
          </g>
        )}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-md"
          style={{
            left: `${(h.x / W) * 100}%`,
            top: 0,
            transform: h.x > W / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
          }}
        >
          <p className="text-caption text-mute">semana de {dateBR(h.d.bucket_start)}</p>
          <p className={`text-sm font-semibold tabular-nums ${h.d.saldo_projetado_cents < 0 ? 'text-danger' : 'text-ink'}`}>
            {money(h.d.saldo_projetado_cents)}
          </p>
          <p className="text-caption tabular-nums text-mute">
            entra {money(h.d.projetado_in_cents)} · sai {money(h.d.projetado_out_cents)}
          </p>
        </div>
      )}
    </div>
  )
}
