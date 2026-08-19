'use client'
import { useState } from 'react'
import { Archive, PencilSimple, Plus } from '@phosphor-icons/react'
import { Button, Card, Field, Heading, Input, SegmentedControl, Select, Text } from '@/components/ui'
import { useSession, type Category } from '@/lib/session'
import { PageHeader } from '@/components/app/PageHeader'
import { Modal } from '@/components/app/Modal'

export default function PlanoDeContasPage() {
  const { categories, refreshLookups, supabase, canManage } = useSession()
  const [kind, setKind] = useState<'despesa' | 'receita'>('despesa')
  const [form, setForm] = useState<{ open: boolean; cat: Category | null; parent: string | null }>({ open: false, cat: null, parent: null })

  const ativas = categories.filter((c) => c.kind === kind && !c.archived_at)
  const raizes = ativas.filter((c) => !c.parent_id)
  const filhasDe = (id: string) => ativas.filter((c) => c.parent_id === id)

  async function arquivar(cat: Category) {
    const { error } = await supabase!.from('categories')
      .update({ archived_at: new Date().toISOString() }).eq('id', cat.id)
    if (!error) await refreshLookups()
  }

  return (
    <>
      <PageHeader
        title="Plano de contas"
        description="As categorias em que os lançamentos se organizam."
        actions={
          <Button variant="shiny" size="sm" icon={<Plus size={16} weight="bold" />}
            onClick={() => setForm({ open: true, cat: null, parent: null })}>
            Nova categoria
          </Button>
        }
      />

      <SegmentedControl
        ariaLabel="Tipo"
        className="mb-4"
        options={[{ value: 'despesa', label: 'Saídas' }, { value: 'receita', label: 'Entradas' }]}
        value={kind}
        onChange={(v: 'despesa' | 'receita') => setKind(v)}
      />

      <div className="flex flex-col gap-3">
        {raizes.map((r) => (
          <Card key={r.id} variant="flat" className="!p-4">
            <div className="flex items-center justify-between gap-2">
              <Heading level={4}>{r.name}</Heading>
              <LinhaAcoes canManage={canManage} onEditar={() => setForm({ open: true, cat: r, parent: null })} onArquivar={() => arquivar(r)}
                onFilha={() => setForm({ open: true, cat: null, parent: r.id })} />
            </div>
            {filhasDe(r.id).length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-hairline border-t border-hairline pt-1">
                {filhasDe(r.id).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 pl-4 text-sm text-body">
                    {f.name}
                    <LinhaAcoes canManage={canManage} onEditar={() => setForm({ open: true, cat: f, parent: f.parent_id })} onArquivar={() => arquivar(f)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
        {raizes.length === 0 && <Text size="sm" tone="mute">Nenhuma categoria — crie a primeira.</Text>}
      </div>

      <CategoriaModal
        key={`${form.cat?.id ?? 'nova'}-${form.parent ?? 'raiz'}-${form.open}`}
        open={form.open}
        cat={form.cat}
        parentInicial={form.parent}
        kind={kind}
        onClose={() => setForm({ open: false, cat: null, parent: null })}
      />
    </>
  )
}

function LinhaAcoes({ canManage, onEditar, onArquivar, onFilha }: { canManage: boolean; onEditar: () => void; onArquivar: () => void; onFilha?: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {onFilha && (
        <button onClick={onFilha} aria-label="Nova subcategoria" title="Nova subcategoria"
          className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
          <Plus size={14} />
        </button>
      )}
      {canManage && (
        <>
          <button onClick={onEditar} aria-label="Renomear" title="Renomear"
            className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
            <PencilSimple size={14} />
          </button>
          <button onClick={onArquivar} aria-label="Arquivar" title="Arquivar (some das listas, histórico fica)"
            className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
            <Archive size={14} />
          </button>
        </>
      )}
    </span>
  )
}

function CategoriaModal({
  open, onClose, cat, parentInicial, kind,
}: {
  open: boolean
  onClose: () => void
  cat: Category | null
  parentInicial: string | null
  kind: 'despesa' | 'receita'
}) {
  const { supabase, company, categories, refreshLookups } = useSession()
  const [nome, setNome] = useState(cat?.name ?? '')
  const [pai, setPai] = useState(cat?.parent_id ?? parentInicial ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const raizes = categories.filter((c) => c.kind === kind && !c.parent_id && !c.archived_at && c.id !== cat?.id)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const payload = { name: nome.trim(), parent_id: pai || null }
    const { error } = cat
      ? await supabase!.from('categories').update(payload).eq('id', cat.id)
      : await supabase!.from('categories').insert({ ...payload, company_id: company!.id, kind })
    setBusy(false)
    if (error) return setErro(error.message)
    await refreshLookups()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={cat ? 'Renomear categoria' : 'Nova categoria'}>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <Field label="Nome">
          <Input required autoFocus value={nome}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
        </Field>
        <Field label="Dentro de (opcional)">
          <Select value={pai} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPai(e.target.value)}>
            <option value="">Nenhum — categoria principal</option>
            {raizes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
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
