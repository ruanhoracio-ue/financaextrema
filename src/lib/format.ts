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

const brlCompact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** "R$ 45 mil" — para eixos e rótulos de gráfico. */
export function moneyCompact(cents: number): string {
  return `R$ ${brlCompact.format(cents / 100)}`
}

/** Passo "redondo" de eixo: divide o teto em ~4 e arredonda para 1/2/2,5/5×10^n. */
export function niceStep(max: number): number {
  const bruto = max / 4
  const mag = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)))
  for (const m of [1, 2, 2.5, 5, 10]) if (bruto <= m * mag) return m * mag
  return 10 * mag
}
