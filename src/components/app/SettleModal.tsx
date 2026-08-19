'use client'
import { useState } from 'react'
import { Button, DateInput, Field, Select, Text } from '@/components/ui'
import { Modal } from './Modal'
import { useSession } from '@/lib/session'
import { todayISO } from '@/lib/format'

/** Baixa (individual ou em lote): pergunta a data e a conta de onde saiu/entrou. */
export function SettleModal({
  open, onClose, count, onConfirm,
}: {
  open: boolean
  onClose: () => void
  count: number
  onConfirm: (paidDate: string, accountId: string) => Promise<void>
}) {
  const { accounts } = useSession()
  const ativas = accounts.filter((a) => !a.archived_at)
  const [data, setData] = useState(todayISO())
  const [conta, setConta] = useState(ativas[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const contaValida = conta || ativas[0]?.id || ''

  return (
    <Modal open={open} onClose={onClose} title={count === 1 ? 'Marcar como pago' : `Baixar ${count} lançamentos`}>
      <div className="flex flex-col gap-4">
        <Field label="Data do pagamento">
          <DateInput value={data} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setData(e.target.value)} />
        </Field>
        <Field label="Conta">
          <Select value={contaValida} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setConta(e.target.value)}>
            {ativas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {ativas.length === 0 && <Text size="sm" className="text-danger">Cadastre uma conta em “Contas e saldos” primeiro.</Text>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="shiny" size="sm" disabled={busy || !contaValida}
            onClick={async () => {
              setBusy(true)
              try { await onConfirm(data, contaValida); onClose() } finally { setBusy(false) }
            }}>
            {busy ? 'Baixando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
