import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideClose,
}: {
  open: boolean
  onOpenChange?: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  hideClose?: boolean
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <D.Content
          onInteractOutside={(e) => hideClose && e.preventDefault()}
          onEscapeKeyDown={(e) => hideClose && e.preventDefault()}
          className={cn(
            'panel fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 outline-none',
            className,
          )}
        >
          <D.Title className="gold-text font-display text-xl font-bold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-sm text-parch-dim">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">Diálogo</D.Description>
          )}
          <div className="mt-4">{children}</div>
          {!hideClose && (
            <D.Close className="absolute right-3 top-3 rounded p-1 text-parch-dim hover:text-parch" aria-label="Cerrar">
              <X size={18} />
            </D.Close>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
