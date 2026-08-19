'use client'
import { useMemo, useState } from 'react'
import { Button, Card, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { dateBR, money } from '@/lib/format'
import { PageHeader } from './PageHeader'
import { StatusBadge } from './StatusBadge'
import { SettleModal } from './SettleModal'
import { EntryFormModal } from './EntryFormModal'
import type { Entry } from '@/lib/types'

/** Contas a pagar e a receber: mesma tela, kind diferente.
 *  Seleção por checkbox → baixa em lote via fn_settle_entries. */
export function OpenEntriesView({ kind }: { kind: 'despesa' | 'receita' }) {
  const { supabase, company, categories, refreshLookups } = useSession()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [baixa, setBaixa] = useState(false)
  const [form, setForm] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null })

  const q = useQuery(async () => {
    const { data, error } = await supabase!.from('v_entries').select('*')
      .eq('company_id', company!.id)
      .eq('kind', kind)
      .eq('status', 'previsto')
      .order('due_date')
      .limit(500)
    if (error) throw error
    return (data ?? []) as Entry[]
  }, [company?.id, kind])

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const rows = q.data ?? []
  const todosMarcados = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const selecionados = rows.filter((r) => sel.has(r.id))
  const totalSel = selecionados.reduce((s, r) => s + r.amount_cents, 0)
  const totalAberto = rows.reduce((s, r) => s + r.amount_cents, 0)

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const columns = [
    {
      key: 'sel', width: 40,
      header: (
        <input type="checkbox" aria-label="Selecionar tudo" className="h-4 w-4 accent-emerald"
          checked={todosMarcados}
          onChange={() => setSel(todosMarcados ? new Set() : new Set(rows.map((r) => r.id)))} />
      ),
      render: (r: Entry) => (
        <input type="checkbox" aria-label="Selecionar" className="h-4 w-4 accent-emerald"
          checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
      ),
    },
    {
      key: 'due_date', header: 'Vencimento', sortable: true,
      render: (r: Entry) => dateBR(r.due_date),
      sortValue: (r: Entry) => r.due_date,
      renderFooter: () => 'Total em aberto',
    },
    {
      key: 'description', header: 'Descrição',
      render: (r: Entry) => (
        <button className="text-left hover:underline" onClick={() => setForm({ open: true, entry: r })}>
          {r.description || catName.get(r.category_id) || '—'}
        </button>
      ),
    },
    {
      key: 'category', header: 'Categoria',
      render: (r: Entry) => <span className="text-mute">{catName.get(r.category_id) ?? '—'}</span>,
    },
    {
      key: 'status', header: 'Situação',
      render: (r: Entry) => <StatusBadge status={r.status_display} />,
    },
    {
      key: 'amount', header: 'Valor', align: 'right', numeric: true, sortable: true,
      render: (r: Entry) => <span className="tabular-nums font-medium text-ink">{money(r.amount_cents)}</span>,
      sortValue: (r: Entry) => r.amount_cents,
      renderFooter: () => <span className="tabular-nums font-semibold">{money(totalAberto)}</span>,
    },
  ]

  const ehDespesa = kind === 'despesa'
  return (
    <>
      <PageHeader
        title={ehDespesa ? 'Contas a pagar' : 'Contas a receber'}
        description={ehDespesa ? 'O que ainda vai sair do caixa.' : 'O que ainda vai entrar.'}
        actions={
          sel.size > 0 && (
            <div className="flex items-center gap-3">
              <Text size="sm" tone="mute">{sel.size} selecionado{sel.size > 1 ? 's' : ''} · {money(totalSel)}</Text>
              <Button variant="shiny" size="sm" onClick={() => setBaixa(true)}>
                {ehDespesa ? 'Marcar como pago' : 'Marcar como recebido'}
              </Button>
            </div>
          )
        }
      />

      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r: Entry) => r.id}
          defaultSort={{ key: 'due_date', dir: 'asc' }}
          footer={rows.length > 0 ? {} : undefined}
          empty={q.loading ? 'Carregando…' : ehDespesa ? 'Nada a pagar. 🎉' : 'Nada a receber por enquanto.'}
        />
      </Card>

      <SettleModal
        open={baixa}
        onClose={() => setBaixa(false)}
        count={sel.size}
        onConfirm={async (paidDate, accountId) => {
          const { error } = await supabase!.rpc('fn_settle_entries', {
            p_ids: [...sel], p_paid_date: paidDate, p_bank_account_id: accountId,
          })
          if (error) throw error
          setSel(new Set())
          await refreshLookups()
          q.reload()
        }}
      />

      <EntryFormModal
        open={form.open}
        entry={form.entry}
        onClose={() => setForm({ open: false, entry: null })}
        onSaved={() => { setSel(new Set()); q.reload() }}
      />
    </>
  )
}
