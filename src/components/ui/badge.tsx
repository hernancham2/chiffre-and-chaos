import { cn } from '#/lib/utils'

export function SourceBadge({ source, week, className }: { source: 'semanario' | 'libre'; week?: number | null; className?: string }) {
  const sem = source === 'semanario'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-display text-[11px] font-semibold uppercase tracking-widest',
        sem ? 'border-celestial/50 bg-celestial/10 text-celestial' : 'border-chaos/50 bg-chaos/10 text-chaos',
        className,
      )}
      title={sem ? 'Basada estrictamente en los semanarios' : 'Pregunta añadida: libre / general sobre la temática'}
    >
      {sem ? `📜 Semanario${week ? ` ${week}` : ''}` : '✦ Libre · general'}
    </span>
  )
}
