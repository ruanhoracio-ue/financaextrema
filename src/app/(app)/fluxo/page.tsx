'use client'
import { useState } from 'react'
import { Card, SegmentedControl, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, dateBR, money, monthLabel, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'

type Linha = {
  bucket_start: string
  realizado_in_cents: number
  realizado_out_cents: number
  projetado_in_cents: number
  projetado_out_cents: number
  saldo_projetado_cents: number
}

export default function FluxoPage() {
  const { supabase, company } = useSession()
  const hoje = todayISO()
  const [bucket, setBucket] = useState<'dia' | 'semana' | 'mes'>('semana')

  const q = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_cash_flow', {
      p_company: company!.id,
      p_from: addDaysISO(hoje, -30),
      p_to: addDaysISO(hoje, 90),
      p_bucket: bucket,
    })
    if (error) throw error
    return (data ?? []) as Linha[]
  }, [company?.id, bucket])

  const rows = q.data ?? []
  const num = (v: number, positivoBom: boolean) =>
    v === 0 ? <span className="text-faint">—</span> : (
      <span className="tabular-nums">{money(v)}</span>
    )

  const columns = [
    {
      key: 'bucket_start', header: bucket === 'mes' ? 'Mês' : bucket === 'semana' ? 'Semana de' : 'Dia',
      render: (r: Linha) => (bucket === 'mes' ? monthLabel(r.bucket_start) : dateBR(r.bucket_start)),
    },
    { key: 'realizado_in_cents', header: 'Entrou', align: 'right', numeric: true, render: (r: Linha) => num(r.realizado_in_cents, true) },
    { key: 'realizado_out_cents', header: 'Saiu', align: 'right', numeric: true, render: (r: Linha) => num(r.realizado_out_cents, false) },
    { key: 'projetado_in_cents', header: 'Vai entrar', align: 'right', numeric: true, render: (r: Linha) => num(r.projetado_in_cents, true) },
    { key: 'projetado_out_cents', header: 'Vai sair', align: 'right', numeric: true, render: (r: Linha) => num(r.projetado_out_cents, false) },
    {
      key: 'saldo_projetado_cents', header: 'Saldo projetado', align: 'right', numeric: true,
      render: (r: Linha) => (
        <span className={`tabular-nums font-semibold ${r.saldo_projetado_cents < 0 ? 'text-danger' : 'text-ink'}`}>
          {money(r.saldo_projetado_cents)}
        </span>
      ),
    },
  ]

  const primeiroNegativo = rows.find((r) => r.saldo_projetado_cents < 0)

  return (
    <>
      <PageHeader
        title="Fluxo de caixa"
        description="Últimos 30 dias realizados + próximos 90 projetados."
        actions={
          <SegmentedControl
            ariaLabel="Granularidade"
            options={[
              { value: 'dia', label: 'Dia' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes', label: 'Mês' },
            ]}
            value={bucket}
            onChange={(v: 'dia' | 'semana' | 'mes') => setBucket(v)}
          />
        }
      />

      {primeiroNegativo && (
        <Card variant="flat" className="mb-4 border-danger/40">
          <Text size="sm" className="text-danger">
            ⚠ Pelo previsto, o caixa fica negativo em {bucket === 'mes' ? monthLabel(primeiroNegativo.bucket_start) : dateBR(primeiroNegativo.bucket_start)} ({money(primeiroNegativo.saldo_projetado_cents)}).
          </Text>
        </Card>
      )}

      <Card variant="flat" className="!p-0">
        <Table
          columns={columns}
          rows={rows}
          getRowKey={(r: Linha) => r.bucket_start}
          empty={q.loading ? 'Carregando…' : 'Sem movimento no período.'}
        />
      </Card>
    </>
  )
}
