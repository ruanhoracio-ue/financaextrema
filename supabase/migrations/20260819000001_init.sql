-- ═══════════════════════════════════════════════════════════════════════════
-- FINANÇAS EXTREMAS — Migração inicial
-- Multi-empresa: toda tabela de domínio tem company_id + RLS ativo.
-- Todo valor monetário em CENTAVOS (bigint). Datas de negócio em `date`
-- (dia-calendário, sem fuso); "hoje" é sempre resolvido em America/Sao_Paulo
-- via brt_today(). Nenhum cálculo financeiro fora deste arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Tipos e helpers
-- ───────────────────────────────────────────────────────────────────────────

create type entry_kind as enum ('receita', 'despesa');

-- 'vencido' NÃO é armazenado: é derivado (previsto + due_date < hoje) na
-- view v_entries. Armazenar exigiria um job diário e criaria estado obsoleto.
create type entry_status as enum ('previsto', 'pago');

create type account_type as enum ('banco', 'dinheiro', 'outro');

create type recurrence_frequency as enum ('semanal', 'quinzenal', 'mensal', 'anual');

-- "Hoje" no fuso do negócio. Única fonte de verdade para comparações de data.
create or replace function brt_today()
returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Empresas e membros
-- ───────────────────────────────────────────────────────────────────────────

create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'admin', 'operador')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index idx_members_user on company_members (user_id);

-- SECURITY DEFINER para não recursar na RLS de company_members.
create or replace function is_company_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = p_company and user_id = auth.uid()
  )
$$;

create or replace function is_company_owner(p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = p_company and user_id = auth.uid() and role = 'owner'
  )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Contas bancárias e caixa
-- ───────────────────────────────────────────────────────────────────────────

create table bank_accounts (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  name                  text not null check (length(trim(name)) > 0),
  type                  account_type not null default 'banco',
  -- Saldo declarado no cadastro; o saldo real é sempre calculado em cima dele.
  initial_balance_cents bigint not null default 0,
  initial_balance_date  date not null default brt_today(),
  archived_at           timestamptz,
  -- Preparado para integração bancária (fase 2). Não usado no MVP.
  provider              text,
  external_id           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Permite FK composta (company_id, id) — blindagem multi-tenant, ver §5.
  unique (company_id, id)
);

create index idx_accounts_company on bank_accounts (company_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Plano de contas (categorias em árvore) e centros de custo
-- ───────────────────────────────────────────────────────────────────────────

create table categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  parent_id   uuid,
  kind        entry_kind not null,
  name        text not null check (length(trim(name)) > 0),
  position    int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id),
  -- Pai precisa ser da MESMA empresa (FK composta). Deleção de categoria em
  -- uso é bloqueada (default no action); o caminho normal é arquivar.
  foreign key (company_id, parent_id) references categories (company_id, id)
);

create index idx_categories_company on categories (company_id);
create index idx_categories_parent on categories (parent_id);

-- Pai e filho precisam ser do mesmo kind (receita/despesa).
create or replace function check_category_parent_kind()
returns trigger
language plpgsql
as $$
declare v_parent_kind entry_kind;
begin
  if new.parent_id is not null then
    select kind into v_parent_kind from categories where id = new.parent_id;
    if v_parent_kind is distinct from new.kind then
      raise exception 'categoria pai é de %, filha não pode ser de %', v_parent_kind, new.kind;
    end if;
  end if;
  return new;
end $$;

create trigger trg_categories_parent_kind
  before insert or update of parent_id, kind on categories
  for each row execute function check_category_parent_kind();

create table cost_centers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, id)
);

create index idx_cost_centers_company on cost_centers (company_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Recorrências (modelo/template das parcelas)
-- ───────────────────────────────────────────────────────────────────────────
-- A recorrência guarda o TEMPLATE; as parcelas são materializadas como linhas
-- reais em `entries` (status previsto) por fn_generate_recurrence_entries.
-- Materializar (e não calcular on-the-fly) é o que permite editar/baixar uma
-- parcela individual sem caso especial.

create table recurrences (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  kind            entry_kind not null,
  description     text,
  amount_cents    bigint not null check (amount_cents > 0),
  category_id     uuid not null,
  cost_center_id  uuid,
  bank_account_id uuid,
  frequency       recurrence_frequency not null,
  start_date      date not null,
  end_date        date,          -- null = sem fim (gera até o horizonte rolante)
  occurrences     int check (occurrences is null or occurrences > 0), -- nº de parcelas
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, category_id)     references categories    (company_id, id),
  foreign key (company_id, cost_center_id)  references cost_centers  (company_id, id),
  foreign key (company_id, bank_account_id) references bank_accounts (company_id, id),
  check (end_date is null or end_date >= start_date)
);

create index idx_recurrences_company on recurrences (company_id) where active;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Lançamentos
-- ───────────────────────────────────────────────────────────────────────────
-- Obrigatórios de verdade: valor, competence_date, categoria (a UI espelha).
-- due_date default = competence_date é responsabilidade do app.
-- description é opcional: a UI mostra o nome da categoria no lugar.
--
-- Blindagem multi-tenant: além da RLS, TODA referência a outra tabela de
-- domínio é FK composta (company_id, ref_id) — é impossível apontar um
-- lançamento para categoria/conta/centro de custo de outra empresa, mesmo
-- que a aplicação erre.

create table entries (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  kind            entry_kind not null,
  description     text,
  amount_cents    bigint not null check (amount_cents > 0),
  competence_date date not null,             -- regime de competência
  due_date        date not null,             -- vencimento (caixa previsto)
  status          entry_status not null default 'previsto',
  paid_date       date,                      -- caixa efetivo (só quando pago)
  bank_account_id uuid,
  category_id     uuid not null,
  cost_center_id  uuid,
  recurrence_id   uuid,
  notes           text,
  source          text not null default 'manual', -- preparado p/ 'import' | 'bank_sync' (fase 2)
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (company_id, category_id)     references categories    (company_id, id),
  foreign key (company_id, cost_center_id)  references cost_centers  (company_id, id),
  foreign key (company_id, bank_account_id) references bank_accounts (company_id, id),
  foreign key (company_id, recurrence_id)   references recurrences   (company_id, id) on delete set null,
  -- pago ⇔ tem data de pagamento; pago ⇒ tem conta.
  check ((status = 'pago') = (paid_date is not null)),
  check (status <> 'pago' or bank_account_id is not null)
);

create index idx_entries_company_due      on entries (company_id, due_date) where status = 'previsto';
create index idx_entries_company_paid     on entries (company_id, paid_date) where status = 'pago';
create index idx_entries_company_comp     on entries (company_id, competence_date);
create index idx_entries_company_category on entries (company_id, category_id);
create index idx_entries_company_cc       on entries (company_id, cost_center_id) where cost_center_id is not null;
create index idx_entries_recurrence       on entries (recurrence_id, competence_date) where recurrence_id is not null;
create index idx_entries_account          on entries (bank_account_id) where bank_account_id is not null;

-- Categoria do lançamento precisa ser do mesmo kind (vale p/ entries e recurrences).
create or replace function check_entry_category_kind()
returns trigger
language plpgsql
as $$
declare v_kind entry_kind;
begin
  select kind into v_kind from categories where id = new.category_id;
  if v_kind is distinct from new.kind then
    raise exception 'categoria é de %, lançamento é de %', v_kind, new.kind;
  end if;
  return new;
end $$;

create trigger trg_entries_category_kind
  before insert or update of category_id, kind on entries
  for each row execute function check_entry_category_kind();

create trigger trg_recurrences_category_kind
  before insert or update of category_id, kind on recurrences
  for each row execute function check_entry_category_kind();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Transferências entre contas
-- ───────────────────────────────────────────────────────────────────────────
-- Sem esta tabela, mover dinheiro entre contas viraria um par
-- receita/despesa fantasma que polui DRE e fluxo. Transferência afeta o
-- saldo POR CONTA e nunca aparece em DRE, categorias ou fluxo consolidado.

create table transfers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id   uuid not null,
  amount_cents    bigint not null check (amount_cents > 0),
  transfer_date   date not null default brt_today(),
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (company_id, from_account_id) references bank_accounts (company_id, id),
  foreign key (company_id, to_account_id)   references bank_accounts (company_id, id),
  check (from_account_id <> to_account_id)
);

create index idx_transfers_company on transfers (company_id, transfer_date);
create index idx_transfers_from on transfers (from_account_id);
create index idx_transfers_to on transfers (to_account_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Log de auditoria
-- ───────────────────────────────────────────────────────────────────────────
-- Escrito SOMENTE por triggers (security definer). Nenhuma policy de
-- insert/update/delete para usuários — com RLS ativa, sem policy = sem acesso.

create table audit_log (
  id         bigint generated always as identity primary key,
  company_id uuid not null,
  user_id    uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  snapshot   jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_company on audit_log (company_id, created_at desc);

-- Excluir lançamento pago registra o snapshot completo. A confirmação de
-- exclusão é da UI; o registro é do banco — não dá para contornar.
create or replace function log_entry_delete()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'pago' then
    insert into audit_log (company_id, user_id, action, entity, entity_id, snapshot)
    values (old.company_id, auth.uid(), 'delete_pago', 'entries', old.id, to_jsonb(old));
  end if;
  return old;
end $$;

create trigger trg_entries_audit_delete
  before delete on entries
  for each row execute function log_entry_delete();

-- Estorno (pago → previsto) também fica registrado.
create or replace function log_entry_unsettle()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'pago' and new.status = 'previsto' then
    insert into audit_log (company_id, user_id, action, entity, entity_id, snapshot)
    values (old.company_id, auth.uid(), 'estorno_baixa', 'entries', old.id, to_jsonb(old));
  end if;
  return new;
end $$;

create trigger trg_entries_audit_unsettle
  before update of status on entries
  for each row execute function log_entry_unsettle();

-- ───────────────────────────────────────────────────────────────────────────
-- 8. updated_at em todas as tabelas mutáveis
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['companies','bank_accounts','categories','cost_centers','recurrences','entries']
  loop
    execute format(
      'create trigger trg_%I_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. RLS
-- ───────────────────────────────────────────────────────────────────────────

alter table companies       enable row level security;
alter table company_members enable row level security;
alter table bank_accounts   enable row level security;
alter table categories      enable row level security;
alter table cost_centers    enable row level security;
alter table recurrences     enable row level security;
alter table entries         enable row level security;
alter table transfers       enable row level security;
alter table audit_log       enable row level security;

-- Tabelas de domínio: política uniforme "é membro da empresa" para tudo.
-- Um DO-loop garante que nenhuma tabela ganhe uma política diferente por
-- descuido; papéis mais finos (operador não exclui, etc.) entram depois
-- num só lugar.
do $$
declare t text;
begin
  foreach t in array array['bank_accounts','categories','cost_centers','recurrences','entries','transfers']
  loop
    execute format('create policy "%1$s_select" on %1$I for select using (is_company_member(company_id))', t);
    execute format('create policy "%1$s_insert" on %1$I for insert with check (is_company_member(company_id))', t);
    execute format('create policy "%1$s_update" on %1$I for update using (is_company_member(company_id)) with check (is_company_member(company_id))', t);
    execute format('create policy "%1$s_delete" on %1$I for delete using (is_company_member(company_id))', t);
  end loop;
end $$;

-- companies: leitura por membro; alteração/exclusão só pelo owner.
-- Criação NÃO tem policy: passa pela rpc create_company (security definer),
-- que resolve o ovo-e-galinha (não dá para ser membro de algo que não existe).
create policy "companies_select" on companies for select using (is_company_member(id));
create policy "companies_update" on companies for update using (is_company_owner(id)) with check (is_company_owner(id));
create policy "companies_delete" on companies for delete using (is_company_owner(id));

-- company_members: cada um vê os membros das empresas em que está; só owner gerencia.
create policy "members_select" on company_members for select
  using (user_id = auth.uid() or is_company_member(company_id));
create policy "members_insert" on company_members for insert with check (is_company_owner(company_id));
create policy "members_update" on company_members for update
  using (is_company_owner(company_id)) with check (is_company_owner(company_id));
create policy "members_delete" on company_members for delete
  using (is_company_owner(company_id) or user_id = auth.uid());

-- audit_log: membros leem; ninguém escreve direto (triggers são definer).
create policy "audit_select" on audit_log for select using (is_company_member(company_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 10. Onboarding: criar empresa + seed do plano de contas
-- ───────────────────────────────────────────────────────────────────────────

create or replace function seed_default_categories(p_company uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare g uuid;
begin
  -- Receitas
  insert into categories (company_id, kind, name, position)
  values (p_company, 'receita', 'Receita de serviços', 1) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'receita', g, 'Contratos recorrentes', 1),
    (p_company, 'receita', g, 'Projetos e serviços avulsos', 2);
  insert into categories (company_id, kind, name, position)
  values (p_company, 'receita', 'Outras receitas', 2);

  -- Despesas
  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Pessoal', 1) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Salários', 1),
    (p_company, 'despesa', g, 'Pró-labore', 2),
    (p_company, 'despesa', g, 'Benefícios (VR, VT, plano)', 3),
    (p_company, 'despesa', g, 'Encargos sobre a folha', 4);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Escritório e estrutura', 2) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Aluguel e condomínio', 1),
    (p_company, 'despesa', g, 'Contas de consumo (luz, água)', 2),
    (p_company, 'despesa', g, 'Internet e telefone', 3),
    (p_company, 'despesa', g, 'Manutenção e limpeza', 4);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Ferramentas e software', 3);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Marketing e vendas', 4) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Anúncios e mídia paga', 1),
    (p_company, 'despesa', g, 'Comissões', 2),
    (p_company, 'despesa', g, 'Eventos e brindes', 3);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Serviços de terceiros', 5) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Contabilidade', 1),
    (p_company, 'despesa', g, 'Jurídico', 2),
    (p_company, 'despesa', g, 'Freelancers e parceiros', 3);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Impostos e taxas', 6) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Impostos sobre vendas (Simples, ISS)', 1),
    (p_company, 'despesa', g, 'Taxas e licenças', 2);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Despesas financeiras', 7) returning id into g;
  insert into categories (company_id, kind, parent_id, name, position) values
    (p_company, 'despesa', g, 'Tarifas bancárias', 1),
    (p_company, 'despesa', g, 'Juros e multas', 2);

  insert into categories (company_id, kind, name, position)
  values (p_company, 'despesa', 'Outras despesas', 8);
end $$;

create or replace function create_company(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  insert into companies (name) values (p_name) returning id into v_company;
  insert into company_members (company_id, user_id, role) values (v_company, auth.uid(), 'owner');
  insert into bank_accounts (company_id, name, type) values (v_company, 'Caixa', 'dinheiro');
  perform seed_default_categories(v_company);
  return v_company;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 11. Views de leitura
-- ───────────────────────────────────────────────────────────────────────────
-- security_invoker = on: a view roda com a RLS de quem consulta.

-- Lançamentos com o status derivado e a data de caixa efetiva.
-- cash_date de um previsto vencido é HOJE (não a data que já passou):
-- dinheiro atrasado só pode entrar/sair de hoje em diante.
create view v_entries with (security_invoker = on) as
select
  e.*,
  case
    when e.status = 'previsto' and e.due_date < brt_today() then 'vencido'
    else e.status::text
  end as status_display,
  case
    when e.status = 'pago' then e.paid_date
    else greatest(e.due_date, brt_today())
  end as cash_date
from entries e;

-- Saldo por conta: inicial + lançamentos pagos ± transferências.
create view v_account_balances with (security_invoker = on) as
select
  a.id, a.company_id, a.name, a.type, a.archived_at,
  a.initial_balance_cents
  + coalesce((select sum(case when e.kind = 'receita' then e.amount_cents else -e.amount_cents end)
              from entries e
              where e.bank_account_id = a.id and e.status = 'pago'), 0)
  + coalesce((select sum(t.amount_cents) from transfers t where t.to_account_id = a.id), 0)
  - coalesce((select sum(t.amount_cents) from transfers t where t.from_account_id = a.id), 0)
  as balance_cents
from bank_accounts a;

-- ───────────────────────────────────────────────────────────────────────────
-- 12. Funções de negócio (security invoker: a RLS do chamador se aplica)
-- ───────────────────────────────────────────────────────────────────────────

-- Baixa em lote (e individual: lote de 1). Valida que a conta é da mesma
-- empresa do lançamento via join. Retorna quantos foram baixados.
create or replace function fn_settle_entries(p_ids uuid[], p_paid_date date, p_bank_account_id uuid)
returns int
language plpgsql
as $$
declare n int;
begin
  update entries e
  set status = 'pago', paid_date = p_paid_date, bank_account_id = p_bank_account_id
  from bank_accounts a
  where e.id = any (p_ids)
    and e.status = 'previsto'
    and a.id = p_bank_account_id
    and a.company_id = e.company_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Materializa parcelas futuras de uma recorrência até o horizonte
-- (12 meses por padrão). Idempotente: nunca duplica uma data já gerada,
-- então pode rodar de novo à vontade (inclusive num cron para manter o
-- horizonte rolante). "Somar i × intervalo à data inicial" (em vez de
-- iterar mês a mês) evita o drift do dia 31 → 28 → 28…
create or replace function fn_generate_recurrence_entries(p_recurrence uuid, p_horizon date default null)
returns int
language plpgsql
as $$
declare
  r recurrences%rowtype;
  v_step interval;
  v_horizon date;
  n int;
begin
  select * into r from recurrences where id = p_recurrence;
  if not found then
    raise exception 'recorrência não encontrada';
  end if;
  if not r.active then
    return 0;
  end if;

  v_step := case r.frequency
    when 'semanal'   then interval '7 days'
    when 'quinzenal' then interval '14 days'
    when 'mensal'    then interval '1 month'
    when 'anual'     then interval '1 year'
  end;
  v_horizon := least(coalesce(r.end_date, 'infinity'::date),
                     coalesce(p_horizon, brt_today() + 365));

  insert into entries (company_id, kind, description, amount_cents,
                       competence_date, due_date, status,
                       category_id, cost_center_id, bank_account_id,
                       recurrence_id, created_by)
  select r.company_id, r.kind, r.description, r.amount_cents,
         s.d, s.d, 'previsto',
         r.category_id, r.cost_center_id, r.bank_account_id,
         r.id, auth.uid()
  from (
    select (r.start_date + (i * v_step))::date as d
    from generate_series(0, 730) i
    where r.occurrences is null or i < r.occurrences
  ) s
  where s.d <= v_horizon
    and not exists (
      select 1 from entries e
      where e.recurrence_id = r.id and e.competence_date = s.d
    );
  get diagnostics n = row_count;
  return n;
end $$;

-- Fluxo de caixa realizado + projetado, por dia/semana/mês, com saldo
-- acumulado. O saldo parte do consolidado real na véspera de p_from e
-- soma realizado E projetado — é o saldo projetado, razão de ser da tela.
create or replace function fn_cash_flow(p_company uuid, p_from date, p_to date, p_bucket text default 'dia')
returns table (
  bucket_start         date,
  realizado_in_cents   bigint,
  realizado_out_cents  bigint,
  projetado_in_cents   bigint,
  projetado_out_cents  bigint,
  saldo_projetado_cents bigint
)
language sql stable
as $$
  with opening as (
    select
      coalesce((select sum(initial_balance_cents) from bank_accounts
                where company_id = p_company and archived_at is null), 0)
      + coalesce((select sum(case when kind = 'receita' then amount_cents else -amount_cents end)
                  from entries
                  where company_id = p_company and status = 'pago' and paid_date < p_from), 0)
      as opening_cents
  ),
  buckets as (
    select
      case p_bucket
        when 'dia'    then v.cash_date
        when 'semana' then date_trunc('week',  v.cash_date)::date
        else               date_trunc('month', v.cash_date)::date
      end as b,
      coalesce(sum(v.amount_cents) filter (where v.status = 'pago'     and v.kind = 'receita'), 0) as r_in,
      coalesce(sum(v.amount_cents) filter (where v.status = 'pago'     and v.kind = 'despesa'), 0) as r_out,
      coalesce(sum(v.amount_cents) filter (where v.status = 'previsto' and v.kind = 'receita'), 0) as p_in,
      coalesce(sum(v.amount_cents) filter (where v.status = 'previsto' and v.kind = 'despesa'), 0) as p_out
    from v_entries v
    where v.company_id = p_company
      and v.cash_date between p_from and p_to
    group by 1
  )
  select
    b, r_in, r_out, p_in, p_out,
    (select opening_cents from opening)
      + sum(r_in - r_out + p_in - p_out) over (order by b) as saldo_projetado_cents
  from buckets
  order by b
$$;

-- DRE gerencial por mês × categoria-raiz.
--  competencia: tudo pela competence_date (compromisso assumido conta).
--  caixa: pela data de caixa; por padrão só pagos — p_incluir_previstos
--  projeta o resto. O toggle da UI mapeia direto para p_regime.
create or replace function fn_dre(
  p_company uuid,
  p_regime text,               -- 'caixa' | 'competencia'
  p_from date,
  p_to date,
  p_incluir_previstos boolean default false
)
returns table (
  mes             date,
  root_category_id uuid,
  root_category   text,
  kind            entry_kind,
  total_cents     bigint
)
language sql stable
as $$
  with recursive tree as (
    select id, id as root_id, name as root_name
    from categories
    where company_id = p_company and parent_id is null
    union all
    select c.id, t.root_id, t.root_name
    from categories c
    join tree t on c.parent_id = t.id
  )
  select
    date_trunc('month',
      case when p_regime = 'competencia' then v.competence_date else v.cash_date end
    )::date as mes,
    t.root_id, t.root_name, v.kind,
    sum(v.amount_cents) as total_cents
  from v_entries v
  join tree t on t.id = v.category_id
  where v.company_id = p_company
    and (case when p_regime = 'competencia' then v.competence_date else v.cash_date end)
        between p_from and p_to
    and (p_regime = 'competencia' or v.status = 'pago' or p_incluir_previstos)
  group by 1, 2, 3, 4
  order by 1, 4, 5 desc
$$;

-- Extrato por centro de custo (mesma lógica de regime da DRE).
create or replace function fn_cost_center_statement(
  p_company uuid,
  p_regime text,
  p_from date,
  p_to date
)
returns table (
  cost_center_id   uuid,
  cost_center_name text,
  kind             entry_kind,
  total_cents      bigint
)
language sql stable
as $$
  select cc.id, cc.name, v.kind, sum(v.amount_cents)
  from v_entries v
  join cost_centers cc on cc.id = v.cost_center_id
  where v.company_id = p_company
    and (p_regime = 'competencia' or v.status = 'pago')
    and (case when p_regime = 'competencia' then v.competence_date else v.cash_date end)
        between p_from and p_to
  group by 1, 2, 3
  order by 2, 3
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 13. Dashboard
-- ───────────────────────────────────────────────────────────────────────────

-- Números do topo. runway = saldo ÷ média das despesas pagas dos últimos
-- 3 meses FECHADOS (mês corrente incompleto distorceria a média);
-- null quando não há histórico.
create or replace function fn_dashboard_summary(p_company uuid)
returns table (
  saldo_atual_cents     bigint,   -- "saldo na conta" (todas as contas ativas)
  receitas_mes_cents    bigint,   -- o que entrou pago no mês corrente
  despesas_mes_cents    bigint,   -- o que saiu pago no mês corrente
  resultado_dia_cents   bigint,   -- "saldo do dia": entrou − saiu pago HOJE
  a_receber_cents       bigint,
  a_pagar_cents         bigint,
  vencido_receber_cents bigint,
  vencido_pagar_cents   bigint,
  resultado_mes_cents   bigint,
  runway_meses          numeric
)
language sql stable
as $$
  with saldo as (
    select coalesce(sum(balance_cents), 0) as s
    from v_account_balances
    where company_id = p_company and archived_at is null
  ),
  mes as (
    select
      coalesce(sum(amount_cents) filter (where kind = 'receita'), 0) as rec,
      coalesce(sum(amount_cents) filter (where kind = 'despesa'), 0) as desp
    from entries
    where company_id = p_company and status = 'pago'
      and paid_date >= date_trunc('month', brt_today())::date
  ),
  dia as (
    select coalesce(sum(case when kind = 'receita' then amount_cents else -amount_cents end), 0) as r
    from entries
    where company_id = p_company and status = 'pago' and paid_date = brt_today()
  ),
  abertos as (
    select
      coalesce(sum(amount_cents) filter (where kind = 'receita'), 0) as rec,
      coalesce(sum(amount_cents) filter (where kind = 'despesa'), 0) as pag,
      coalesce(sum(amount_cents) filter (where kind = 'receita' and due_date < brt_today()), 0) as rec_venc,
      coalesce(sum(amount_cents) filter (where kind = 'despesa' and due_date < brt_today()), 0) as pag_venc
    from entries
    where company_id = p_company and status = 'previsto'
  ),
  burn as (
    select avg(m.total) as a
    from (
      select date_trunc('month', paid_date) as mm, sum(amount_cents) as total
      from entries
      where company_id = p_company and status = 'pago' and kind = 'despesa'
        and paid_date >= (date_trunc('month', brt_today()) - interval '3 months')::date
        and paid_date <  date_trunc('month', brt_today())::date
      group by 1
    ) m
  )
  select
    saldo.s, mes.rec, mes.desp, dia.r,
    abertos.rec, abertos.pag, abertos.rec_venc, abertos.pag_venc,
    mes.rec - mes.desp,
    case when coalesce(burn.a, 0) > 0 then round(saldo.s / burn.a, 1) end
  from saldo, mes, dia, abertos, burn
$$;

-- Top despesas do período (caixa), por categoria-folha.
create or replace function fn_top_expenses(p_company uuid, p_from date, p_to date, p_limit int default 5)
returns table (category_id uuid, category_name text, total_cents bigint)
language sql stable
as $$
  select c.id, c.name, sum(e.amount_cents) as total_cents
  from entries e
  join categories c on c.id = e.category_id
  where e.company_id = p_company
    and e.kind = 'despesa' and e.status = 'pago'
    and e.paid_date between p_from and p_to
  group by 1, 2
  order by 3 desc
  limit p_limit
$$;

-- Evolução 12 meses (caixa): receitas × despesas pagas por mês.
create or replace function fn_monthly_evolution(p_company uuid)
returns table (mes date, receitas_cents bigint, despesas_cents bigint)
language sql stable
as $$
  select
    date_trunc('month', paid_date)::date as mes,
    coalesce(sum(amount_cents) filter (where kind = 'receita'), 0),
    coalesce(sum(amount_cents) filter (where kind = 'despesa'), 0)
  from entries
  where company_id = p_company and status = 'pago'
    and paid_date >= (date_trunc('month', brt_today()) - interval '11 months')::date
  group by 1
  order by 1
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 14. Grants
-- ───────────────────────────────────────────────────────────────────────────
-- Explícitos de propósito: não dependa dos default privileges do ambiente.
-- A camada fina de segurança é a RLS; o grant é a camada grossa.
-- `anon` não recebe nada — sem sessão, sem dados.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- audit_log é só leitura para usuários (a escrita é dos triggers definer);
-- a RLS já bloqueia, mas cinto e suspensório.
revoke insert, update, delete on audit_log from authenticated;
grant execute on all functions in schema public to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 15. Equipe: convites e listagem de membros
-- ───────────────────────────────────────────────────────────────────────────
-- Convidar alguém que ainda nem tem conta não dá para fazer do navegador
-- (exigiria service role). O caminho: o owner registra o CONVITE por e-mail;
-- quando a pessoa cria a conta com aquele e-mail, o convite aparece no
-- onboarding e ela aceita — a função security definer confere o e-mail do
-- JWT antes de criar o vínculo.

create table invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null check (position('@' in email) > 1),
  role        text not null default 'operador' check (role in ('admin', 'operador')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (company_id, email)
);

alter table invites enable row level security;

-- membros veem os convites da empresa; o convidado vê o próprio (pelo e-mail do JWT)
create policy "invites_select" on invites for select
  using (is_company_member(company_id)
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "invites_insert" on invites for insert with check (is_company_owner(company_id));
create policy "invites_delete" on invites for delete using (is_company_owner(company_id));

-- Convites pendentes do usuário logado, com o nome da empresa (que ele ainda
-- não pode ler direto — não é membro).
create or replace function fn_my_invites()
returns table (invite_id uuid, company_name text, role text)
language sql stable security definer set search_path = public
as $$
  select i.id, c.name, i.role
  from invites i
  join companies c on c.id = i.company_id
  where i.accepted_at is null
    and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function accept_invite(p_invite uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare inv invites%rowtype;
begin
  select * into inv from invites where id = p_invite and accepted_at is null;
  if not found then
    raise exception 'convite não encontrado ou já usado';
  end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'este convite é para outro e-mail';
  end if;
  insert into company_members (company_id, user_id, role)
  values (inv.company_id, auth.uid(), inv.role)
  on conflict do nothing;
  update invites set accepted_at = now() where id = inv.id;
  return inv.company_id;
end $$;

-- Membros com e-mail (auth.users não é legível pelo cliente).
create or replace function fn_company_members(p_company uuid)
returns table (user_id uuid, email text, role text, member_since timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from company_members m
  join auth.users u on u.id = m.user_id
  where m.company_id = p_company
    and is_company_member(p_company)
  order by m.created_at
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 16. Histórico (auditoria) com e-mail de quem fez
-- ───────────────────────────────────────────────────────────────────────────

create or replace function fn_audit_log(p_company uuid, p_limit int default 200)
returns table (id bigint, action text, entity text, entity_id uuid, snapshot jsonb, email text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.id, a.action, a.entity, a.entity_id, a.snapshot, u.email::text, a.created_at
  from audit_log a
  left join auth.users u on u.id = a.user_id
  where a.company_id = p_company
    and is_company_member(p_company)
  order by a.created_at desc
  limit p_limit
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 17. Grants das seções 15–16 (criadas depois da seção 14)
-- ───────────────────────────────────────────────────────────────────────────

grant select, insert, delete on invites to authenticated;
grant execute on function fn_my_invites, accept_invite, fn_company_members, fn_audit_log to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 18. Fase 2: papéis finos
-- ───────────────────────────────────────────────────────────────────────────
-- owner  → tudo, inclusive equipe e a própria empresa.
-- admin  → tudo, menos gerenciar equipe/empresa.
-- operador → lança, consulta, dá baixa e importa; NÃO mexe na estrutura
--            (contas bancárias, renomear/arquivar categorias e centros,
--            transferências alheias) nem exclui lançamento PAGO.
-- A UI esconde os botões; quem manda é o banco.

create or replace function has_company_role(p_company uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from company_members
    where company_id = p_company and user_id = auth.uid() and role = any (p_roles)
  )
$$;

grant execute on function has_company_role to authenticated;

-- excluir lançamento PAGO exige admin/owner (o previsto continua livre)
drop policy "entries_delete" on entries;
create policy "entries_delete" on entries for delete
  using (
    is_company_member(company_id)
    and (status <> 'pago' or has_company_role(company_id, array['owner', 'admin']))
  );

-- estrutura: alterar/excluir contas, categorias e centros é de admin/owner.
-- (criar categoria continua livre — a importação cria em nome de quem importa)
do $$
declare t text;
begin
  foreach t in array array['bank_accounts', 'categories', 'cost_centers']
  loop
    execute format('drop policy "%1$s_update" on %1$I', t);
    execute format('create policy "%1$s_update" on %1$I for update
      using (has_company_role(company_id, array[''owner'', ''admin'']))
      with check (has_company_role(company_id, array[''owner'', ''admin'']))', t);
    execute format('drop policy "%1$s_delete" on %1$I', t);
    execute format('create policy "%1$s_delete" on %1$I for delete
      using (has_company_role(company_id, array[''owner'', ''admin'']))', t);
  end loop;
end $$;

drop policy "bank_accounts_insert" on bank_accounts;
create policy "bank_accounts_insert" on bank_accounts for insert
  with check (has_company_role(company_id, array['owner', 'admin']));

drop policy "transfers_delete" on transfers;
create policy "transfers_delete" on transfers for delete
  using (has_company_role(company_id, array['owner', 'admin']));

-- ───────────────────────────────────────────────────────────────────────────
-- 19. Fase 2: conciliação bancária (extrato OFX)
-- ───────────────────────────────────────────────────────────────────────────
-- external_ref guarda o FITID da transação do extrato. O índice único é a
-- garantia de idempotência: reimportar o mesmo extrato nunca duplica nada.

alter table entries add column if not exists external_ref text;

create unique index if not exists idx_entries_external_ref
  on entries (company_id, bank_account_id, external_ref)
  where external_ref is not null;
