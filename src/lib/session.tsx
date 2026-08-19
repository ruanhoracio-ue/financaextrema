'use client'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export type Company = { id: string; name: string }
export type Category = { id: string; parent_id: string | null; kind: 'receita' | 'despesa'; name: string; position: number; archived_at: string | null }
export type BankAccount = { id: string; name: string; type: string; archived_at: string | null; balance_cents?: number }
export type CostCenter = { id: string; name: string; archived_at: string | null }

type Ctx = {
  supabase: SupabaseClient | null
  envOk: boolean
  loading: boolean
  user: User | null
  companies: Company[]
  company: Company | null
  setCompanyId: (id: string) => void
  refreshCompanies: () => Promise<void>
  /* lookups da empresa ativa (categorias, contas, centros) */
  categories: Category[]
  accounts: BankAccount[]
  costCenters: CostCenter[]
  refreshLookups: () => Promise<void>
  /** papel do usuário na empresa ativa: 'owner' | 'admin' | 'operador' */
  myRole: string | null
  /** admin ou owner — pode mexer na estrutura (contas, plano, exclusão de pagos) */
  canManage: boolean
}

const SessionCtx = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase()
  const envOk = supabase !== null
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyIdState] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [myRole, setMyRole] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (!session) {
        setCompanies([])
        setCompanyIdState(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])

  async function refreshCompanies() {
    if (!supabase) return
    const { data, error } = await supabase.from('companies').select('id, name').order('name')
    if (!error) {
      setCompanies(data ?? [])
      const salvo = typeof window !== 'undefined' ? localStorage.getItem('fe.company') : null
      const valida = data?.find((c) => c.id === salvo) ?? data?.[0] ?? null
      setCompanyIdState(valida?.id ?? null)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (user) refreshCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function refreshLookups() {
    if (!supabase || !companyId) return
    supabase.from('company_members').select('role')
      .eq('company_id', companyId).eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle().then(({ data }) => setMyRole(data?.role ?? null))
    const [cat, acc, cc] = await Promise.all([
      supabase.from('categories').select('id, parent_id, kind, name, position, archived_at').eq('company_id', companyId).order('position').order('name'),
      supabase.from('v_account_balances').select('id, name, type, archived_at, balance_cents').eq('company_id', companyId).order('name'),
      supabase.from('cost_centers').select('id, name, archived_at').eq('company_id', companyId).order('name'),
    ])
    setCategories((cat.data as Category[]) ?? [])
    setAccounts((acc.data as BankAccount[]) ?? [])
    setCostCenters((cc.data as CostCenter[]) ?? [])
  }

  useEffect(() => {
    refreshLookups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const value = useMemo<Ctx>(
    () => ({
      supabase,
      envOk,
      loading,
      user,
      companies,
      company: companies.find((c) => c.id === companyId) ?? null,
      setCompanyId: (id: string) => {
        localStorage.setItem('fe.company', id)
        setCompanyIdState(id)
      },
      refreshCompanies,
      categories,
      accounts,
      costCenters,
      refreshLookups,
      myRole,
      canManage: myRole === 'owner' || myRole === 'admin',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, envOk, loading, user, companies, companyId, categories, accounts, costCenters, myRole],
  )

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession() {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error('useSession fora do SessionProvider')
  return ctx
}
