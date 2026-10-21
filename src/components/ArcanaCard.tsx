import { CARD_BY_KEY, FACTION_LABEL } from '@shared/cards'
import { CardArt, FACTION_STYLE, roman } from '#/lib/card-art'
import { cn } from '#/lib/utils'

const SIZES = {
  xs: 'w-[78px] h-[116px] text-[9px]',
  sm: 'w-[112px] h-[166px] text-[11px]',
  md: 'w-[160px] h-[236px] text-sm',
  lg: 'w-[250px] h-[370px] text-base',
}

export function CardBack({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-[10px] border border-gold/50 shadow-lg', SIZES[size], className)}
      style={{ background: 'radial-gradient(circle at 50% 40%, #3a2a55, #120c1c 70%)' }}
    >
      <svg viewBox="0 0 100 150" className="absolute inset-0 h-full w-full opacity-80">
        <rect x="6" y="6" width="88" height="138" rx="6" fill="none" stroke="#d4a73a" strokeOpacity=".5" />
        <g transform="translate(50 75)" stroke="#d4a73a" strokeOpacity=".6" fill="none">
          <circle r="22" />
          <circle r="14" strokeDasharray="2 3" />
          <path d="M0 -30 L8 0 L0 30 L-8 0Z" />
          <path d="M-30 0 L0 8 L30 0 L0 -8Z" />
        </g>
      </svg>
    </div>
  )
}

export function ArcanaCard({
  cardKey,
  size = 'sm',
  className,
  selected,
  dim,
  showText,
}: {
  cardKey: string
  size?: keyof typeof SIZES
  className?: string
  selected?: boolean
  dim?: boolean
  showText?: boolean
}) {
  const meta = CARD_BY_KEY[cardKey]
  const f = FACTION_STYLE[meta.faction]
  return (
    <div
      className={cn(
        'relative flex shrink-0 select-none flex-col overflow-hidden rounded-[10px] border-2 bg-ink-800 transition-shadow',
        SIZES[size],
        selected && 'ring-2 ring-gold',
        dim && 'opacity-45 saturate-50',
        className,
      )}
      style={{ borderColor: f.ring, boxShadow: `0 6px 22px ${f.glow}` }}
    >
      <div className="flex items-center justify-between px-1.5 pt-1 font-display font-bold" style={{ color: f.ring }}>
        <span>{roman(meta.n)}</span>
        <span className="text-[0.8em] uppercase tracking-widest opacity-80">{FACTION_LABEL[meta.faction]}</span>
      </div>
      <div className="mx-1 mt-1 overflow-hidden rounded-md border border-white/10" style={{ aspectRatio: '4 / 3' }}>
        <CardArt cardKey={cardKey} />
      </div>
      <div className="px-1.5 pt-1.5 text-center font-display font-bold leading-tight text-parch">{meta.name}</div>
      {(showText || size === 'lg') && <p className="mt-1 flex-1 overflow-hidden px-2 pb-2 text-center text-[0.82em] leading-snug text-parch-dim">{meta.text}</p>}
      {meta.dice && <span className="absolute bottom-1 right-1.5 text-[1.1em]" title="Usa dado">🎲</span>}
    </div>
  )
}
