/** Formatação BRL / datas. Valores SEMPRE em centavos (o banco é a fonte). */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function money(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return brl.format(cents / 100)
}

/** "1.234,56" | "1234" | "R$ 12,00" → centavos (int). null se inválido. */
export function parseMoney(input: string): number | null {
  const limpo = input.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '')
  const normalizado = limpo.replace(',', '.')
  if (!normalizado) return null
  const n = Number(normalizado)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/** Hoje no fuso do negócio (America/Sao_Paulo), em ISO — espelha brt_today() do banco. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function dateBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${y.slice(2)}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function firstDayOfMonthISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}
