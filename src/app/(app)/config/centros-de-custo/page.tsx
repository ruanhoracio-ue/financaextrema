'use client'
import { useState } from 'react'
import { Archive, Plus } from '@phosphor-icons/react'
import { Button, Card, Field, Input, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/app/PageHeader'

export default function CentrosConfigPage() {
  const { supabase, company, costCenters, refreshLookups, canManage } = useSession()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const ativos = costCenters.filter((c) => !c.archived_at)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.from('cost_centers').insert({ company_id: company!.id, name: nome.trim() })
    if (error) return setErro(error.message)
    setNome(''); setErro(null)
    await refreshLookups()
  }

  async function arquivar(id: string) {
    await supabase!.from('cost_centers').update({ archived_at: new Date().toISOString() }).eq('id', id)
    await refreshLookups()
  }

  return (
    <>
      <PageHeader
        title="Centros de custo"
        description="Áreas ou projetos para acompanhar resultado separado (opcional)."
      />
      <Card variant="flat" className="max-w-lg">
        <form onSubmit={criar} className="flex items-end gap-2">
          <Field label="Novo centro de custo" className="flex-1">
            <Input required value={nome} placeholder="Projeto Alfa, Filial Centro…"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
          </Field>
          <Button variant="shiny" size="sm" type="submit" icon={<Plus size={15} weight="bold" />}>Criar</Button>
        </form>
        {erro && <Text size="sm" className="mt-2 text-danger">{erro}</Text>}
        <ul className="mt-4 flex flex-col divide-y divide-hairline">
          {ativos.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm text-body">
              {c.name}
              {canManage && (
                <button onClick={() => arquivar(c.id)} aria-label="Arquivar" title="Arquivar"
                  className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink">
                  <Archive size={14} />
                </button>
              )}
            </li>
          ))}
          {ativos.length === 0 && <Text size="sm" tone="mute" className="py-2">Nenhum ainda — e tudo bem: é opcional.</Text>}
        </ul>
      </Card>
    </>
  )
}
