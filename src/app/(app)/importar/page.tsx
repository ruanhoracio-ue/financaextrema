'use client'
import { useMemo, useRef, useState } from 'react'
import { CheckCircle, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import { Button, Card, Field, Heading, Select, Table, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { chutaColuna, normaliza, parseCSV, parseDateFlex, parseMoneySigned } from '@/lib/csv'
import { dateBR, money } from '@/lib/format'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusBadge } from '@/components/app/StatusBadge'

/**
 * Importação de lançamentos por CSV — para quem já controlava o dinheiro
 * numa planilha ou noutro sistema. Só data e valor são obrigatórios;
 * o resto o mapeamento resolve com heurística e padrões.
 */

type LinhaPronta = {
  n: number
  kind: 'receita' | 'despesa'
  description: string | null
  amount_cents: number
  date: string
  pago: boolean
  categoria_nome: string | null
  erro?: string
}

const NENHUMA = -1

export default function ImportarPage() {
  const { supabase, company, categories, accounts, refreshLookups } = useSession()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [linhas, setLinhas] = useState<string[][]>([])
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [colData, setColData] = useState(NENHUMA)
  const [colValor, setColValor] = useState(NENHUMA)
  const [colDesc, setColDesc] = useState(NENHUMA)
  const [colTipo, setColTipo] = useState(NENHUMA)
  const [colCategoria, setColCategoria] = useState(NENHUMA)
  const [colPago, setColPago] = useState(NENHUMA)
  const [tipoModo, setTipoModo] = useState<'auto' | 'sinal' | 'despesa' | 'receita'>('auto')
  const [statusModo, setStatusModo] = useState<'pagos' | 'previstos' | 'coluna'>('pagos')
  const [conta, setConta] = useState('')
  const [criarCategorias, setCriarCategorias] = useState(true)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; ignoradas: number } | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  const contasAtivas = accounts.filter((a) => !a.archived_at)
  const headers = temCabecalho && linhas.length ? linhas[0] : (linhas[0] ?? []).map((_, i) => `Coluna ${i + 1}`)
  const dados = temCabecalho ? linhas.slice(1) : linhas

  function carregar(texto: string, nome: string) {
    const parsed = parseCSV(texto)
    if (parsed.length === 0) return setErroGeral('Arquivo vazio ou ilegível.')
    setErroGeral(null)
    setResultado(null)
    setNomeArquivo(nome)
    setLinhas(parsed)
    const h = parsed[0]
    /* heurística: acha as colunas pelo nome do cabeçalho */
    setColData(chutaColuna(h, ['data', 'date', 'dia', 'vencimento']))
    setColValor(chutaColuna(h, ['valor', 'value', 'amount', 'total', 'r$']))
    setColDesc(chutaColuna(h, ['desc', 'histor', 'memo', 'lançamento', 'lancamento', 'nome', 'title']))
    setColTipo(chutaColuna(h, ['tipo', 'type', 'natureza', 'entrada/sa', 'e/s']))
    setColCategoria(chutaColuna(h, ['categ', 'plano', 'conta contab', 'classif']))
    setColPago(chutaColuna(h, ['pago', 'status', 'situa', 'quitad', 'recebido']))
  }

  /* processa tudo em memória — a prévia e a importação usam o MESMO resultado */
  const prontas = useMemo<LinhaPronta[]>(() => {
    if (colData === NENHUMA || colValor === NENHUMA) return []
    return dados.map((l, i) => {
      const n = i + (temCabecalho ? 2 : 1)
      const date = parseDateFlex(l[colData] ?? '')
      const signed = parseMoneySigned(l[colValor] ?? '')
      if (!date) return erroLinha(n, 'data ilegível')
      if (signed == null || signed === 0) return erroLinha(n, 'valor ilegível ou zero')

      let kind: 'receita' | 'despesa'
      const textoTipo = colTipo !== NENHUMA ? normaliza(l[colTipo] ?? '') : ''
      if (tipoModo === 'despesa') kind = 'despesa'
      else if (tipoModo === 'receita') kind = 'receita'
      else if (tipoModo === 'auto' && textoTipo) {
        if (/receit|entrad|credit|crédit|venda|receb|\+/.test(textoTipo)) kind = 'receita'
        else if (/despes|sa[ií]d|debit|débit|pagament|custo|-/.test(textoTipo)) kind = 'despesa'
        else kind = signed < 0 ? 'despesa' : 'receita'
      } else kind = signed < 0 ? 'despesa' : 'receita'

      let pago: boolean
      if (statusModo === 'pagos') pago = true
      else if (statusModo === 'previstos') pago = false
      else {
        const t = normaliza(colPago !== NENHUMA ? l[colPago] ?? '' : '')
        pago = /pago|paga|quitad|receb|sim|ok|true|1|x|conclu/.test(t)
      }

      return {
        n,
        kind,
        description: colDesc !== NENHUMA ? (l[colDesc] ?? '').trim() || null : null,
        amount_cents: Math.abs(signed),
        date,
        pago,
        categoria_nome: colCategoria !== NENHUMA ? (l[colCategoria] ?? '').trim() || null : null,
      }
    })
  }, [dados, temCabecalho, colData, colValor, colDesc, colTipo, colCategoria, colPago, tipoModo, statusModo])

  const validas = prontas.filter((p) => !p.erro)
  const invalidas = prontas.filter((p) => p.erro)
  const algumPago = validas.some((p) => p.pago)
  const contaFinal = conta || contasAtivas[0]?.id || ''

  async function importar() {
    if (!supabase || !company) return
    setImportando(true)
    setErroGeral(null)
    try {
      /* mapa nome-normalizado → categoria, por tipo */
      const mapa = new Map<string, string>()
      for (const c of categories.filter((c) => !c.archived_at)) mapa.set(`${c.kind}:${normaliza(c.name)}`, c.id)
      const fallback = (kind: string) =>
        mapa.get(`${kind}:${normaliza(kind === 'despesa' ? 'Outras despesas' : 'Outras receitas')}`) ??
        categories.find((c) => c.kind === kind && !c.archived_at)?.id

      /* cria categorias que não existem (opcional) */
      if (criarCategorias) {
        const novas = new Map<string, { kind: string; name: string }>()
        for (const p of validas) {
          if (!p.categoria_nome) continue
          const k = `${p.kind}:${normaliza(p.categoria_nome)}`
          if (!mapa.has(k) && !novas.has(k)) novas.set(k, { kind: p.kind, name: p.categoria_nome })
        }
        if (novas.size > 0) {
          const { data, error } = await supabase.from('categories')
            .insert([...novas.values()].map((c) => ({ company_id: company.id, kind: c.kind, name: c.name })))
            .select('id, kind, name')
          if (error) throw error
          for (const c of data ?? []) mapa.set(`${c.kind}:${normaliza(c.name)}`, c.id)
        }
      }

      const registros = validas.map((p) => ({
        company_id: company.id,
        kind: p.kind,
        description: p.description,
        amount_cents: p.amount_cents,
        competence_date: p.date,
        due_date: p.date,
        status: p.pago ? 'pago' : 'previsto',
        paid_date: p.pago ? p.date : null,
        bank_account_id: p.pago ? contaFinal : null,
        category_id:
          (p.categoria_nome && mapa.get(`${p.kind}:${normaliza(p.categoria_nome)}`)) || fallback(p.kind),
        source: 'import',
      }))

      for (let i = 0; i < registros.length; i += 300) {
        const { error } = await supabase.from('entries').insert(registros.slice(i, i + 300))
        if (error) throw error
      }
      await refreshLookups()
      setResultado({ ok: registros.length, ignoradas: invalidas.length })
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : String(err))
    } finally {
      setImportando(false)
    }
  }

  const opcoesColuna = (
    <>
      <option value={NENHUMA}>— não tem —</option>
      {headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
    </>
  )

  if (resultado) {
    return (
      <>
        <PageHeader title="Importar dados" />
        <Card variant="flat" className="max-w-lg">
          <div className="flex items-start gap-3">
            <CheckCircle size={28} weight="fill" className="shrink-0 text-success" />
            <div>
              <Heading level={4}>{resultado.ok} lançamentos importados</Heading>
              {resultado.ignoradas > 0 && (
                <Text size="sm" tone="mute" className="mt-1">
                  {resultado.ignoradas} linhas foram ignoradas por data ou valor ilegível.
                </Text>
              )}
              <div className="mt-4 flex gap-2">
                <Button as="a" href="/lancamentos" variant="shiny" size="sm">Ver lançamentos</Button>
                <Button variant="ghost" size="sm" onClick={() => { setResultado(null); setLinhas([]); setNomeArquivo('') }}>
                  Importar outro arquivo
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Importar dados"
        description="Traga o histórico da sua planilha ou de outro sistema — exporte de lá em CSV e solte aqui."
      />

      {linhas.length === 0 ? (
        <Card variant="flat" className="max-w-xl">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-hairline-strong px-6 py-12 text-center transition-colors hover:border-emerald">
            <UploadSimple size={28} className="text-mute" />
            <Text size="sm" className="font-medium text-ink">Escolher arquivo CSV</Text>
            <Text size="sm" tone="mute">
              Exportado do Excel, Google Sheets ou de outro sistema financeiro.
              Precisa ter pelo menos uma coluna de data e uma de valor.
            </Text>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                f.text().then((t) => carregar(t, f.name))
              }}
            />
          </label>
          {erroGeral && <Text size="sm" className="mt-3 text-danger">{erroGeral}</Text>}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card variant="flat">
            <div className="mb-4 flex items-center justify-between gap-2">
              <Heading level={4}>1 · Diga o que é cada coluna</Heading>
              <Text size="sm" tone="mute">{nomeArquivo} · {dados.length} linhas</Text>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Data (obrigatório)">
                <Select value={colData} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setColData(Number(e.target.value))}>{opcoesColuna}</Select>
              </Field>
              <Field label="Valor (obrigatório)">
                <Select value={colValor} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setColValor(Number(e.target.value))}>{opcoesColuna}</Select>
              </Field>
              <Field label="Descrição">
                <Select value={colDesc} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setColDesc(Number(e.target.value))}>{opcoesColuna}</Select>
              </Field>
              <Field label="Entrada ou saída?">
                <Select value={tipoModo === 'auto' ? `col:${colTipo}` : tipoModo}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const v = e.target.value
                    if (v.startsWith('col:')) { setTipoModo('auto'); setColTipo(Number(v.slice(4))) }
                    else setTipoModo(v as 'sinal' | 'despesa' | 'receita')
                  }}>
                  <option value={`col:${colTipo === NENHUMA ? NENHUMA : colTipo}`}>
                    {colTipo === NENHUMA ? 'Pelo sinal do valor (− é saída)' : `Pela coluna “${headers[colTipo]}”`}
                  </option>
                  {headers.map((h, i) => i !== colTipo && <option key={i} value={`col:${i}`}>Pela coluna “{h || `Coluna ${i + 1}`}”</option>)}
                  <option value="sinal">Pelo sinal do valor (− é saída)</option>
                  <option value="despesa">É tudo saída (despesas)</option>
                  <option value="receita">É tudo entrada (receitas)</option>
                </Select>
              </Field>
              <Field label="Categoria">
                <Select value={colCategoria} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setColCategoria(Number(e.target.value))}>{opcoesColuna}</Select>
              </Field>
              <Field label="Situação">
                <Select value={statusModo === 'coluna' ? `col:${colPago}` : statusModo}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const v = e.target.value
                    if (v.startsWith('col:')) { setStatusModo('coluna'); setColPago(Number(v.slice(4))) }
                    else setStatusModo(v as 'pagos' | 'previstos')
                  }}>
                  <option value="pagos">Está tudo pago / recebido</option>
                  <option value="previstos">É tudo previsto (ainda vai acontecer)</option>
                  {headers.map((h, i) => <option key={i} value={`col:${i}`}>Pela coluna “{h || `Coluna ${i + 1}`}”</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
                <input type="checkbox" className="h-4 w-4 accent-emerald" checked={temCabecalho}
                  onChange={(e) => setTemCabecalho(e.target.checked)} />
                Primeira linha é cabeçalho
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-body">
                <input type="checkbox" className="h-4 w-4 accent-emerald" checked={criarCategorias}
                  onChange={(e) => setCriarCategorias(e.target.checked)} />
                Criar categorias que ainda não existem
              </label>
              {algumPago && (
                <Field label="Conta dos pagos" className="w-52">
                  <Select value={contaFinal} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setConta(e.target.value)}>
                    {contasAtivas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>
          </Card>

          <Card variant="flat" className="!p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
              <Heading level={4}>2 · Confira a prévia</Heading>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-success-deep">
                  <CheckCircle size={15} /> {validas.length} prontas
                </span>
                {invalidas.length > 0 && (
                  <span className="flex items-center gap-1 text-danger">
                    <WarningCircle size={15} /> {invalidas.length} ignoradas
                  </span>
                )}
              </div>
            </div>
            <Table
              columns={[
                { key: 'n', header: 'Linha', width: 60, render: (r: LinhaPronta) => <span className="text-faint">{r.n}</span> },
                { key: 'date', header: 'Data', render: (r: LinhaPronta) => r.erro ? <span className="text-danger">{r.erro}</span> : dateBR(r.date) },
                { key: 'description', header: 'Descrição', render: (r: LinhaPronta) => r.description ?? <span className="text-faint">—</span> },
                { key: 'categoria_nome', header: 'Categoria', render: (r: LinhaPronta) => <span className="text-mute">{r.categoria_nome ?? 'automática'}</span> },
                { key: 'status', header: 'Situação', render: (r: LinhaPronta) => r.erro ? null : <StatusBadge status={r.pago ? 'pago' : 'previsto'} /> },
                {
                  key: 'valor', header: 'Valor', align: 'right', numeric: true,
                  render: (r: LinhaPronta) => r.erro ? null : (
                    <span className={`tabular-nums ${r.kind === 'receita' ? 'text-success-deep' : 'text-ink'}`}>
                      {r.kind === 'receita' ? '+' : '−'} {money(r.amount_cents)}
                    </span>
                  ),
                },
              ]}
              rows={prontas.slice(0, 8)}
              getRowKey={(r: LinhaPronta) => String(r.n)}
              empty="Escolha as colunas de data e valor acima."
            />
            {prontas.length > 8 && (
              <Text size="sm" tone="mute" className="block px-5 pb-3">…e mais {prontas.length - 8} linhas.</Text>
            )}
          </Card>

          {erroGeral && <Text size="sm" className="text-danger">{erroGeral}</Text>}

          <div className="flex items-center gap-2">
            <Button variant="shiny" disabled={importando || validas.length === 0 || (algumPago && !contaFinal)} onClick={importar}>
              {importando ? 'Importando…' : `Importar ${validas.length} lançamentos`}
            </Button>
            <Button variant="ghost" onClick={() => { setLinhas([]); setNomeArquivo('') }}>Trocar arquivo</Button>
          </div>
        </div>
      )}
    </>
  )
}

function erroLinha(n: number, erro: string): LinhaPronta {
  return { n, erro, kind: 'despesa', description: null, amount_cents: 0, date: '', pago: false, categoria_nome: null }
}
