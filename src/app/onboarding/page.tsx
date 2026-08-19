'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field, Heading, Input, Logo, Text } from '@/components/ui'
import { useSession } from '@/lib/session'

type Convite = { invite_id: string; company_name: string; role: string }

export default function OnboardingPage() {
  const { supabase, refreshCompanies, setCompanyId } = useSession()
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [convites, setConvites] = useState<Convite[]>([])

  useEffect(() => {
    supabase?.rpc('fn_my_invites').then(({ data }) => setConvites((data as Convite[]) ?? []))
  }, [supabase])

  async function aceitar(c: Convite) {
    if (!supabase) return
    setEnviando(true)
    const { data, error } = await supabase.rpc('accept_invite', { p_invite: c.invite_id })
    if (error) {
      setErro(error.message)
      setEnviando(false)
      return
    }
    await refreshCompanies()
    setCompanyId(data as string)
    router.replace('/')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEnviando(true)
    const { data, error } = await supabase.rpc('create_company', { p_name: nome.trim() })
    if (error) {
      setErro(error.message)
      setEnviando(false)
      return
    }
    await refreshCompanies()
    setCompanyId(data as string)
    router.replace('/')
  }

  return (
    <main className="ds-app flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card variant="flat" className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="symbol" className="h-9 w-9" />
          <Heading level={3}>Qual o nome da sua empresa?</Heading>
          <Text size="sm" tone="mute">
            Criamos junto o plano de contas de empresa de serviço e a conta Caixa — tudo editável depois.
          </Text>
        </div>
        {convites.length > 0 && (
          <div className="mb-5 flex flex-col gap-2">
            {convites.map((c) => (
              <div key={c.invite_id} className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-elevated px-3 py-2.5">
                <div className="min-w-0">
                  <Text size="sm" className="truncate font-medium text-ink">{c.company_name}</Text>
                  <Text size="sm" tone="mute">convidou você para a equipe</Text>
                </div>
                <Button variant="secondary" size="sm" disabled={enviando} onClick={() => aceitar(c)}>
                  Aceitar
                </Button>
              </div>
            ))}
            <Text size="sm" tone="mute" className="text-center">— ou crie a sua —</Text>
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome da empresa">
            <Input required autoFocus value={nome} placeholder="Agência Aurora"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNome(e.target.value)} />
          </Field>
          {erro && <Text size="sm" className="text-danger">{erro}</Text>}
          <Button type="submit" variant="shiny" disabled={enviando || !nome.trim()} className="w-full">
            {enviando ? 'Criando…' : 'Começar'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
