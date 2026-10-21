import * as React from 'react'
import { cn } from '#/lib/utils'

const base =
  'w-full rounded-lg border border-gold/25 bg-ink-800/80 px-3 py-2 text-parch placeholder:text-parch-dim/50 outline-none transition focus:border-gold/70 focus:ring-2 focus:ring-gold/20 caret-bar'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, 'h-10', className)} {...p} />
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-20 resize-y', className)} {...p} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'h-10', className)} {...p} />
))
Select.displayName = 'Select'

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block font-display text-xs uppercase tracking-widest text-parch-dim', className)} {...p} />
}
