'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowCircleDown, ArrowCircleUp, ArrowsClockwise, Bank, ChartBar, Gear,
  House, List, Receipt, SignOut, UploadSimple, WaveTriangle, X,
} from '@phosphor-icons/react'
import { Logo, SidebarNav, ThemeToggle, Text } from '@/components/ui'
import { useSession } from '@/lib/session'
import { SetupScreen } from '@/components/app/SetupScreen'

const grupos = [
  {
    items: [
      { key: '/', label: 'Visão geral', icon: House },
      { key: '/lancamentos', label: 'Lançamentos', icon: Receipt },
      { key: '/a-pagar', label: 'Contas a pagar', icon: ArrowCircleDown },
      { key: '/a-receber', label: 'Contas a receber', icon: ArrowCircleUp },
      { key: '/importar', label: 'Importar dados', icon: UploadSimple },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      { key: '/contas', label: 'Contas e saldos', icon: Bank },
      { key: '/conciliacao', label: 'Conciliação', icon: ArrowsClockwise },
      { key: '/fluxo', label: 'Fluxo de caixa', icon: WaveTriangle },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      {
        key: 'relatorios', label: 'Relatórios', icon: ChartBar,
        items: [
          { key: '/relatorios/fechamento', label: 'Fechamento do mês' },
          { key: '/relatorios/dre', label: 'Resultado (DRE)' },
          { key: '/relatorios/centros-de-custo', label: 'Centros de custo' },
        ],
      },
      {
        key: 'config', label: 'Configurações', icon: Gear,
        items: [
          { key: '/config/plano-de-contas', label: 'Plano de contas' },
          { key: '/config/centros-de-custo', label: 'Centros de custo' },
          { key: '/config/empresa', label: 'Empresa e equipe' },
          { key: '/config/historico', label: 'Histórico' },
        ],
      },
    ],
  },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  const { envOk, loading, user, companies, company } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    if (loading) return
    if (envOk && !user) router.replace('/login')
    else if (envOk && user && companies.length === 0) router.replace('/onboarding')
  }, [envOk, loading, user, companies.length, router])

  if (!envOk) return <SetupScreen />
  if (loading || !user || !company) {
    return (
      <main className="ds-app flex min-h-dvh items-center justify-center bg-canvas">
        <Text size="sm" tone="mute">Carregando…</Text>
      </main>
    )
  }

  const nav = (
    <SidebarNav
      groups={grupos}
      active={pathname}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((v) => !v)}
      onSelect={(key: string) => {
        router.push(key)
        setDrawer(false)
      }}
      header={({ collapsed: c }: { collapsed: boolean }) => (
        <Logo variant={c ? 'symbol' : 'full'} className={c ? 'h-7 w-7' : 'h-6'} />
      )}
    />
  )

  return (
    <div className="ds-app flex min-h-dvh bg-canvas">
      {/* sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 print:!hidden lg:block">{nav}</aside>

      {/* drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-950/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 bg-canvas shadow-xl">{nav}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-hairline bg-surface/80 px-4 py-3 backdrop-blur print:hidden lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-full p-2 text-mute transition-colors hover:bg-ink/10 hover:text-ink lg:hidden"
              onClick={() => setDrawer((v) => !v)}
              aria-label="Abrir menu"
            >
              {drawer ? <X size={20} /> : <List size={20} />}
            </button>
            <Text size="sm" className="font-medium text-ink">{company.name}</Text>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SairButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

function SairButton() {
  const { supabase } = useSession()
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await supabase?.auth.signOut()
        router.replace('/login')
      }}
      aria-label="Sair"
      title="Sair"
      className="rounded-full p-2 text-mute transition-colors hover:bg-ink/10 hover:text-ink"
    >
      <SignOut size={18} />
    </button>
  )
}
