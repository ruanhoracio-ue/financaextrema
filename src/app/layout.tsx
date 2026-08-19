import type { Metadata, Viewport } from 'next'
import { SessionProvider } from '@/lib/session'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finanças Extremas',
  description: 'Gestão financeira simples para pequenas empresas de serviço.',
  icons: { icon: '/logo.svg' },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

const antiFlash = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: antiFlash }} />
      </head>
      <body className="bg-canvas text-body antialiased">
        {/* defs do gradiente da marca — obrigatório p/ fill-brand-gradient */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop stopColor="#10b981" offset="0%" />
              <stop stopColor="#34d399" offset="100%" />
            </linearGradient>
          </defs>
        </svg>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
