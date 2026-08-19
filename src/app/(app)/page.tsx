'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SlidersHorizontal } from '@phosphor-icons/react'
import { Button, MetricCard, Card, Heading, Text } from '@/components/ui'
import { Modal } from '@/components/app/Modal'
import { QuickAddBar } from '@/components/app/QuickAddBar'
import { CashProjectionChart, type FluxoPonto } from '@/components/app/charts/CashProjectionChart'
import { MonthlyBarsChart, type MesPonto } from '@/components/app/charts/MonthlyBarsChart'
import { TopExpensesBars, type TopDespesa } from '@/components/app/charts/TopExpensesBars'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, dateBR, firstDayOfMonthISO, money, todayISO } from '@/lib/format'
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

const WIDGETS = [
  { key: 'quick', label: 'Lançar rápido' },
  { key: 'metrics', label: 'Indicadores do topo' },
  { key: 'atrasados', label: 'Alerta de atrasados' },
  { key: 'projecao', label: 'Saldo projetado (90 dias)' },
  { key: 'chart', label: 'Últimos 12 meses' },
  { key: 'runway', label: 'Fôlego de caixa' },
  { key: 'top', label: 'Maiores despesas' },
] as const

export default function DashboardPage() {
  const { supabase, company } = useSession()
  const hoje = todayISO()
  const inicioMes = firstDayOfMonthISO(hoje)

  /* dashboard personalizável: o que aparece é escolha de quem usa */
  const [visiveis, setVisiveis] = useState<Set<string>>(new Set(WIDGETS.map((w) => w.key)))
  const [personalizar, setPersonalizar] = useState(false)
  useEffect(() => {
    if (!company) return
    const salvo = localStorage.getItem(`fe.dash.${company.id}`)
    if (salvo) setVisiveis(new Set(JSON.parse(salvo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const resumo = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_dashboard_summary', { p_company: company!.id })
    if (error) throw error
    return (data?.[0] ?? null) as Resumo | null
  }, [company?.id])

  const projecao = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_cash_flow', {
      p_company: company!.id, p_from: hoje, p_to: addDaysISO(hoje, 90), p_bucket: 'semana',
    })
    if (error) throw error
    return (data ?? []) as FluxoPonto[]
  }, [company?.id])

  const evolucao = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_monthly_evolution', { p_company: company!.id })
    if (error) throw error
    return (data ?? []) as MesPonto[]
  }, [company?.id])

  const top = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_top_expenses', {
      p_company: company!.id, p_from: inicioMes, p_to: hoje, p_limit: 5,
    })
    if (error) throw error
    return (data ?? []) as TopDespesa[]
  }, [company?.id])

  const r = resumo.data
  const proj = projecao.data ?? []
  const primeiroNegativo = proj.find((p) => p.saldo_projetado_cents < 0)

  function reloadAll() {
    resumo.reload(); projecao.reload(); evolucao.reload(); top.reload()
  }

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

      {visiveis.has('quick') && <div className="mb-4"><QuickAddBar onSaved={reloadAll} /></div>}

      {visiveis.has('metrics') && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Saldo em contas" value={money(r?.saldo_atual_cents)} />
          <MetricCard label="Falta receber" value={money(r?.a_receber_cents)} />
          <MetricCard label="Falta pagar" value={money(r?.a_pagar_cents)} />
          <MetricCard label="Sobrou no mês" value={money(r?.resultado_mes_cents)} />
        </div>
      )}

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
        {visiveis.has('projecao') && (
          <Card variant="flat" className="lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Heading level={4}>Para onde vai o caixa</Heading>
                <Text size="sm" tone="mute" className="mt-0.5">Saldo projetado com o que está previsto para os próximos 90 dias.</Text>
              </div>
              {primeiroNegativo && (
                <Link href="/fluxo" className="text-sm text-danger-deep hover:underline">
                  fica negativo na semana de {dateBR(primeiroNegativo.bucket_start)} →
                </Link>
              )}
            </div>
            <CashProjectionChart dados={proj} />
          </Card>
        )}

        {visiveis.has('runway') && (
          <Card variant="flat">
            <Heading level={4}>Fôlego de caixa</Heading>
            <Text size="sm" tone="mute" className="mt-0.5">Por quantos meses o saldo paga as despesas.</Text>
            <p className="mt-3 text-heading-lg font-semibold text-ink">
              {r?.runway_meses != null ? `${String(r.runway_meses).replace('.', ',')} meses` : '—'}
            </p>
            {r?.runway_meses == null ? (
              <Text size="sm" tone="mute">Ainda sem histórico: precisa de ao menos um mês fechado de despesas pagas.</Text>
            ) : (
              <Text size="sm" tone="mute">Média das despesas pagas dos últimos 3 meses fechados.</Text>
            )}
          </Card>
        )}

        {visiveis.has('chart') && (
          <Card variant="flat" className="lg:col-span-2">
            <Heading level={4}>Últimos 12 meses</Heading>
            <Text size="sm" tone="mute" className="mt-0.5">O que entrou e saiu de verdade, mês a mês.</Text>
            <MonthlyBarsChart dados={evolucao.data ?? []} />
          </Card>
        )}

        {visiveis.has('top') && (
          <Card variant="flat">
            <Heading level={4}>Maiores despesas do mês</Heading>
            <TopExpensesBars dados={top.data ?? []} />
          </Card>
        )}
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
