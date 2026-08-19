import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Cliente Supabase do navegador. Retorna null quando o aluno ainda não
 *  configurou o `.env.local` — a UI mostra a tela de setup no lugar de quebrar. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (!client) client = createBrowserClient(url, key)
  return client
}
