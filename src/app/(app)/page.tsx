'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SlidersHorizontal } from '@phosphor-icons/react'
import { Button, MetricCard, Card, Heading, Text } from '@/components/ui'
import { Modal } from '@/components/app/Modal'
import { QuickAddBar } from '@/components/app/QuickAddBar'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { money, monthLabel, firstDayOfMonthISO, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'

type Resumo = {
  saldo_atual_cents: number
  a_receber_cents: number
  a_pagar_cents: number
  vencido_receber_cents: number
  vencido_pagar_cents: number
  resultado_mes_cents: number
  runway_meses: number | null
}
type Evolucao = { mes: string; receitas_cents: number; despesas_cents: number }
type TopDespesa = { category_id: string; category_name: string; total_cents: number }

const WIDGETS = [
  { key: 'quick', label: 'Lançar rápido' },
  { key: 'metrics', label: 'Indicadores do topo' },
  { key: 'atrasados', label: 'Alerta de atrasados' },
  { key: 'chart', label: 'Últimos 12 meses' },
  { key: 'runway', label: 'Fôlego de caixa' },
  { key: 'top', label: 'Maiores despesas' },
] as const

export default function DashboardPage() {
  const { supabase, company } = useSession()
  /* dashboard personalizável: o que aparece é escolha de quem usa */
  const [visiveis, setVisiveis] = useState<Set<string>>(new Set(WIDGETS.map((w) => w.key)))
  const [personalizar, setPersonalizar] = useState(false)
  useEffect(() => {
    if (!company) return
    const salvo = localStorage.getItem(`fe.dash.${company.id}`)
    if (salvo) setVisiveis(new Set(JSON.parse(salvo)))
  }, [company?.id])
  function toggleWidget(key: string) {
    setVisiveis((v) => {
      const n = new Set(v)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      localStorage.setItem(`fe.dash.${company!.id}`, JSON.stringify([...n]))
      return n
    })
  }
  const hoje = todayISO()
  const inicioMes = firstDayOfMonthISO(hoje)

  const resumo = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_dashboard_summary', { p_company: company!.id })
    if (error) throw error
    return (data?.[0] ?? null) as Resumo | null
  }, [company?.id])

  const evolucao = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_monthly_evolution', { p_company: company!.id })
    if (error) throw error
    return (data ?? []) as Evolucao[]
  }, [company?.id])

  const top = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_top_expenses', {
      p_company: company!.id, p_from: inicioMes, p_to: hoje, p_limit: 5,
    })
    if (error) throw error
    return (data ?? []) as TopDespesa[]
  }, [company?.id])

  const r = resumo.data
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Como está o dinheiro da empresa agora."
        actions={
          <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={15} />}
            onClick={() => setPersonalizar(true)}>
            Personalizar
          </Button>
        }
      />

      {visiveis.has('quick') && <div className="mb-4"><QuickAddBar onSaved={() => { resumo.reload(); evolucao.reload(); top.reload() }} /></div>}

      {visiveis.has('metrics') && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Saldo em contas" value={money(r?.saldo_atual_cents)} />
        <MetricCard label="Falta receber" value={money(r?.a_receber_cents)} />
        <MetricCard label="Falta pagar" value={money(r?.a_pagar_cents)} />
        <MetricCard label="Sobrou no mês" value={money(r?.resultado_mes_cents)} />
      </div>}

      {visiveis.has('atrasados') && r && (r.vencido_receber_cents > 0 || r.vencido_pagar_cents > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-danger/30 bg-danger-soft/40 px-4 py-2.5">
          {r.vencido_receber_cents > 0 && (
            <Link href="/a-receber" className="text-sm text-danger-deep hover:underline">
              {money(r.vencido_receber_cents)} a receber atrasado →
            </Link>
          )}
          {r.vencido_pagar_cents > 0 && (
            <Link href="/a-pagar" className="text-sm text-danger-deep hover:underline">
              {money(r.vencido_pagar_cents)} a pagar atrasado →
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {visiveis.has('chart') && <Card variant="flat" className="lg:col-span-2">
          <Heading level={4}>Últimos 12 meses</Heading>
          <Text size="sm" tone="mute" className="mt-0.5">O que entrou e saiu de verdade, mês a mês.</Text>
          <EvolucaoChart dados={evolucao.data ?? []} />
        </Card>}

        <div className="flex flex-col gap-4">
          {visiveis.has('runway') && <Card variant="flat">
            <Heading level={4}>Fôlego de caixa</Heading>
            <Text size="sm" tone="mute" className="mt-0.5">Por quantos meses o saldo paga as despesas.</Text>
            <p className="mt-3 text-heading-lg font-semibold text-ink">
              {r?.runway_meses != null ? `${String(r.runway_meses).replace('.', ',')} meses` : '—'}
            </p>
            {r?.runway_meses == null && (
              <Text size="sm" tone="mute">Ainda sem histórico: precisa de ao menos um mês fechado de despesas pagas.</Text>
            )}
          </Card>}

          {visiveis.has('top') && <Card variant="flat">
            <Heading level={4}>Maiores despesas do mês</Heading>
            <ul className="mt-3 flex flex-col gap-2">
              {(top.data ?? []).map((d) => (
                <li key={d.category_id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-body">{d.category_name}</span>
                  <span className="tabular-nums font-medium text-ink">{money(d.total_cents)}</span>
                </li>
              ))}
              {top.data?.length === 0 && <Text size="sm" tone="mute">Nenhuma despesa paga neste mês.</Text>}
            </ul>
          </Card>}
        </div>
      </div>

      <Modal open={personalizar} onClose={() => setPersonalizar(false)} title="Personalizar painel">
        <div className="flex flex-col gap-2.5">
          {WIDGETS.map((w) => (
            <label key={w.key} className="flex cursor-pointer items-center gap-2 text-sm text-body">
              <input type="checkbox" className="h-4 w-4 accent-emerald"
                checked={visiveis.has(w.key)} onChange={() => toggleWidget(w.key)} />
              {w.label}
            </label>
          ))}
          <Text size="sm" tone="mute" className="mt-1">A escolha fica salva neste navegador.</Text>
        </div>
      </Modal>
    </>
  )
}

/** Barras mensais receitas × despesas — SVG puro com os tokens --chart-*.
 *  Cor segue a entidade (receitas = chart-1, despesas = chart-2), sempre. */
function EvolucaoChart({ dados }: { dados: Evolucao[] }) {
  if (dados.length === 0) {
    return <Text size="sm" tone="mute" className="mt-6">Sem movimento pago nos últimos 12 meses.</Text>
  }
  const W = 640, H = 200, PAD = { t: 12, r: 8, b: 24, l: 8 }
  const max = Math.max(...dados.map((d) => Math.max(d.receitas_cents, d.despesas_cents)), 1)
  /* passo redondo primeiro; o topo do eixo cai num múltiplo dele */
  const passo = passoRedondo(max)
  const topo = Math.ceil(max / passo) * passo
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const slot = iw / dados.length
  const bw = Math.min(12, slot / 3)

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[480px] w-full" role="img" aria-label="Receitas e despesas por mês">
        {[0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r}
            y1={PAD.t + ih - ih * f} y2={PAD.t + ih - ih * f}
            stroke="rgb(var(--c-hairline))" strokeWidth="1" />
        ))}
        {dados.map((d, i) => {
          const x = PAD.l + i * slot + slot / 2
          const hr = (d.receitas_cents / topo) * ih
          const hd = (d.despesas_cents / topo) * ih
          return (
            <g key={d.mes}>
              <title>{`${monthLabel(d.mes)} — entrou ${money(d.receitas_cents)}, saiu ${money(d.despesas_cents)}`}</title>
              <rect x={x - bw - 1.5} y={PAD.t + ih - hr} width={bw} height={hr} rx={2}
                fill="var(--chart-1)" />
              <rect x={x + 1.5} y={PAD.t + ih - hd} width={bw} height={hd} rx={2}
                fill="var(--chart-2)" />
              <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="rgb(var(--c-mute))">
                {monthLabel(d.mes)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-caption text-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-1)' }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-2)' }} /> Saídas
        </span>
      </div>
    </div>
  )
}

function passoRedondo(max: number): number {
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  for (const m of [1, 2, 2.5, 5, 10]) if (bruto <= m * mag) return m * mag
  return 10 * mag
}
