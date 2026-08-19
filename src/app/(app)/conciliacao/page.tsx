'use client'
import { useMemo, useState } from 'react'
import { CheckCircle, LinkSimple, Plus, UploadSimple } from '@phosphor-icons/react'
import { Badge, Button, Card, Field, Select, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { dateBR, money, addDaysISO } from '@/lib/format'
import { normaliza } from '@/lib/csv'
import { decodeOfx, parseOFX, type OfxTransaction } from '@/lib/ofx'
import { PageHeader } from '@/components/app/PageHeader'

/**
 * Conciliação bancária por extrato OFX (todo banco exporta).
 * Para cada linha do extrato:
 *  · já conciliada (FITID gravado)         → nada a fazer
 *  · combina com um lançamento pago        → "Conciliar" vincula o FITID
 *  · não existe no app                     → "Criar" gera o lançamento pago
 * Reimportar o mesmo extrato é seguro: o FITID é único por conta.
 */

type Candidato = { id: string; description: string | null; amount_cents: number; kind: string; paid_date: string; external_ref: string | null; category_id: string }

export default function ConciliacaoPage() {
  const { supabase, company, accounts, categories, refreshLookups } = useSession()
  const contas = accounts.filter((a) => !a.archived_at)
  const [contaId, setContaId] = useState('')
  const [txns, setTxns] = useState<OfxTransaction[]>([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [feitos, setFeitos] = useState<Map<string, 'conciliado' | 'criado'>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const conta = contaId || contas[0]?.id || ''
  const de = txns.length ? addDaysISO(txns.reduce((m, t) => (t.date < m ? t.date : m), txns[0].date), -3) : ''
  const ate = txns.length ? addDaysISO(txns.reduce((m, t) => (t.date > m ? t.date : m), txns[0].date), 3) : ''

  /* lançamentos pagos da conta na janela do extrato — é contra eles que casamos */
  const candidatos = useQuery(async () => {
    if (!txns.length || !conta) return [] as Candidato[]
    const { data, error } = await supabase!.from('entries')
      .select('id, description, amount_cents, kind, paid_date, external_ref, category_id')
      .eq('company_id', company!.id)
      .eq('bank_account_id', conta)
      .eq('status', 'pago')
      .gte('paid_date', de)
      .lte('paid_date', ate)
      .limit(2000)
    if (error) throw error
    return (data ?? []) as Candidato[]
  }, [company?.id, conta, de, ate, txns.length])

  /* classifica cada linha do extrato */
  const linhas = useMemo(() => {
    const cands = candidatos.data ?? []
    const refs = new Set(cands.map((c) => c.external_ref).filter(Boolean))
    const usados = new Set<string>()
    return txns.map((t) => {
      const feito = feitos.get(t.fitid)
      if (feito) return { t, status: feito === 'criado' ? ('criado' as const) : ('conciliado' as const), match: null }
      if (refs.has(t.fitid)) return { t, status: 'conciliado' as const, match: null }
      const kind = t.amount_cents < 0 ? 'despesa' : 'receita'
      const match = cands.find((c) =>
        !c.external_ref && !usados.has(c.id) && c.kind === kind &&
        c.amount_cents === Math.abs(t.amount_cents) &&
        Math.abs(+new Date(c.paid_date) - +new Date(t.date)) <= 3 * 86400000,
      )
      if (match) {
        usados.add(match.id)
        return { t, status: 'combina' as const, match }
      }
      return { t, status: 'novo' as const, match: null }
    })
  }, [txns, candidatos.data, feitos])

  const combinam = linhas.filter((l) => l.status === 'combina')
  const novos = linhas.filter((l) => l.status === 'novo')

  function fallbackCategory(kind: string, memo: string): string {
    const ativas = categories.filter((c) => c.kind === kind && !c.archived_at)
    /* tenta por palavra do memo; senão "Outras …"; senão a primeira */
    const palavras = new Set(normaliza(memo).split(/[^a-z0-9]+/).filter((w) => w.length > 2))
    let melhor: { id: string; n: number } | null = null
    for (const c of ativas) {
      const n = normaliza(c.name).split(/[^a-z0-9]+/).filter((w) => palavras.has(w)).length
      if (n > (melhor?.n ?? 0)) melhor = { id: c.id, n }
    }
    if (melhor) return melhor.id
    const outras = ativas.find((c) => normaliza(c.name).startsWith('outras'))
    return outras?.id ?? ativas[0]?.id ?? ''
  }

  async function conciliar(l: (typeof linhas)[number]) {
    if (!l.match) return
    setBusy(l.t.fitid)
    const { error } = await supabase!.from('entries')
      .update({ external_ref: l.t.fitid }).eq('id', l.match.id)
    setBusy(null)
    if (error) return setErro(error.message)
    setFeitos((f) => new Map(f).set(l.t.fitid, 'conciliado'))
  }

  async function criar(l: (typeof linhas)[number]) {
    const kind = l.t.amount_cents < 0 ? 'despesa' : 'receita'
    setBusy(l.t.fitid)
    const { error } = await supabase!.from('entries').insert({
      company_id: company!.id,
      kind,
      description: l.t.memo || null,
      amount_cents: Math.abs(l.t.amount_cents),
      competence_date: l.t.date,
      due_date: l.t.date,
      status: 'pago',
      paid_date: l.t.date,
      bank_account_id: conta,
      category_id: fallbackCategory(kind, l.t.memo),
      source: 'bank_sync',
      external_ref: l.t.fitid,
    })
    setBusy(null)
    if (error) return setErro(error.message)
    setFeitos((f) => new Map(f).set(l.t.fitid, 'criado'))
  }

  async function emLote(lista: typeof linhas, fn: (l: (typeof linhas)[number]) => Promise<void>) {
    for (const l of lista) await fn(l)
    await refreshLookups()
    candidatos.reload()
  }

  const columns = [
    { key: 'date', header: 'Data', render: (l: (typeof linhas)[number]) => dateBR(l.t.date) },
    { key: 'memo', header: 'Descrição no banco', render: (l: (typeof linhas)[number]) => l.t.memo || <span className="text-faint">—</span> },
    {
      key: 'valor', header: 'Valor', align: 'right', numeric: true,
      render: (l: (typeof linhas)[number]) => (
        <span className={`tabular-nums font-medium ${l.t.amount_cents >= 0 ? 'text-success-deep' : 'text-ink'}`}>
          {l.t.amount_cents >= 0 ? '+' : '−'} {money(Math.abs(l.t.amount_cents))}
        </span>
      ),
    },
    {
      key: 'status', header: 'Situação',
      render: (l: (typeof linhas)[number]) =>
        l.status === 'conciliado' ? <Badge tone="success">Conciliado</Badge>
        : l.status === 'criado' ? <Badge tone="success">Criado</Badge>
        : l.status === 'combina' ? <Badge tone="info">Combina: {l.match?.description ?? 'lançamento'}</Badge>
        : <Badge tone="warning">Não está no app</Badge>,
    },
    {
      key: 'acao', header: '', align: 'right',
      render: (l: (typeof linhas)[number]) =>
        l.status === 'combina' ? (
          <Button variant="secondary" size="sm" disabled={busy === l.t.fitid}
            icon={<LinkSimple size={14} />} onClick={() => conciliar(l)}>
            Conciliar
          </Button>
        ) : l.status === 'novo' ? (
          <Button variant="secondary" size="sm" disabled={busy === l.t.fitid}
            icon={<Plus size={14} />} onClick={() => criar(l)}>
            Criar
          </Button>
        ) : <CheckCircle size={18} className="inline text-success" />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Conciliação bancária"
        description="Confira o app contra o extrato do banco. Exporte o extrato em OFX e solte aqui."
      />

      <Card variant="flat" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Conta do extrato" className="w-56">
            <Select value={conta} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setContaId(e.target.value); setTxns([]); setFeitos(new Map()) }}>
              {contas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <label className="inline-flex">
            <span className="sr-only">Arquivo OFX</span>
            <input type="file" accept=".ofx,.qfx,application/x-ofx" className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                const parsed = parseOFX(decodeOfx(await f.arrayBuffer()))
                if (parsed.length === 0) return setErro('Não encontrei transações neste arquivo — é um OFX de extrato?')
                setErro(null)
                setNomeArquivo(f.name)
                setFeitos(new Map())
                setTxns(parsed)
                e.target.value = ''
              }} />
            <Button as="span" variant="shiny" size="sm" icon={<UploadSimple size={15} />} className="cursor-pointer">
              {txns.length ? 'Trocar extrato' : 'Escolher extrato OFX'}
            </Button>
          </label>
          {nomeArquivo && <Text size="sm" tone="mute">{nomeArquivo} · {txns.length} transações</Text>}
        </div>
        {erro && <Text size="sm" className="mt-2 text-danger">{erro}</Text>}
      </Card>

      {txns.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {combinam.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => emLote(combinam, conciliar)}>
                {combinam.length === 1 ? 'Conciliar o que combina' : `Conciliar os ${combinam.length} que combinam`}
              </Button>
            )}
            {novos.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => emLote(novos, criar)}>
                {novos.length === 1 ? 'Criar o que falta' : `Criar os ${novos.length} que faltam`}
              </Button>
            )}
            <Text size="sm" tone="mute">
              {linhas.filter((l) => l.status === 'conciliado' || l.status === 'criado').length} de {linhas.length} resolvidas
            </Text>
          </div>
          <Card variant="flat" className="!p-0">
            <Table
              columns={columns}
              rows={linhas}
              getRowKey={(l: (typeof linhas)[number]) => l.t.fitid}
              empty="Extrato vazio."
            />
          </Card>
        </>
      )}
    </>
  )
}
