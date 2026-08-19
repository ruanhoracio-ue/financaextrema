'use client'
import { useEffect, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { Heading } from '@/components/ui'

/** Modal simples: painel central no desktop, folha inteira no mobile. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-neutral-950/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-hairline bg-surface shadow-xl sm:max-h-[85dvh] sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <Heading level={4}>{title}</Heading>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-mute transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
