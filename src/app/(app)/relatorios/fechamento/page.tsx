'use client'
import { useMemo, useState } from 'react'
import { Printer } from '@phosphor-icons/react'
import { Button, Card, Heading, Select, SegmentedControl, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { dateBR, money, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusBadge } from '@/components/app/StatusBadge'
import type { Entry } from '@/lib/types'

type LinhaDre = { mes: string; root_category_id: string; root_category: string; kind: 'receita' | 'despesa'; total_cents: number }

/**
 * Fechamento do mês — o "extrato completo" que se manda pro sócio ou
 * pro contador: DRE do mês por grupo, lucro, e todos os lançamentos.
 * O botão Imprimir gera o PDF pelo navegador (tudo fora do papel some
 * via variante print: do Tailwind).
 */
export default function FechamentoPage() {
  const { supabase, company } = useSession()
  const hoje = todayISO()
  const [mes, setMes] = useState(hoje.slice(0, 7)) // YYYY-MM
  const [regime, setRegime] = useState<'caixa' | 'competencia'>('caixa')

  const inicio = `${mes}-01`
  const fim = useMemo(() => {
    const d = new Date(`${inicio}T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    d.setUTCDate(0)
    return d.toISOString().slice(0, 10)
  }, [inicio])

  const meses = useMemo(() => {
    const out: { value: string; label: string }[] = []
    const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
    const d = new Date(`${hoje.slice(0, 7)}-15T12:00:00Z`)
    for (let i = 0; i < 24; i++) {
      const v = d.toISOString().slice(0, 7)
      out.push({ value: v, label: `${nomes[d.getUTCMonth()]} de ${d.getUTCFullYear()}` })
      d.setUTCMonth(d.getUTCMonth() - 1)
    }
    return out
  }, [hoje])

  const dre = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_dre', {
      p_company: company!.id, p_regime: regime, p_from: inicio, p_to: fim,
    })
    if (error) throw error
    return (data ?? []) as LinhaDre[]
  }, [company?.id, regime, inicio, fim])

  const extrato = useQuery(async () => {
    const col = regime === 'competencia' ? 'competence_date' : 'cash_date'
    let q = supabase!.from('v_entries').select('*')
      .eq('company_id', company!.id)
      .gte(col, inicio).lte(col, fim)
      .order(col)
    if (regime === 'caixa') q = q.eq('status', 'pago')
    const { data, error } = await q.limit(1000)
    if (error) throw error
    return (data ?? []) as Entry[]
  }, [company?.id, regime, inicio, fim])

  const receitas = (dre.data ?? []).filter((l) => l.kind === 'receita').sort((a, b) => b.total_cents - a.total_cents)
  const despesas = (dre.data ?? []).filter((l) => l.kind === 'despesa').sort((a, b) => b.total_cents - a.total_cents)
  const totalReceitas = receitas.reduce((s, l) => s + l.total_cents, 0)
  const totalDespesas = despesas.reduce((s, l) => s + l.total_cents, 0)
  const lucro = totalReceitas - totalDespesas
  const rows = extrato.data ?? []
  const mesLabel = meses.find((m) => m.value === mes)?.label ?? mes

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Fechamento do mês"
          description="O extrato completo do mês, com o lucro no fim — pronto para imprimir ou virar PDF."
          actions={
            <Button variant="shiny" size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
              Imprimir / PDF
            </Button>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select className="!w-56" value={mes}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMes(e.target.value)}>
            {meses.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
          <SegmentedControl
            ariaLabel="Regime"
            options={[
              { value: 'caixa', label: 'Pelo que foi pago' },
              { value: 'competencia', label: 'Pelo mês do serviço' },
            ]}
            value={regime}
            onChange={(v: 'caixa' | 'competencia') => setRegime(v)}
          />
        </div>
      </div>

      {/* ── O documento ─────────────────────────────────────────────── */}
      <Card variant="flat" className="print:border-0 print:!p-0 print:shadow-none">
        <div className="mb-6 border-b border-hairline pb-4">
          <Heading level={2}>{company?.name}</Heading>
          <Text size="sm" tone="mute">
            Fechamento de {mesLabel} · regime de {regime === 'caixa' ? 'caixa (pelo que foi pago)' : 'competência (pelo mês do serviço)'}
          </Text>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <section>
            <Text size="sm" className="mb-2 font-semibold text-ink">Entradas</Text>
            <ul className="flex flex-col divide-y divide-hairline">
              {receitas.map((l) => (
                <li key={l.root_category_id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-body">{l.root_category}</span>
                  <span className="tabular-nums text-ink">{money(l.total_cents)}</span>
                </li>
              ))}
              {receitas.length === 0 && <Text size="sm" tone="mute" className="py-1.5">Nenhuma entrada no mês.</Text>}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-hairline-strong pt-2 text-sm font-semibold">
              <span className="text-ink">Total de entradas</span>
              <span className="tabular-nums text-ink">{money(totalReceitas)}</span>
            </div>
          </section>

          <section>
            <Text size="sm" className="mb-2 font-semibold text-ink">Saídas</Text>
            <ul className="flex flex-col divide-y divide-hairline">
              {despesas.map((l) => (
                <li key={l.root_category_id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-body">{l.root_category}</span>
                  <span className="tabular-nums text-ink">{money(l.total_cents)}</span>
                </li>
              ))}
              {despesas.length === 0 && <Text size="sm" tone="mute" className="py-1.5">Nenhuma saída no mês.</Text>}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-hairline-strong pt-2 text-sm font-semibold">
              <span className="text-ink">Total de saídas</span>
              <span className="tabular-nums text-ink">{money(totalDespesas)}</span>
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-hairline bg-elevated px-5 py-4 print:rounded-none print:border-x-0">
          <span className="text-heading-sm font-semibold text-ink">
            {lucro >= 0 ? 'Lucro do mês' : 'Prejuízo do mês'}
          </span>
          <span className={`tabular-nums text-heading-md font-semibold ${lucro >= 0 ? 'text-success-deep' : 'text-danger'}`}>
            {money(lucro)}
          </span>
          {totalReceitas > 0 && (
            <Text size="sm" tone="mute" className="w-full">
              Margem: {((lucro / totalReceitas) * 100).toFixed(1).replace('.', ',')}% das entradas
              {regime === 'caixa' ? ' · considera só o que de fato entrou e saiu no mês' : ' · considera o mês do serviço, pago ou não'}
            </Text>
          )}
        </div>

        <section className="mt-8">
          <Text size="sm" className="mb-2 font-semibold text-ink">
            Extrato do mês · {rows.length} lançamento{rows.length === 1 ? '' : 's'}
          </Text>
          <Table
            columns={[
              {
                key: 'data', header: 'Data',
                render: (r: Entry) => dateBR(regime === 'competencia' ? r.competence_date : r.cash_date),
              },
              { key: 'description', header: 'Descrição', render: (r: Entry) => r.description || '—' },
              {
                key: 'status', header: 'Situação',
                render: (r: Entry) => <StatusBadge status={r.status_display} />,
              },
              {
                key: 'amount', header: 'Valor', align: 'right', numeric: true,
                render: (r: Entry) => (
                  <span className={`tabular-nums ${r.kind === 'receita' ? 'text-success-deep' : 'text-ink'}`}>
                    {r.kind === 'receita' ? '+' : '−'} {money(r.amount_cents)}
                  </span>
                ),
              },
            ]}
            rows={rows}
            getRowKey={(r: Entry) => r.id}
            empty={extrato.loading ? 'Carregando…' : 'Nenhum lançamento neste mês.'}
          />
        </section>

        <Text size="sm" tone="faint" className="mt-6 hidden print:block">
          Gerado em {dateBR(hoje)} · Finanças Extremas
        </Text>
      </Card>
    </>
  )
}
