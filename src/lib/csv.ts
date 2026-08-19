/** Parser CSV pequeno e tolerante — planilhas brasileiras usam ; e vírgula
 *  decimal, exportadores gringos usam , e ponto. Detectamos os dois. */

export function parseCSV(text: string): string[][] {
  const semBom = text.replace(/^﻿/, '')
  const primeira = semBom.split(/\r?\n/, 1)[0] ?? ''
  const delim = detectaDelimitador(primeira)
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i]
    if (aspas) {
      if (c === '"') {
        if (semBom[i + 1] === '"') { campo += '"'; i++ }
        else aspas = false
      } else campo += c
    } else if (c === '"') aspas = true
    else if (c === delim) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && semBom[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha)
  return linhas
}

function detectaDelimitador(linha: string): string {
  let melhor = ','
  let max = -1
  for (const d of [';', ',', '\t', '|']) {
    const n = contaFora(linha, d)
    if (n > max) { max = n; melhor = d }
  }
  return melhor
}

function contaFora(s: string, ch: string): number {
  let n = 0, aspas = false
  for (const c of s) {
    if (c === '"') aspas = !aspas
    else if (!aspas && c === ch) n++
  }
  return n
}

/** "31/12/2025", "2025-12-31", "31-12-25" → ISO. null se não entender. */
export function parseDateFlex(s: string): string | null {
  const t = s.trim().slice(0, 10)
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`)
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3]
    return valida(`${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`)
  }
  return null
}

function valida(iso: string): string | null {
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) === iso ? iso : null
}

/** "R$ 1.234,56" | "-1234.56" | "(500,00)" → centavos COM sinal. */
export function parseMoneySigned(s: string): number | null {
  let t = s.trim()
  if (!t || t === '-') return null
  let negativo = false
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1) }
  if (t.startsWith('-')) { negativo = true; t = t.slice(1) }
  t = t.replace(/[^\d.,]/g, '')
  if (!t) return null
  const ultimaVirgula = t.lastIndexOf(',')
  const ultimoPonto = t.lastIndexOf('.')
  let normalizado: string
  if (ultimaVirgula > ultimoPonto) normalizado = t.replace(/\./g, '').replace(',', '.')
  else if (ultimoPonto > ultimaVirgula) normalizado = t.replace(/,/g, '')
  else normalizado = t
  const n = Number(normalizado)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negativo ? -cents : cents
}

export function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Chuta a coluna certa pelo nome do cabeçalho. */
export function chutaColuna(headers: string[], padroes: string[]): number {
  const hs = headers.map(normaliza)
  for (const p of padroes) {
    const i = hs.findIndex((h) => h.includes(p))
    if (i >= 0) return i
  }
  return -1
}
