'use client'
import { useState } from 'react'
import { Trash, UserPlus } from '@phosphor-icons/react'
import { Badge, Button, Card, Field, Input, Select, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { useQuery } from '@/lib/useQuery'

type Membro = { user_id: string; email: string; role: string; member_since: string }
type Convite = { id: string; email: string; role: string; accepted_at: string | null }

const PAPEIS: Record<string, string> = { owner: 'Dono', admin: 'Administra', operador: 'Lança e consulta' }

export function TeamSection() {
  const { supabase, company, user } = useSession()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('operador')
  const [erro, setErro] = useState<string | null>(null)

  const membros = useQuery(async () => {
    const { data, error } = await supabase!.rpc('fn_company_members', { p_company: company!.id })
    if (error) throw error
    return (data ?? []) as Membro[]
  }, [company?.id])

  const convites = useQuery(async () => {
    const { data, error } = await supabase!.from('invites')
      .select('id, email, role, accepted_at')
      .eq('company_id', company!.id)
      .is('accepted_at', null)
      .order('created_at')
    if (error) throw error
    return (data ?? []) as Convite[]
  }, [company?.id])

  const souOwner = membros.data?.some((m) => m.user_id === user?.id && m.role === 'owner') ?? false

  async function convidar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const { error } = await supabase!.from('invites').insert({
      company_id: company!.id, email: email.trim().toLowerCase(), role: papel,
    })
    if (error) return setErro(/duplicate/i.test(error.message) ? 'Já existe um convite para este e-mail.' : error.message)
    setEmail('')
    convites.reload()
  }

  async function cancelarConvite(id: string) {
    await supabase!.from('invites').delete().eq('id', id)
    convites.reload()
  }

  async function remover(m: Membro) {
    if (!window.confirm(`Remover ${m.email} da empresa?`)) return
    await supabase!.from('company_members').delete()
      .eq('company_id', company!.id).eq('user_id', m.user_id)
    membros.reload()
  }

  return (
    <Card variant="flat">
      <Text size="sm" className="mb-3 font-medium text-ink">Equipe</Text>

      <ul className="flex flex-col divide-y divide-hairline">
        {(membros.data ?? []).map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Text size="sm" className="truncate text-body">{m.email}{m.user_id === user?.id && ' (você)'}</Text>
              <Badge tone={m.role === 'owner' ? 'emerald' : 'neutral'}>{PAPEIS[m.role] ?? m.role}</Badge>
            </div>
            {souOwner && m.user_id !== user?.id && (
              <button onClick={() => remover(m)} aria-label="Remover da equipe" title="Remover da equipe"
                className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-danger">
                <Trash size={14} />
              </button>
            )}
          </li>
        ))}
        {(convites.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Text size="sm" className="truncate text-mute">{c.email}</Text>
              <Badge tone="warning">Convite pendente</Badge>
            </div>
            {souOwner && (
              <button onClick={() => cancelarConvite(c.id)} aria-label="Cancelar convite" title="Cancelar convite"
                className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-danger">
                <Trash size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {souOwner && (
        <form onSubmit={convidar} className="mt-4 flex flex-wrap items-end gap-2 border-t border-hairline pt-4">
          <Field label="Convidar por e-mail" className="min-w-48 flex-1">
            <Input type="email" required value={email} placeholder="socio@empresa.com.br"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          </Field>
          <Field label="Papel" className="w-44">
            <Select value={papel} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPapel(e.target.value)}>
              <option value="operador">Lança e consulta</option>
              <option value="admin">Administra</option>
            </Select>
          </Field>
          <Button variant="shiny" size="sm" type="submit" icon={<UserPlus size={15} />}>Convidar</Button>
          {erro && <Text size="sm" className="w-full text-danger">{erro}</Text>}
        </form>
      )}
      <Text size="sm" tone="mute" className="mt-3">
        A pessoa cria a conta com esse e-mail e o convite aparece para ela aceitar.
      </Text>
    </Card>
  )
}
