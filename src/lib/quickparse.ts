/** Modo simples do "lançar por texto" — heurística local, sem IA.
 *  Funciona no template recém-clonado; quando o aluno configura a
 *  Edge Function ai-parse com a chave dele, ela assume e isto vira fallback. */
import { addDaysISO, todayISO } from './format'
import { normaliza } from './csv'
import type { BankAccount, Category } from './session'

export type QuickParsed = {
  kind: 'receita' | 'despesa'
  amount_cents: number | null
  date: string
  description: string | null
  category_id: string | null
  account_id: string | null
  paid: boolean
}

export function quickParse(texto: string, categories: Category[], accounts: BankAccount[]): QuickParsed {
  const hoje = todayISO()
  let resto = ` ${texto.trim()} `

  /* valor: o primeiro número "de dinheiro" (aceita 1.250,50 / 1250.50 / 230) */
  let amount: number | null = null
  const mVal = resto.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)(?=\s|$)/i)
  if (mVal) {
    const bruto = mVal[1]
    const norm = bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto
    const n = Number(norm)
    if (Number.isFinite(n) && n > 0) {
      amount = Math.round(n * 100)
      resto = resto.replace(mVal[0], ' ')
    }
  }

  /* data: palavras relativas ou dd/mm */
  let date = hoje
  const rel: Array<[RegExp, number]> = [
    [/\banteontem\b/i, -2],
    [/\bontem\b/i, -1],
    [/\bhoje\b/i, 0],
    [/\bamanh[ãa]\b/i, 1],
  ]
  for (const [re, d] of rel) {
    if (re.test(resto)) {
      date = addDaysISO(hoje, d)
      resto = resto.replace(re, ' ')
      break
    }
  }
  const mData = resto.match(/\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (mData) {
    const ano = mData[3] ? (mData[3].length === 2 ? `20${mData[3]}` : mData[3]) : hoje.slice(0, 4)
    date = `${ano}-${mData[2].padStart(2, '0')}-${mData[1].padStart(2, '0')}`
    resto = resto.replace(mData[0], ' ')
  }

  /* tipo e situação */
  const kind: QuickParsed['kind'] = /\breceb|entrou|vendi|faturei|caiu\b/i.test(texto) ? 'receita' : 'despesa'
  const paid = !/\bvou\s|\bvence|\ba pagar\b|\ba receber\b|\bprevist/i.test(texto)

  /* conta: nome de conta citado no texto */
  let account_id: string | null = null
  for (const a of accounts.filter((x) => !x.archived_at)) {
    const alvo = normaliza(a.name)
    if (alvo && normaliza(resto).includes(alvo)) {
      account_id = a.id
      break
    }
  }

  /* categoria: maior sobreposição de palavras com o nome */
  let category_id: string | null = null
  let melhor = 0
  const palavras = new Set(normaliza(resto).split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  for (const c of categories.filter((x) => x.kind === kind && !x.archived_at)) {
    const tokens = normaliza(c.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2)
    const acertos = tokens.filter((t) => palavras.has(t)).length
    if (acertos > melhor) {
      melhor = acertos
      category_id = c.id
    }
  }

  const description = resto.replace(/\s+/g, ' ').trim().replace(/^n[oa]\s+/i, '') || null
  return { kind, amount_cents: amount, date, description, category_id, account_id, paid }
}
