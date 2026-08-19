'use client'
import { Card, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { dateBR, money } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'

type Registro = {
  id: number
  action: string
  entity: string
  entity_id: string | null
  snapshot: { description?: string | null; amount_cents?: number; kind?: string; paid_date?: string } | null
  email: string | null
  created_at: string
}

const ACOES: Record<string, string> = {
  delete_pago: 'Excluiu lançamento pago',
  estorno_baixa: 'Estornou uma baixa',
}

export default function HistoricoPage() {
  const { supabase, company } = useSession()

  const q = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_audit_log', { p_company: company!.id })
    if (error) throw error
    return (data ?? []) as Registro[]
  }, [company?.id])

  const columns = [
    {
      key: 'created_at', header: 'Quando',
      render: (r: Registro) => (
        <span title={r.created_at}>{dateBR(r.created_at)} {r.created_at.slice(11, 16)}</span>
      ),
    },
    { key: 'action', header: 'O que aconteceu', render: (r: Registro) => ACOES[r.action] ?? r.action },
    {
      key: 'detalhe', header: 'Lançamento',
      render: (r: Registro) => (
        <span className="text-mute">
          {r.snapshot?.description || '—'}
          {r.snapshot?.paid_date ? ` · pago em ${dateBR(r.snapshot.paid_date)}` : ''}
        </span>
      ),
    },
    {
      key: 'valor', header: 'Valor', align: 'right', numeric: true,
      render: (r: Registro) =>
        r.snapshot?.amount_cents != null
          ? <span className="tabular-nums">{money(r.snapshot.amount_cents)}</span>
          : <span className="text-faint">—</span>,
    },
    { key: 'email', header: 'Quem', render: (r: Registro) => <span className="text-mute">{r.email ?? '—'}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Registro automático das ações sensíveis — exclusões de pagos e estornos."
      />
      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={q.data ?? []}
          getRowKey={(r: Registro) => String(r.id)}
          empty={q.loading ? 'Carregando…' : 'Nada por aqui — nenhuma exclusão ou estorno até agora.'}
        />
      </Card>
      <Text size="sm" tone="mute" className="mt-3 block">
        Este registro é gravado pelo banco de dados e não pode ser editado nem apagado pelo app.
      </Text>
    </>
  )
}
