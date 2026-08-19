'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field, Heading, Input, Logo, Text } from '@/components/ui'
import { useSession } from '@/lib/session'

/** Destino do link "esqueci minha senha". O Supabase autentica pela URL
 *  do e-mail (detectSessionInUrl); aqui só definimos a senha nova. */
export default function RedefinirSenhaPage() {
  const { supabase, user, loading } = useSession()
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) return setErro(error.message)
    router.replace('/')
  }

  return (
    <main className="ds-app flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card variant="flat" className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="symbol" className="h-9 w-9" />
          <Heading level={3}>Nova senha</Heading>
        </div>
        {!loading && !user ? (
          <Text size="sm" tone="mute" className="text-center">
            Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.
          </Text>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Nova senha">
              <Input type="password" required minLength={6} autoFocus autoComplete="new-password"
                value={senha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)} />
            </Field>
            {erro && <Text size="sm" className="text-danger">{erro}</Text>}
            <Button type="submit" variant="shiny" disabled={busy} className="w-full">
              {busy ? 'Salvando…' : 'Salvar e entrar'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  )
}
