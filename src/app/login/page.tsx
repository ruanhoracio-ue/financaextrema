'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Field, Input, Logo, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { SetupScreen } from '@/components/app/SetupScreen'

export default function LoginPage() {
  const { supabase, envOk, user, loading } = useSession()
  const router = useRouter()
  const [modo, setModo] = useState<'entrar' | 'criar' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/')
  }, [loading, user, router])

  if (!envOk) return <SetupScreen />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEnviando(true)
    setErro(null)
    if (modo === 'recuperar') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      setEnviando(false)
      setErro(error ? traduz(error.message) : null)
      if (!error) setAviso('Enviamos um link para o seu e-mail. Abra-o para criar uma nova senha.')
      return
    }
    const { error } =
      modo === 'entrar'
        ? await supabase.auth.signInWithPassword({ email, password: senha })
        : await supabase.auth.signUp({ email, password: senha })
    setEnviando(false)
    if (error) setErro(traduz(error.message))
    else router.replace('/')
  }

  return (
    <main className="ds-app flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card variant="flat" className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo variant="symbol" className="h-9 w-9" />
          <div>
            <Text as="h1" size="lg" className="font-semibold text-ink">
              {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Recuperar acesso'}
            </Text>
            <Text size="sm" tone="mute">O dinheiro da sua empresa, sem contabilês.</Text>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="E-mail">
            <Input type="email" required autoComplete="email" value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          </Field>
          {modo !== 'recuperar' && (
            <Field label="Senha">
              <Input type="password" required minLength={6} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                value={senha} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSenha(e.target.value)} />
            </Field>
          )}
          {erro && <Text size="sm" className="text-danger">{erro}</Text>}
          {aviso && <Text size="sm" className="text-success-deep">{aviso}</Text>}
          <Button type="submit" variant="shiny" disabled={enviando} className="w-full">
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-1.5 text-center text-sm">
          <button className="text-mute transition-colors hover:text-ink"
            onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null); setAviso(null) }}>
            {modo === 'entrar' ? 'Não tem conta? Criar agora' : 'Já tem conta? Entrar'}
          </button>
          {modo === 'entrar' && (
            <button className="text-mute transition-colors hover:text-ink"
              onClick={() => { setModo('recuperar'); setErro(null); setAviso(null) }}>
              Esqueci minha senha
            </button>
          )}
        </div>
      </Card>
    </main>
  )
}

function traduz(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/already registered/i.test(msg)) return 'Este e-mail já tem conta — use "Entrar".'
  if (/at least 6/i.test(msg)) return 'A senha precisa de pelo menos 6 caracteres.'
  return msg
}
