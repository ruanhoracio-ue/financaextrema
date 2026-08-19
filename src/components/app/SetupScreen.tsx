'use client'
import { Card, Code, Heading, Text } from '@/components/ui'

/** Aparece quando o .env.local ainda não tem as chaves do Supabase —
 *  primeira coisa que o aluno vê ao rodar o template sem configurar. */
export function SetupScreen() {
  return (
    <main className="ds-app flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card variant="flat" className="w-full max-w-lg">
        <Heading level={3}>Falta conectar o seu Supabase</Heading>
        <div className="mt-4 flex flex-col gap-3 text-sm text-body">
          <Text size="sm">1. Crie um projeto gratuito em <Code>supabase.com</Code>.</Text>
          <Text size="sm">2. No <strong>SQL Editor</strong>, cole e rode o conteúdo de <Code>supabase/migrations/20260819000001_init.sql</Code>.</Text>
          <Text size="sm">3. Copie <Code>.env.example</Code> para <Code>.env.local</Code> e preencha <Code>NEXT_PUBLIC_SUPABASE_URL</Code> e <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code> (Settings → API).</Text>
          <Text size="sm">4. Reinicie o <Code>npm run dev</Code>.</Text>
        </div>
      </Card>
    </main>
  )
}
