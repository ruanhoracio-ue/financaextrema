'use client'
import { useMemo, useState } from 'react'
import { Card, SegmentedControl, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { money, monthLabel, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'

type LinhaDre = { mes: string; root_category_id: string; root_category: string; kind: 'receita' | 'despesa'; total_cents: number }

export default function DrePage() {
  const { supabase, company } = useSession()
  const hoje = todayISO()
  const [regime, setRegime] = useState<'caixa' | 'competencia'>('caixa')
  const ano = hoje.slice(0, 4)

  const q = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_dre', {
      p_company: company!.id, p_regime: regime,
      p_from: `${ano}-01-01`, p_to: `${ano}-12-31`,
    })
    if (error) throw error
    return (data ?? []) as LinhaDre[]
  }, [company?.id, regime])

  const { meses, linhas } = useMemo(() => pivota(q.data ?? []), [q.data])

  const columns = [
    {
      key: 'nome', header: 'Categoria', width: 220,
      render: (r: LinhaPivo) => (
        <span className={r.tipo === 'grupo' ? 'font-semibold text-ink' : r.tipo === 'total' ? 'font-semibold text-ink' : 'text-body'}>
          {r.nome}
        </span>
      ),
    },
    ...meses.map((m) => ({
      key: m, header: monthLabel(m), align: 'right' as const, numeric: true,
      render: (r: LinhaPivo) => {
        if (r.tipo === 'secao') return null
        const v = r.valores[m] ?? 0
        if (v === 0 && r.tipo !== 'total') return <span className="text-faint">—</span>
        return (
          <span className={`tabular-nums ${r.tipo === 'total' ? (v >= 0 ? 'font-semibold text-success-deep' : 'font-semibold text-danger') : ''}`}>
            {money(v)}
          </span>
        )
      },
    })),
  ]

  return (
    <>
      <PageHeader
        title="Resultado (DRE)"
        description={`O que a empresa ganhou e gastou em ${ano}, categoria por categoria.`}
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
      <Text size="sm" tone="mute" className="-mt-3 mb-4 block">
        {regime === 'caixa'
          ? 'Regime de caixa: cada valor aparece no mês em que o dinheiro de fato entrou ou saiu.'
          : 'Regime de competência: cada valor aparece no mês do serviço, mesmo que ainda não tenha sido pago.'}
      </Text>

      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={linhas}
          getRowKey={(r: LinhaPivo) => r.id}
          empty={q.loading ? 'Carregando…' : 'Sem lançamentos neste ano.'}
        />
      </Card>
    </>
  )
}

type LinhaPivo = { id: string; nome: string; tipo: 'grupo' | 'secao' | 'total'; valores: Record<string, number> }

/** Pivô mês × categoria-raiz. Receitas em cima, despesas embaixo, resultado no fim. */
function pivota(dados: LinhaDre[]): { meses: string[]; linhas: LinhaPivo[] } {
  const meses = [...new Set(dados.map((d) => d.mes))].sort()
  const porKind = (k: 'receita' | 'despesa') => {
    const grupos = new Map<string, LinhaPivo>()
    for (const d of dados.filter((x) => x.kind === k)) {
      const g = grupos.get(d.root_category_id) ?? { id: d.root_category_id, nome: d.root_category, tipo: 'grupo' as const, valores: {} }
      g.valores[d.mes] = (g.valores[d.mes] ?? 0) + d.total_cents
      grupos.set(d.root_category_id, g)
    }
    return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  }
  const receitas = porKind('receita')
  const despesas = porKind('despesa')
  const soma = (ls: LinhaPivo[], m: string) => ls.reduce((s, l) => s + (l.valores[m] ?? 0), 0)
  const resultado: LinhaPivo = {
    id: 'resultado', nome: 'Sobrou / faltou', tipo: 'total',
    valores: Object.fromEntries(meses.map((m) => [m, soma(receitas, m) - soma(despesas, m)])),
  }
  const linhas: LinhaPivo[] = []
  if (receitas.length) linhas.push({ id: 'sec-r', nome: 'Entradas', tipo: 'secao', valores: {} }, ...receitas)
  if (despesas.length) linhas.push({ id: 'sec-d', nome: 'Saídas', tipo: 'secao', valores: {} }, ...despesas)
  if (meses.length) linhas.push(resultado)
  return { meses, linhas }
}
