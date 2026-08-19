'use client'
import { Button, Text } from '@/components/ui'
import { Modal } from './Modal'

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', busy = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Text size="sm" className="text-body">{message}</Text>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button variant="secondary" size="sm" onClick={onConfirm} disabled={busy}
          className="!text-danger">
          {busy ? 'Aguarde…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
