'use client'
import { useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import { Button, Card, Input, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { normaliza } from '@/lib/csv'
import { todayISO } from '@/lib/format'
import { quickParse } from '@/lib/quickparse'
import { EntryFormModal, type EntryInitial } from './EntryFormModal'

type AiParsed = {
  kind: 'receita' | 'despesa'
  amount_cents: number
  date: string
  description: string | null
  category_name: string | null
  account_name: string | null
  paid: boolean
}

/** "mercado 230 ontem no nubank" → formulário pronto para confirmar.
 *  Tenta a Edge Function ai-parse (chave do aluno no Supabase dele);
 *  sem ela, cai no modo simples local. Nunca salva direto: o dono confirma. */
export function QuickAddBar({ onSaved }: { onSaved?: () => void }) {
  const { supabase, categories, accounts } = useSession()
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [origem, setOrigem] = useState<'ia' | 'simples' | null>(null)
  const [form, setForm] = useState<{ open: boolean; initial: EntryInitial | null }>({ open: false, initial: null })

  const catsAtivas = categories.filter((c) => !c.archived_at)
  const contasAtivas = accounts.filter((a) => !a.archived_at)

  async function lancar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || !supabase) return
    setBusy(true)
    let initial: EntryInitial | null = null
    let via: 'ia' | 'simples' = 'simples'
    try {
      const invoke = supabase.functions.invoke('ai-parse', {
        body: {
          text: texto,
          today: todayISO(),
          categories: catsAtivas.map((c) => ({ name: c.name, kind: c.kind })),
          accounts: contasAtivas.map((a) => a.name),
        },
      })
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
      const { data, error } = await Promise.race([invoke, timeout])
      if (error || !data || data.error) throw new Error(data?.error ?? error?.message ?? 'falhou')
      const ai = data as AiParsed
      const cat = ai.category_name
        ? catsAtivas.find((c) => c.kind === ai.kind && normaliza(c.name) === normaliza(ai.category_name!))
        : undefined
      const conta = ai.account_name
        ? contasAtivas.find((a) => normaliza(a.name) === normaliza(ai.account_name!))
        : undefined
      initial = {
        kind: ai.kind,
        valor: ai.amount_cents ? (ai.amount_cents / 100).toFixed(2).replace('.', ',') : '',
        data: ai.date,
        categoriaId: cat?.id,
        descricao: ai.description ?? undefined,
        pago: ai.paid,
        contaId: conta?.id,
      }
      via = 'ia'
    } catch {
      const q = quickParse(texto, categories, accounts)
      initial = {
        kind: q.kind,
        valor: q.amount_cents ? (q.amount_cents / 100).toFixed(2).replace('.', ',') : '',
        data: q.date,
        categoriaId: q.category_id ?? undefined,
        descricao: q.description ?? undefined,
        pago: q.paid,
        contaId: q.account_id ?? undefined,
      }
      via = 'simples'
    } finally {
      setBusy(false)
    }
    setOrigem(via)
    setForm({ open: true, initial })
  }

  return (
    <>
      <Card variant="flat" className="!p-4">
        <form onSubmit={lancar} className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Sparkle size={16} className="text-emerald" weight="fill" /> Lançar rápido
          </span>
          <Input
            value={texto}
            placeholder='ex.: "mercado 230 ontem" ou "recebi 1.500 do cliente hoje"'
            className="min-w-52 flex-1"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTexto(e.target.value)}
          />
          <Button variant="shiny" size="sm" type="submit" disabled={busy || !texto.trim()}>
            {busy ? 'Entendendo…' : 'Lançar'}
          </Button>
        </form>
        {origem === 'simples' && (
          <Text size="sm" tone="mute" className="mt-2">
            Modo simples (sem IA). Para ficar esperto, configure a chave: <code className="text-code">supabase secrets set AI_API_KEY=…</code> — ver README.
          </Text>
        )}
      </Card>

      <EntryFormModal
        open={form.open}
        initial={form.initial}
        onClose={() => setForm({ open: false, initial: null })}
        onSaved={() => {
          setTexto('')
          setOrigem(null)
          onSaved?.()
        }}
      />
    </>
  )
}
