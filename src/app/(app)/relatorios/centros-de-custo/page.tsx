'use client'
import { useState } from 'react'
import { Card, DateRangeField, SegmentedControl, Table } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { firstDayOfMonthISO, money, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'

type Linha = { cost_center_id: string; cost_center_name: string; kind: 'receita' | 'despesa'; total_cents: number }
type Pivo = { id: string; nome: string; receitas: number; despesas: number; resultado: number }

export default function CentrosCustoPage() {
  const { supabase, company } = useSession()
  const hoje = todayISO()
  const [regime, setRegime] = useState<'caixa' | 'competencia'>('caixa')
  const [periodo, setPeriodo] = useState({ inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje })

  const q = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_cost_center_statement', {
      p_company: company!.id, p_regime: regime,
      p_from: periodo.inicio, p_to: periodo.fim,
    })
    if (error) throw error
    const linhas = (data ?? []) as Linha[]
    const mapa = new Map<string, Pivo>()
    for (const l of linhas) {
      const p = mapa.get(l.cost_center_id) ?? { id: l.cost_center_id, nome: l.cost_center_name, receitas: 0, despesas: 0, resultado: 0 }
      if (l.kind === 'receita') p.receitas += l.total_cents
      else p.despesas += l.total_cents
      p.resultado = p.receitas - p.despesas
      mapa.set(l.cost_center_id, p)
    }
    return [...mapa.values()].sort((a, b) => b.resultado - a.resultado)
  }, [company?.id, regime, periodo.inicio, periodo.fim])

  const rows = q.data ?? []
  const columns = [
    { key: 'nome', header: 'Centro de custo', render: (r: Pivo) => <span className="font-medium text-ink">{r.nome}</span>, renderFooter: () => 'Total' },
    { key: 'receitas', header: 'Entradas', align: 'right', numeric: true, sortable: true, render: (r: Pivo) => <span className="tabular-nums">{money(r.receitas)}</span>, sortValue: (r: Pivo) => r.receitas, renderFooter: () => <span className="tabular-nums">{money(rows.reduce((s, r) => s + r.receitas, 0))}</span> },
    { key: 'despesas', header: 'Saídas', align: 'right', numeric: true, sortable: true, render: (r: Pivo) => <span className="tabular-nums">{money(r.despesas)}</span>, sortValue: (r: Pivo) => r.despesas, renderFooter: () => <span className="tabular-nums">{money(rows.reduce((s, r) => s + r.despesas, 0))}</span> },
    {
      key: 'resultado', header: 'Resultado', align: 'right', numeric: true, sortable: true,
      render: (r: Pivo) => <span className={`tabular-nums font-semibold ${r.resultado >= 0 ? 'text-success-deep' : 'text-danger'}`}>{money(r.resultado)}</span>,
      sortValue: (r: Pivo) => r.resultado,
      renderFooter: () => {
        const t = rows.reduce((s, r) => s + r.resultado, 0)
        return <span className={`tabular-nums font-semibold ${t >= 0 ? 'text-success-deep' : 'text-danger'}`}>{money(t)}</span>
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Centros de custo"
        description="Quanto cada área ou projeto dá de resultado."
        actions={
          <SegmentedControl
            ariaLabel="Regime"
            options={[
              { value: 'caixa', label: 'Pelo que foi pago' },
              { value: 'competencia', label: 'Pelo mês do serviço' },
            ]}
            value={regime}
            onChange={(v: 'caixa' | 'competencia') => setRegime(v)}
          />
        }
      />
      <div className="mb-4">
        <DateRangeField value={periodo} onChange={setPeriodo} />
      </div>
      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r: Pivo) => r.id}
          footer={rows.length > 0 ? {} : undefined}
          empty={q.loading ? 'Carregando…' : 'Nenhum lançamento com centro de custo no período. Preencha o campo em “mais detalhes” ao lançar.'}
        />
      </Card>
    </>
  )
}
