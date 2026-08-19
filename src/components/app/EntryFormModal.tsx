'use client'
import { useEffect, useState } from 'react'
import { CaretDown, CaretUp, Trash } from '@phosphor-icons/react'
import { Button, DateInput, Field, Input, SegmentedControl, Select, Text } from '@/components/ui'
import { Modal } from './Modal'
import { MoneyInput } from './MoneyInput'
import { CategorySelect } from './CategorySelect'
import { ConfirmModal } from './ConfirmModal'
import { useSession } from '@/lib/session'
import { money, parseMoney, todayISO } from '@/lib/format'
import type { Entry } from '@/lib/types'

const FREQUENCIAS = [
  { value: 'nunca', label: 'Não repete' },
  { value: 'semanal', label: 'Toda semana' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'mensal', label: 'Todo mês' },
  { value: 'anual', label: 'Todo ano' },
]

/**
 * Novo lançamento / edição.
 * Regra de ouro: 3 campos obrigatórios (valor, data, categoria).
 * Todo o resto vive em "mais detalhes".
 */
export type EntryInitial = Partial<{
  kind: 'receita' | 'despesa'
  valor: string
  data: string
  categoriaId: string
  descricao: string
  pago: boolean
  contaId: string
}>

export function EntryFormModal({
  open, onClose, onSaved, entry, initial,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  entry?: Entry | null
  /** pré-preenchimento (lançar por texto / conciliação) — só para criação */
  initial?: EntryInitial | null
}) {
  const { supabase, company, accounts, costCenters, refreshLookups, canManage } = useSession()
  const editando = !!entry
  const contasAtivas = accounts.filter((a) => !a.archived_at)

  const [kind, setKind] = useState<'despesa' | 'receita'>('despesa')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(todayISO())
  const [categoria, setCategoria] = useState('')
  const [detalhes, setDetalhes] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [pago, setPago] = useState(true)
  const [vencimento, setVencimento] = useState('')
  const [conta, setConta] = useState('')
  const [centro, setCentro] = useState('')
  const [notas, setNotas] = useState('')
  const [freq, setFreq] = useState('nunca')
  const [parcelas, setParcelas] = useState('')
  const [escopo, setEscopo] = useState<'uma' | 'seguintes'>('uma')
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmaExcluir, setConfirmaExcluir] = useState(false)
  const [confirmaEncerrar, setConfirmaEncerrar] = useState(false)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setEscopo('uma')
    setConfirmaExcluir(false)
    if (entry) {
      setKind(entry.kind)
      setValor((entry.amount_cents / 100).toFixed(2).replace('.', ','))
      setData(entry.competence_date)
      setCategoria(entry.category_id)
      setDescricao(entry.description ?? '')
      setPago(entry.status === 'pago')
      setVencimento(entry.due_date)
      setConta(entry.bank_account_id ?? '')
      setCentro(entry.cost_center_id ?? '')
      setNotas(entry.notes ?? '')
      setFreq('nunca')
      setDetalhes(true)
    } else {
      setKind(initial?.kind ?? 'despesa')
      setValor(initial?.valor ?? '')
      setData(initial?.data ?? todayISO())
      setCategoria(initial?.categoriaId ?? '')
      setDescricao(initial?.descricao ?? '')
      setPago(initial?.pago ?? true)
      setVencimento(''); setConta(initial?.contaId ?? '')
      setCentro(''); setNotas(''); setFreq('nunca'); setParcelas('')
      setDetalhes(!!(initial?.descricao || initial?.contaId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry])

  const recorrente = !editando && freq !== 'nunca'
  const efetivamentePago = pago && !recorrente

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !company) return
    const cents = parseMoney(valor)
    if (!cents) return setErro('Informe um valor maior que zero.')
    if (!categoria) return setErro('Escolha a categoria.')
    const contaFinal = conta || contasAtivas[0]?.id || null
    if (efetivamentePago && !contaFinal) return setErro('Cadastre uma conta antes de marcar como pago.')
    setBusy(true)
    setErro(null)
    try {
      if (recorrente) {
        const { data: rec, error } = await supabase.from('recurrences').insert({
          company_id: company.id, kind, description: descricao || null,
          amount_cents: cents, category_id: categoria,
          cost_center_id: centro || null, bank_account_id: conta || null,
          frequency: freq, start_date: data,
          occurrences: parcelas ? Number(parcelas) : null,
        }).select('id').single()
        if (error) throw error
        const { error: e2 } = await supabase.rpc('fn_generate_recurrence_entries', { p_recurrence: rec.id })
        if (e2) throw e2
      } else if (editando && entry) {
        const patch = {
          kind, description: descricao || null, amount_cents: cents,
          competence_date: data, due_date: vencimento || data,
          category_id: categoria, cost_center_id: centro || null,
          status: pago ? 'pago' : 'previsto',
          paid_date: pago ? (entry.paid_date ?? data) : null,
          bank_account_id: pago ? (contaFinal ?? entry.bank_account_id) : (conta || null),
        }
        const { error } = await supabase.from('entries').update(patch).eq('id', entry.id)
        if (error) throw error
        if (entry.recurrence_id && escopo === 'seguintes') {
          /* atualiza o modelo e regenera as parcelas futuras ainda previstas */
          const { error: e1 } = await supabase.from('recurrences').update({
            description: descricao || null, amount_cents: cents,
            category_id: categoria, cost_center_id: centro || null,
            bank_account_id: conta || null,
          }).eq('id', entry.recurrence_id)
          if (e1) throw e1
          const { error: e2 } = await supabase.from('entries').delete()
            .eq('recurrence_id', entry.recurrence_id)
            .eq('status', 'previsto')
            .gt('competence_date', entry.competence_date)
          if (e2) throw e2
          const { error: e3 } = await supabase.rpc('fn_generate_recurrence_entries', { p_recurrence: entry.recurrence_id })
          if (e3) throw e3
        }
      } else {
        const { error } = await supabase.from('entries').insert({
          company_id: company.id, kind, description: descricao || null,
          amount_cents: cents, competence_date: data,
          due_date: efetivamentePago ? data : (vencimento || data),
          status: efetivamentePago ? 'pago' : 'previsto',
          paid_date: efetivamentePago ? data : null,
          bank_account_id: efetivamentePago ? contaFinal : (conta || null),
          category_id: categoria, cost_center_id: centro || null,
          notes: notas || null,
        })
        if (error) throw error
      }
      await refreshLookups()
      onSaved()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function encerrarRecorrencia() {
    if (!supabase || !entry?.recurrence_id) return
    setBusy(true)
    try {
      /* mata as parcelas futuras ainda previstas e desliga o modelo;
         o que já foi pago fica intacto no histórico */
      const { error: e1 } = await supabase.from('entries').delete()
        .eq('recurrence_id', entry.recurrence_id)
        .eq('status', 'previsto')
        .gte('competence_date', entry.competence_date)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('recurrences')
        .update({ active: false }).eq('id', entry.recurrence_id)
      if (e2) throw e2
      await refreshLookups()
      onSaved()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function excluir() {
    if (!supabase || !entry) return
    setBusy(true)
    const { error } = await supabase.from('entries').delete().eq('id', entry.id)
    setBusy(false)
    if (error) return setErro(error.message)
    await refreshLookups()
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar lançamento' : 'Novo lançamento'}>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="Tipo"
          className="self-start"
          options={[{ value: 'despesa', label: 'Saída' }, { value: 'receita', label: 'Entrada' }]}
          value={kind}
          onChange={(v: 'despesa' | 'receita') => { setKind(v); setCategoria('') }}
        />

        <Field label="Valor">
          <MoneyInput value={valor} onChange={setValor} autoFocus={!editando} />
        </Field>
        <Field label="Data">
          <DateInput value={data} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setData(e.target.value)} required />
        </Field>
        <Field label="Categoria">
          <CategorySelect kind={kind} value={categoria} onChange={setCategoria} required />
        </Field>

        {!recorrente && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)}
              className="h-4 w-4 accent-emerald" />
            {kind === 'despesa' ? 'Já paguei' : 'Já recebi'}
          </label>
        )}

        <button type="button" onClick={() => setDetalhes((v) => !v)}
          className="flex items-center gap-1 self-start text-sm font-medium text-mute transition-colors hover:text-ink">
          {detalhes ? <CaretUp size={14} /> : <CaretDown size={14} />} Mais detalhes
        </button>

        {detalhes && (
          <div className="flex flex-col gap-4 border-l-2 border-hairline pl-4">
            <Field label="Descrição">
              <Input value={descricao} placeholder="Se vazio, usamos a categoria"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescricao(e.target.value)} />
            </Field>
            {!pago && !recorrente && (
              <Field label="Vencimento">
                <DateInput value={vencimento || data} min={undefined}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVencimento(e.target.value)} />
              </Field>
            )}
            <Field label="Conta">
              <Select value={conta} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setConta(e.target.value)}>
                <option value="">{efetivamentePago ? contasAtivas[0]?.name ?? 'Sem conta' : 'Definir na baixa'}</option>
                {contasAtivas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Centro de custo">
              <Select value={centro} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCentro(e.target.value)}>
                <option value="">Nenhum</option>
                {costCenters.filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {!editando && (
              <>
                <Field label="Repetir">
                  <Select value={freq} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFreq(e.target.value)}>
                    {FREQUENCIAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </Field>
                {recorrente && (
                  <Field label="Quantas vezes (vazio = sem fim)">
                    <Input type="number" min={1} value={parcelas} placeholder="12"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParcelas(e.target.value)} />
                  </Field>
                )}
                {recorrente && (
                  <Text size="sm" tone="mute">As parcelas nascem como “previsto” — você dá baixa quando pagar.</Text>
                )}
              </>
            )}
            {!recorrente && (
              <Field label="Observações">
                <Input value={notas} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotas(e.target.value)} />
              </Field>
            )}
          </div>
        )}

        {editando && entry?.recurrence_id && (
          <div className="rounded-lg border border-hairline bg-elevated p-3">
            <Text size="sm" className="mb-2 font-medium text-ink">Este lançamento se repete. Aplicar em:</Text>
            <div className="flex flex-col gap-1.5 text-sm text-body">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="escopo" checked={escopo === 'uma'} onChange={() => setEscopo('uma')} className="accent-emerald" />
                Só neste
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="escopo" checked={escopo === 'seguintes'} onChange={() => setEscopo('seguintes')} className="accent-emerald" />
                Neste e nos próximos
              </label>
            </div>
            <button type="button" onClick={() => setConfirmaEncerrar(true)}
              className="mt-2.5 text-sm text-danger transition-opacity hover:opacity-80">
              Encerrar esta recorrência…
            </button>
          </div>
        )}

        {erro && <Text size="sm" className="text-danger">{erro}</Text>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {editando && (entry?.status !== 'pago' || canManage) ? (
            <button type="button" onClick={() => {
              if (entry?.status === 'pago') setConfirmaExcluir(true)
              else excluir()
            }}
              className="flex items-center gap-1.5 text-sm text-danger transition-opacity hover:opacity-80">
              <Trash size={15} /> Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">Cancelar</Button>
            <Button variant="shiny" size="sm" type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmModal
        open={confirmaEncerrar}
        onClose={() => setConfirmaEncerrar(false)}
        onConfirm={encerrarRecorrencia}
        busy={busy}
        title="Encerrar recorrência?"
        message="As parcelas futuras ainda não pagas (desta em diante) serão removidas e nada mais será gerado. O que já foi pago continua no histórico."
        confirmLabel="Encerrar"
      />

      <ConfirmModal
        open={confirmaExcluir}
        onClose={() => setConfirmaExcluir(false)}
        onConfirm={excluir}
        busy={busy}
        title="Excluir lançamento pago?"
        message={`Este lançamento de ${money(entry?.amount_cents)} já foi pago. A exclusão fica registrada no histórico da empresa.`}
        confirmLabel="Excluir mesmo assim"
      />
    </Modal>
  )
}
