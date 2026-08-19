// ─────────────────────────────────────────────────────────────────────────
// ai-parse — transforma texto livre em lançamento estruturado.
// Roda no Supabase do aluno; a chave de IA vive como SECRET aqui, nunca no
// navegador. Configuração (uma vez):
//   supabase secrets set AI_API_KEY=sk-ant-...
//   supabase functions deploy ai-parse
// Opcional: AI_MODEL para trocar o modelo (padrão: claude-opus-5; para
// baratear, claude-haiku-4-5).
// Sem a chave configurada, retorna 422 e o app cai no modo simples local.
// ─────────────────────────────────────────────────────────────────────────
import Anthropic from 'npm:@anthropic-ai/sdk'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const schema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['receita', 'despesa'] },
    amount_cents: { type: 'integer', description: 'valor em centavos, sempre positivo' },
    date: { type: 'string', description: 'YYYY-MM-DD' },
    description: { type: ['string', 'null'] },
    category_name: { type: ['string', 'null'], description: 'exatamente um dos nomes fornecidos, ou null' },
    account_name: { type: ['string', 'null'], description: 'exatamente um dos nomes fornecidos, ou null' },
    paid: { type: 'boolean' },
  },
  required: ['kind', 'amount_cents', 'date', 'description', 'category_name', 'account_name', 'paid'],
  additionalProperties: false,
} as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const apiKey = Deno.env.get('AI_API_KEY')
  if (!apiKey) {
    return Response.json(
      { error: 'AI_API_KEY não configurada. Rode: supabase secrets set AI_API_KEY=...' },
      { status: 422, headers: cors },
    )
  }

  try {
    const { text, today, categories, accounts } = await req.json()
    if (!text || !today) {
      return Response.json({ error: 'campos text e today são obrigatórios' }, { status: 400, headers: cors })
    }

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: Deno.env.get('AI_MODEL') ?? 'claude-opus-5',
      max_tokens: 1000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema },
      },
      system: [
        'Você transforma uma frase de dono de pequena empresa brasileira em um lançamento financeiro.',
        `Hoje é ${today} (fuso America/Sao_Paulo). "ontem", "anteontem" e dias da semana contam a partir de hoje.`,
        'Valores em reais → centavos (ex.: "230" → 23000, "1.250,50" → 125050).',
        'kind: "recebi/entrou/vendi" → receita; pagamento/compra/gasto → despesa. Na dúvida, despesa.',
        `category_name: escolha EXATAMENTE um destes nomes (respeitando o kind) ou null: ${JSON.stringify(categories ?? [])}`,
        `account_name: escolha EXATAMENTE um destes nomes ou null: ${JSON.stringify(accounts ?? [])}`,
        'paid: false só se o texto indicar que ainda vai acontecer ("vou pagar", "vence dia X"). Caso contrário true.',
        'description: o essencial da frase, sem valor nem data (ex.: "mercado", "aluguel"). null se sobrar nada.',
      ].join('\n'),
      messages: [{ role: 'user', content: text }],
    })

    if (response.stop_reason === 'refusal') {
      return Response.json({ error: 'a IA recusou este texto' }, { status: 422, headers: cors })
    }
    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') {
      return Response.json({ error: 'resposta vazia da IA' }, { status: 502, headers: cors })
    }
    return Response.json(JSON.parse(block.text), { headers: cors })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 502, headers: cors })
  }
})
