'use client'
import { Input } from '@/components/ui'

/** Campo de valor em BRL. Digite números; vírgula separa os centavos.
 *  O estado fica com o TEXTO; quem envia converte com parseMoney(). */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  placeholder = '0,00',
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  return (
    <span className="relative flex w-full items-center">
      <span className="pointer-events-none absolute left-[var(--ds-input-px)] text-sm text-mute">R$</span>
      <Input
        value={value}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="pl-11 text-right tabular-nums"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value.replace(/[^\d.,]/g, ''))
        }
      />
    </span>
  )
}
