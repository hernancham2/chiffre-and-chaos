import { HeartHandshake, Sword, Flame, Crown, UserMinus, ShieldCheck, Dices, Scale, Feather, Handshake, Sun, Cross, HandHeart, Crosshair, Copy, Church, Skull, Gavel, Eye, Droplets, Fish, ScrollText, Ghost, Bug, Baby, Dice5, Dice6, RefreshCcw, HandMetal, Rabbit, ShieldOff, BicepsFlexed, Pin, Target, Zap, Bomb, Gem, Link2, Sparkles } from 'lucide-react'

const Icons: Record<string, unknown> = { HeartHandshake, Sword, Flame, Crown, UserMinus, ShieldCheck, Dices, Scale, Feather, Handshake, Sun, Cross, HandHeart, Crosshair, Copy, Church, Skull, Gavel, Eye, Droplets, Fish, ScrollText, Ghost, Bug, Baby, Dice5, Dice6, RefreshCcw, HandMetal, Rabbit, ShieldOff, BicepsFlexed, Pin, Target, Zap, Bomb, Gem, Link2, Sparkles }
import { CARD_BY_KEY, type Faction } from '@shared/cards'
import { cn } from './utils'

export const FACTION_STYLE: Record<Faction, { from: string; to: string; ring: string; text: string; glow: string }> = {
  celestial: { from: '#1d3a5f', to: '#0b1a30', ring: '#8ec9ff', text: 'text-celestial', glow: 'rgba(142,201,255,.45)' },
  infernal: { from: '#5c1224', to: '#1d0710', ring: '#e5485f', text: 'text-infernal', glow: 'rgba(229,72,95,.45)' },
  neutral: { from: '#4a3d1e', to: '#1a1409', ring: '#c9b27c', text: 'text-neutral-arc', glow: 'rgba(201,178,124,.4)' },
  chaos: { from: '#3b2468', to: '#140c27', ring: '#a98bff', text: 'text-chaos', glow: 'rgba(169,139,255,.45)' },
}

export function roman(n: number): string {
  let s = ''
  const map: [number, string][] = [
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  for (const [v, r] of map) {
    while (n >= v) {
      s += r
      n -= v
    }
  }
  return s
}

export function CardIcon({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const I = ((Icons as any)[name] ?? Icons.Sparkles) as React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  return <I size={size} className={className} strokeWidth={1.5} />
}

/** Ilustración vectorial de un arcano: aura de facción + rayos + sello central. */
export function CardArt({ cardKey, className }: { cardKey: string; className?: string }) {
  const meta = CARD_BY_KEY[cardKey]
  const f = FACTION_STYLE[meta.faction]
  const id = `g-${cardKey}`
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5)
  return (
    <svg viewBox="0 0 200 150" className={cn('h-full w-full', className)} aria-hidden>
      <defs>
        <radialGradient id={id} cx="50%" cy="48%" r="60%">
          <stop offset="0" stopColor={f.ring} stopOpacity=".55" />
          <stop offset=".55" stopColor={f.from} stopOpacity=".9" />
          <stop offset="1" stopColor={f.to} />
        </radialGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#${id})`} />
      <g transform="translate(100 75)" stroke={f.ring} strokeOpacity=".35" strokeWidth="1">
        {rays.map((a) => (
          <line key={a} x1="0" y1="-30" x2="0" y2={a % 45 === 0 ? -95 : -70} transform={`rotate(${a})`} />
        ))}
        <circle r="46" fill="none" strokeOpacity=".6" />
        <circle r="38" fill="rgba(0,0,0,.35)" strokeOpacity=".8" />
        <circle r="54" fill="none" strokeDasharray="2 5" />
        <polygon points="0,-62 6,-48 -6,-48" fill={f.ring} fillOpacity=".6" stroke="none" />
        <polygon points="0,62 6,48 -6,48" fill={f.ring} fillOpacity=".6" stroke="none" />
      </g>
      <foreignObject x="72" y="47" width="56" height="56">
        <div className={cn('flex h-full w-full items-center justify-center', f.text)} style={{ filter: `drop-shadow(0 0 8px ${f.glow})` }}>
          <CardIcon name={meta.icon} size={38} />
        </div>
      </foreignObject>
    </svg>
  )
}
