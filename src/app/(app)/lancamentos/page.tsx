'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MagnifyingGlass, PencilSimple, Plus, UploadSimple } from '@phosphor-icons/react'
import { Button, Card, DateRangeField, Input, SegmentedControl, Table } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, dateBR, firstDayOfMonthISO, money, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusBadge } from '@/components/app/StatusBadge'
import { EntryFormModal } from '@/components/app/EntryFormModal'
import type { Entry } from '@/lib/types'

export default function LancamentosPage() {
  const { supabase, company, categories, accounts } = useSession()
  const hoje = todayISO()
  /* O intervalo é a fonte da verdade; o preset apenas reflete qual coincide. */
  const [periodo, setPeriodo] = useState({ inicio: firstDayOfMonthISO(hoje), fim: hoje })
  const [tipo, setTipo] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [limite, setLimite] = useState(200)
  const [form, setForm] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null })

  const preset =
    periodo.inicio === firstDayOfMonthISO(hoje) && periodo.fim === hoje ? 'mes'
    : periodo.inicio === addDaysISO(hoje, -90) && periodo.fim === hoje ? '90'
    : !periodo.inicio && !periodo.fim ? 'tudo' : null

  const q = useQuery(async () => {
    let query = supabase!.from('v_entries').select('*')
      .eq('company_id', company!.id)
      .order('competence_date', { ascending: false })
      .limit(limite + 1)
    if (periodo.inicio) query = query.gte('competence_date', periodo.inicio)
    if (periodo.fim) query = query.lte('competence_date', periodo.fim)
    if (tipo !== 'todos') query = query.eq('kind', tipo)
    if (buscaAtiva) query = query.ilike('description', `%${buscaAtiva}%`)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Entry[]
  }, [company?.id, periodo.inicio, periodo.fim, tipo, buscaAtiva, limite])

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const temMais = (q.data?.length ?? 0) > limite
  const rows = (q.data ?? []).slice(0, limite)
  const totalCents = rows.reduce((s, r) => s + (r.kind === 'receita' ? r.amount_cents : -r.amount_cents), 0)

  const columns = [
    {
      key: 'competence_date', header: 'Data', sortable: true,
      render: (r: Entry) => dateBR(r.competence_date),
      sortValue: (r: Entry) => r.competence_date,
      renderFooter: () => 'Resultado do filtro',
    },
    {
      key: 'description', header: 'Descrição', sortable: true,
      render: (r: Entry) => r.description || catName.get(r.category_id) || '—',
      sortValue: (r: Entry) => (r.description || catName.get(r.category_id) || '').toLowerCase(),
    },
    {
      key: 'category', header: 'Categoria',
      render: (r: Entry) => <span className="text-mute">{catName.get(r.category_id) ?? '—'}</span>,
    },
    {
      key: 'account', header: 'Conta',
      render: (r: Entry) => (
        <span className="text-mute">{r.bank_account_id ? accName.get(r.bank_account_id) ?? '—' : '—'}</span>
      ),
    },
    {
      key: 'status', header: 'Situação',
      render: (r: Entry) => <StatusBadge status={r.status_display} />,
    },
    {
      key: 'amount', header: 'Valor', align: 'right', numeric: true, sortable: true,
      render: (r: Entry) => (
        <span className={`tabular-nums font-medium ${r.kind === 'receita' ? 'text-success-deep' : 'text-ink'}`}>
          {r.kind === 'receita' ? '+' : '−'} {money(r.amount_cents)}
        </span>
      ),
      sortValue: (r: Entry) => (r.kind === 'receita' ? r.amount_cents : -r.amount_cents),
      renderFooter: () => (
        <span className={`tabular-nums font-semibold ${totalCents >= 0 ? 'text-success-deep' : 'text-danger'}`}>
          {money(totalCents)}
        </span>
      ),
    },
    {
      key: 'acoes', header: '', align: 'right', width: 48,
      render: (r: Entry) => (
        <button
          onClick={() => setForm({ open: true, entry: r })}
          aria-label="Editar lançamento"
          className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink"
        >
          <PencilSimple size={15} />
        </button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Tudo que entrou e saiu — e o que ainda vai acontecer."
        actions={
          <>
            <Button as={Link} href="/importar" variant="secondary" size="sm" icon={<UploadSimple size={15} />}>
              Importar
            </Button>
            <Button variant="shiny" size="sm" icon={<Plus size={16} weight="bold" />}
              onClick={() => setForm({ open: true, entry: null })}>
              Novo lançamento
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Período"
          options={[
            { value: 'mes', label: 'Este mês' },
            { value: '90', label: '90 dias' },
            { value: 'tudo', label: 'Tudo' },
          ]}
          value={preset}
          onChange={(v: string) => {
            if (v === 'mes') setPeriodo({ inicio: firstDayOfMonthISO(hoje), fim: hoje })
            else if (v === '90') setPeriodo({ inicio: addDaysISO(hoje, -90), fim: hoje })
            else setPeriodo({ inicio: '', fim: '' })
          }}
        />
        <DateRangeField value={periodo} onChange={setPeriodo} />
        <SegmentedControl
          ariaLabel="Tipo"
          options={[
            { value: 'todos', label: 'Tudo' },
            { value: 'receita', label: 'Entradas' },
            { value: 'despesa', label: 'Saídas' },
          ]}
          value={tipo}
          onChange={(v: 'todos' | 'receita' | 'despesa') => setTipo(v)}
        />
        <form
          className="min-w-44 flex-1 sm:max-w-64"
          onSubmit={(e) => { e.preventDefault(); setBuscaAtiva(busca.trim()); setLimite(200) }}
        >
          <Input
            icon={<MagnifyingGlass size={15} />}
            value={busca}
            placeholder="Buscar na descrição…"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setBusca(e.target.value)
              if (e.target.value === '') setBuscaAtiva('')
            }}
          />
        </form>
      </div>

      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r: Entry) => r.id}
          footer={rows.length > 0 ? {} : undefined}
          empty={q.loading ? 'Carregando…' : 'Nenhum lançamento no período. Clique em “Novo lançamento”.'}
        />
      </Card>

      {temMais && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + 200)}>
            Carregar mais
          </Button>
        </div>
      )}

      <EntryFormModal
        open={form.open}
        entry={form.entry}
        onClose={() => setForm({ open: false, entry: null })}
        onSaved={q.reload}
      />
    </>
  )
}
