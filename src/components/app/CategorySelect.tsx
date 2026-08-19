'use client'
import { Select } from '@/components/ui'
import { useSession, type Category } from '@/lib/session'

/** Select de categoria agrupado pela árvore (raiz vira optgroup). */
export function CategorySelect({
  kind, value, onChange, required,
}: {
  kind: 'receita' | 'despesa'
  value: string
  onChange: (id: string) => void
  required?: boolean
}) {
  const { categories } = useSession()
  const ativas = categories.filter((c) => c.kind === kind && !c.archived_at)
  const raizes = ativas.filter((c) => !c.parent_id)
  const filhasDe = (id: string) => ativas.filter((c) => c.parent_id === id)

  return (
    <Select required={required} value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
      <option value="" disabled>Escolha a categoria…</option>
      {raizes.map((r) => {
        const filhas = filhasDe(r.id)
        if (filhas.length === 0) return <option key={r.id} value={r.id}>{r.name}</option>
        return (
          <optgroup key={r.id} label={r.name}>
            {filhas.map((f: Category) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
        )
      })}
    </Select>
  )
}
