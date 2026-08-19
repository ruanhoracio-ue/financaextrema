export type Entry = {
  id: string
  company_id: string
  kind: 'receita' | 'despesa'
  description: string | null
  amount_cents: number
  competence_date: string
  due_date: string
  status: 'previsto' | 'pago'
  paid_date: string | null
  bank_account_id: string | null
  category_id: string
  cost_center_id: string | null
  recurrence_id: string | null
  notes: string | null
  /* derivados da view v_entries */
  status_display: 'previsto' | 'pago' | 'vencido'
  cash_date: string
}
