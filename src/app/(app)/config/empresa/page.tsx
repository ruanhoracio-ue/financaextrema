'use client'
import { useState } from 'react'
import { Button, Card, Field, Input, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { PageHeader } from '@/components/app/PageHeader'
import { TeamSection } from '@/components/app/TeamSection'

export default function EmpresaPage() {
  const { supabase, company, companies, setCompanyId, refreshCompanies } = useSession()
  const [nome, setNome] = useState(company?.name ?? '')
  const [msg, setMsg] = useState<string | null>(null)

  async function renomear(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.from('companies').update({ name: nome.trim() }).eq('id', company!.id)
    setMsg(error ? error.message : 'Salvo!')
    if (!error) await refreshCompanies()
  }

  return (
    <>
      <PageHeader title="Empresa" description="Dados da empresa ativa." />
      <div className="flex max-w-lg flex-col gap-4">
        <Card variant="flat">
          <form onSubmit={renomear} className="flex items-end gap-2">
            <Field label="Nome da empresa" className="flex-1">
              <Input required value={nome}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
            </Field>
            <Button variant="shiny" size="sm" type="submit">Salvar</Button>
          </form>
          {msg && <Text size="sm" tone="mute" className="mt-2">{msg}</Text>}
        </Card>

        <TeamSection />

        {companies.length > 1 && (
          <Card variant="flat">
            <Text size="sm" className="mb-2 font-medium text-ink">Trocar de empresa</Text>
            <ul className="flex flex-col divide-y divide-hairline">
              {companies.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setCompanyId(c.id)}
                    className={`w-full py-2 text-left text-sm transition-colors hover:text-ink ${c.id === company?.id ? 'font-semibold text-ink' : 'text-body'}`}
                  >
                    {c.name} {c.id === company?.id && '· ativa'}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}
