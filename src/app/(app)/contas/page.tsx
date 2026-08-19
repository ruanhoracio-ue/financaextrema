'use client'
import { useState } from 'react'
import { Archive, ArrowsLeftRight, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button, Card, DateInput, Field, Heading, Input, Select, Table, Text } from '@/components/ui'
import { useSession, type BankAccount } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'
import { dateBR, money, parseMoney, todayISO } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'
import { Modal } from '@/components/app/Modal'
import { MoneyInput } from '@/components/app/MoneyInput'
import { ConfirmModal } from '@/components/app/ConfirmModal'

type Transfer = { id: string; from_account_id: string; to_account_id: string; amount_cents: number; transfer_date: string }

const TIPOS = [
  { value: 'banco', label: 'Conta bancária' },
  { value: 'dinheiro', label: 'Dinheiro / caixinha' },
  { value: 'outro', label: 'Outro' },
]

export default function ContasPage() {
  const { supabase, company, accounts, refreshLookups } = useSession()
  const ativas = accounts.filter((a) => !a.archived_at)
  const consolidado = ativas.reduce((s, a) => s + (a.balance_cents ?? 0), 0)
  const [nova, setNova] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [editar, setEditar] = useState<BankAccount | null>(null)
  const [arquivar, setArquivar] = useState<BankAccount | null>(null)
  const { supabase: sb, refreshLookups: reloadLookups, canManage } = useSession()

  const transfers = useQuery(async () => {
    const { data, error } = await sb!.from('transfers')
      .select('id, from_account_id, to_account_id, amount_cents, transfer_date')
      .eq('company_id', company!.id)
      .order('transfer_date', { ascending: false })
      .limit(10)
    if (error) throw error
    return (data ?? []) as Transfer[]
  }, [company?.id])
  const accName = new Map(accounts.map((a) => [a.id, a.name]))

  return (
    <>
      <PageHeader
        title="Contas e saldos"
        description="Onde o dinheiro da empresa está agora."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<ArrowsLeftRight size={15} />}
              onClick={() => setTransfer(true)} disabled={ativas.length < 2}>
              Transferir
            </Button>
            {canManage && (
              <Button variant="shiny" size="sm" icon={<Plus size={16} weight="bold" />} onClick={() => setNova(true)}>
                Nova conta
              </Button>
            )}
          </>
        }
      />

      <Card variant="flat" className="mb-4">
        <Text size="sm" tone="mute">Saldo total</Text>
        <p className={`mt-1 text-heading-lg font-semibold tabular-nums ${consolidado >= 0 ? 'text-ink' : 'text-danger'}`}>
          {money(consolidado)}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ativas.map((a) => (
          <Card key={a.id} variant="flat">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Heading level={4}>{a.name}</Heading>
                <Text size="sm" tone="mute">{TIPOS.find((t) => t.value === a.type)?.label ?? a.type}</Text>
              </div>
              {canManage && <span className="flex shrink-0 gap-0.5">
                <button onClick={() => setEditar(a)} aria-label="Editar conta" title="Editar conta"
                  className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
                  <PencilSimple size={14} />
                </button>
                <button onClick={() => setArquivar(a)} aria-label="Arquivar conta" title="Arquivar (some das listas, histórico fica)"
                  className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
                  <Archive size={14} />
                </button>
              </span>}
            </div>
            <p className={`mt-3 tabular-nums text-heading-md font-semibold ${(a.balance_cents ?? 0) >= 0 ? 'text-ink' : 'text-danger'}`}>
              {money(a.balance_cents ?? 0)}
            </p>
          </Card>
        ))}
      </div>

      {(transfers.data?.length ?? 0) > 0 && (
        <Card variant="flat" className="mt-4 !p-0">
          <div className="px-5 pt-4">
            <Heading level={4}>Transferências recentes</Heading>
          </div>
          <Table
            columns={[
              { key: 'transfer_date', header: 'Data', render: (t: Transfer) => dateBR(t.transfer_date) },
              { key: 'de', header: 'Saiu de', render: (t: Transfer) => accName.get(t.from_account_id) ?? '—' },
              { key: 'para', header: 'Entrou em', render: (t: Transfer) => accName.get(t.to_account_id) ?? '—' },
              {
                key: 'amount_cents', header: 'Valor', align: 'right', numeric: true,
                render: (t: Transfer) => <span className="tabular-nums">{money(t.amount_cents)}</span>,
              },
              {
                key: 'acoes', header: '', align: 'right', width: 48,
                render: (t: Transfer) => canManage && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('Excluir esta transferência? Os saldos das duas contas serão recalculados.')) return
                      await sb!.from('transfers').delete().eq('id', t.id)
                      await reloadLookups()
                      transfers.reload()
                    }}
                    aria-label="Excluir transferência"
                    className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-danger"
                  >
                    <Trash size={14} />
                  </button>
                ),
              },
            ]}
            rows={transfers.data ?? []}
            getRowKey={(t: Transfer) => t.id}
          />
        </Card>
      )}

      <NovaContaModal open={nova} onClose={() => setNova(false)} />
      <TransferModal open={transfer} onClose={() => { setTransfer(false); transfers.reload() }} />
      {editar && <EditarContaModal conta={editar} onClose={() => setEditar(null)} />}
      <ConfirmModal
        open={!!arquivar}
        onClose={() => setArquivar(null)}
        title="Arquivar conta?"
        message={`“${arquivar?.name}” some das listas e dos totais, mas o histórico de lançamentos continua. Dá para reverter pelo banco de dados.`}
        confirmLabel="Arquivar"
        onConfirm={async () => {
          await sb!.from('bank_accounts').update({ archived_at: new Date().toISOString() }).eq('id', arquivar!.id)
          await reloadLookups()
          setArquivar(null)
        }}
      />
    </>
  )
}

function EditarContaModal({ conta, onClose }: { conta: BankAccount; onClose: () => void }) {
  const { supabase, refreshLookups } = useSession()
  const [nome, setNome] = useState(conta.name)
  const [tipo, setTipo] = useState(conta.type)
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.from('bank_accounts')
      .update({ name: nome.trim(), type: tipo }).eq('id', conta.id)
    setBusy(false)
    if (error) return setErro(error.message)
    await refreshLookups()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Editar conta">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <Field label="Nome">
          <Input required value={nome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={tipo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        {erro && <Text size="sm" className="text-danger">{erro}</Text>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="shiny" size="sm" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NovaContaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase, company, refreshLookups } = useSession()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('banco')
  const [saldo, setSaldo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const cents = saldo ? parseMoney(saldo) ?? 0 : 0
    const { error } = await supabase!.from('bank_accounts').insert({
      company_id: company!.id, name: nome.trim(), type: tipo, initial_balance_cents: cents,
    })
    setBusy(false)
    if (error) return setErro(error.message)
    await refreshLookups()
    setNome(''); setSaldo(''); setErro(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova conta">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <Field label="Nome">
          <Input required autoFocus value={nome} placeholder="Banco Inter, Nubank PJ…"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
        </Field>
        <Field label="Tipo">
          <Select value={tipo} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Saldo de hoje (opcional)">
          <MoneyInput value={saldo} onChange={setSaldo} />
        </Field>
        {erro && <Text size="sm" className="text-danger">{erro}</Text>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="shiny" size="sm" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Criar conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function TransferModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { supabase, company, accounts, refreshLookups } = useSession()
  const ativas = accounts.filter((a) => !a.archived_at)
  const [de, setDe] = useState('')
  const [para, setPara] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(todayISO())
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const cents = parseMoney(valor)
    if (!cents) return setErro('Informe o valor.')
    const origem = de || ativas[0]?.id
    const destino = para || ativas.find((a) => a.id !== origem)?.id
    if (!origem || !destino || origem === destino) return setErro('Escolha contas diferentes.')
    setBusy(true)
    const { error } = await supabase!.from('transfers').insert({
      company_id: company!.id, from_account_id: origem, to_account_id: destino,
      amount_cents: cents, transfer_date: data,
    })
    setBusy(false)
    if (error) return setErro(error.message)
    await refreshLookups()
    setValor(''); setErro(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Transferir entre contas">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <Field label="Saiu de">
          <Select value={de || ativas[0]?.id || ''} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDe(e.target.value)}>
            {ativas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Entrou em">
          <Select value={para || ativas.find((a) => a.id !== (de || ativas[0]?.id))?.id || ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPara(e.target.value)}>
            {ativas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Valor">
          <MoneyInput value={valor} onChange={setValor} />
        </Field>
        <Field label="Data">
          <DateInput value={data} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setData(e.target.value)} />
        </Field>
        <Text size="sm" tone="mute">Transferência não é receita nem despesa: muda só o saldo de cada conta.</Text>
        {erro && <Text size="sm" className="text-danger">{erro}</Text>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="shiny" size="sm" type="submit" disabled={busy}>{busy ? 'Transferindo…' : 'Transferir'}</Button>
        </div>
      </form>
    </Modal>
  )
}
