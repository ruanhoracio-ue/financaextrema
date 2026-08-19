# Finanças Extremas — template

Gestão financeira para pequenas empresas de serviço (agências, clínicas,
escritórios). Feito para o dono, não para o contador: lançar uma despesa são
3 campos, os relatórios falam "quanto sobrou", e caixa × competência é um
toggle, não uma aula de contabilidade.

**Stack:** Next.js (App Router, export estático) · TypeScript · Tailwind CSS 4 ·
Supabase (Postgres + Auth + RLS) · Design System Conversão Extrema · deploy
Cloudflare.

> Este repositório é um **template**: cada pessoa conecta o **próprio**
> Supabase e faz o **próprio** deploy. Nenhuma chave vem junto.

## 1. Suba o banco (5 min)

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole o conteúdo de
   [`supabase/migrations/20260819000001_init.sql`](supabase/migrations/20260819000001_init.sql)
   e execute. Isso cria as 9 tabelas, a segurança (RLS), as views e todas as
   funções de cálculo — **todo cálculo financeiro vive no Postgres**, o
   front só exibe.
3. Em **Settings → API**, copie a URL e a `anon key`.

## 2. Rode o app

```bash
cp .env.example .env.local   # cole a URL e a anon key
npm install
npm run dev
```

Abra http://localhost:3000, crie sua conta e o nome da empresa — o plano de
contas de empresa de serviço já vem pronto (e é todo editável em
Configurações → Plano de contas).

Sem `.env.local` o app mostra a tela de setup com esses mesmos passos.

### Banco local (opcional, precisa de Docker)

```bash
npm run db:start   # sobe um Supabase local e aplica a migração
```

O comando imprime URL e chaves locais para colocar no `.env.local`.

## 3. Deploy na Cloudflare

O app exporta estático (`out/`) e conversa direto com o Supabase — o deploy
é só servir arquivos:

```bash
npx wrangler login
npm run deploy
```

As variáveis `NEXT_PUBLIC_*` são embutidas **no build**: rode o deploy na sua
máquina com o seu `.env.local` preenchido.

## Estrutura

```
supabase/migrations/   ⭐ o modelo de dados inteiro (schema, RLS, views, funções)
src/components/ui/     biblioteca do design system (não edite; atualize da fonte)
src/components/app/    componentes do app (formulários, modais)
src/app/(app)/         telas autenticadas (dashboard, lançamentos, relatórios…)
src/lib/               sessão/empresa ativa, formatação BRL, cliente Supabase
```

## Decisões que valem conhecer

- **Centavos em `bigint`**, nunca float. `America/Sao_Paulo` define "hoje".
- **"Vencido" não existe no banco** — é derivado de previsto + vencimento no
  passado (view `v_entries`). Nada de job de meia-noite.
- **RLS em duas camadas**: política por empresa + chaves estrangeiras
  compostas `(company_id, id)` — um lançamento não consegue apontar para a
  categoria de outra empresa nem por bug.
- **Recorrência materializada**: parcelas são lançamentos reais gerados por
  função idempotente; editar "só esta" ou "esta e as próximas" vira trivial.
- **Excluir um lançamento pago** grava snapshot em `audit_log` por trigger —
  a UI confirma, o banco registra, não dá para contornar.
- **Transferência entre contas** não é receita nem despesa: tabela própria,
  afeta só saldos, invisível para DRE e fluxo.

## Lançar por texto (IA opcional)

No painel, escreva como você falaria: *"mercado 230 ontem no nubank"* — o app
preenche o lançamento e você só confirma. Sem configurar nada funciona no
**modo simples** (heurística local). Para ficar esperto de verdade, publique a
Edge Function com a SUA chave de IA — ela fica como secret no seu Supabase e
**nunca chega ao navegador**:

```bash
npx supabase secrets set AI_API_KEY=sk-ant-...
npx supabase functions deploy ai-parse
```

Opcional: `AI_MODEL` troca o modelo (padrão `claude-opus-5`; para baratear,
`claude-haiku-4-5`). O código está em `supabase/functions/ai-parse/`.

## Conciliação bancária (OFX)

Exporte o extrato do banco em **OFX** (todo banco tem) e solte em
**Conciliação**. Cada linha do extrato é classificada: já conciliada,
combina com um lançamento pago (mesmo valor, ±3 dias — um clique vincula) ou
não está no app (um clique cria, com a categoria inferida da descrição).
Reimportar o mesmo extrato é seguro: o identificador único do banco (FITID)
nunca duplica nada.

## Papéis da equipe

| Papel | Pode |
| :--- | :--- |
| **Dono** | Tudo, inclusive equipe e dados da empresa |
| **Administra** | Tudo, menos gerenciar equipe |
| **Lança e consulta** | Lançar, baixar, importar e conciliar — não mexe na estrutura (contas, plano de contas) nem exclui lançamento já pago |

A regra vale no **banco de dados** (RLS), não só nos botões escondidos.

## Importar dados de outro lugar

Quem já controlava numa planilha ou noutro sistema traz tudo em
**Importar dados**: exporte de lá em CSV e solte no app. O mapeamento de
colunas é adivinhado pelo cabeçalho (data, valor, descrição, categoria,
tipo, pago), aceita os dois formatos de número (`1.234,56` e `1,234.56`),
datas `dd/mm/aaaa` ou ISO, valores negativos ou coluna de tipo, e pode criar
as categorias que ainda não existirem. Linhas ilegíveis são ignoradas com
aviso — nunca importadas erradas.

## Fase 2 (o schema já espera por ela)

- Emissão de cobranças e nota fiscal de serviço → exigem contrato com um
  gateway/prefeitura; entram como integrações sem mudar o modelo.
- Sincronização bancária automática (Open Finance) → a conciliação OFX manual
  já usa `external_ref`/`source='bank_sync'`; um agregador só automatiza o
  mesmo caminho.
