import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Anchor, Bird, Crown, Eye, Flame, Gem, Key, Moon, Sprout, Star, Sun, Feather } from 'lucide-react'
import type { PublicToken } from '@shared/types'
import { cn } from '#/lib/utils'

const SIGILS = [Flame, Moon, Sun, Star, Crown, Anchor, Feather, Eye, Key, Sprout, Gem, Bird]

export function Sigil({ index, color, size = 36, className }: { index: number; color: string; size?: number; className?: string }) {
  const I = SIGILS[index % SIGILS.length]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full border-2', className)}
      style={{ width: size, height: size, borderColor: color, background: `radial-gradient(circle at 35% 30%, ${color}55, #0d0a12 80%)`, color }}
    >
      <I size={size * 0.52} strokeWidth={1.8} />
    </span>
  )
}
export const SIGIL_COUNT = SIGILS.length

/** Ficha de integrante: peón encapuchado. */
export function Pawn({ token, color, size = 30, owner }: { token: PublicToken; color: string; size?: number; owner?: string }) {
  const out = token.status === 'out'
  return (
    <span
      className={cn('relative inline-flex flex-col items-center', out && 'opacity-40 grayscale')}
      title={`${token.name}${owner ? ` · de ${owner}` : ''}${out ? ` · retirado (nota ${token.grade ?? 0})` : ''}${token.loanUntil ? ' · prestado' : ''}`}
      data-token={token.id}
    >
      <svg width={size} height={size * 1.25} viewBox="0 0 40 50" aria-hidden>
        <ellipse cx="20" cy="46" rx="13" ry="3.5" fill="#000" opacity=".5" />
        <path d="M20 4c-6 0-9 5-9 10 0 3 1 5 2 7-5 3-8 10-8 20h30c0-10-3-17-8-20 1-2 2-4 2-7 0-5-3-10-9-10z" fill={color} fillOpacity=".92" stroke="#000" strokeOpacity=".4" />
        <ellipse cx="20" cy="15" rx="5.5" ry="6.5" fill="#150f1f" />
        <circle cx="18" cy="15" r="1" fill="#f0d58a" />
        <circle cx="22.5" cy="15" r="1" fill="#f0d58a" />
      </svg>
      {token.loanUntil && <span className="absolute -right-1 -top-1 text-[10px]">⛓</span>}
    </span>
  )
}

export function Die({ value, sides = 6, rolling, size = 84, color = '#d4a73a' }: { value: number; sides?: number; rolling?: boolean; size?: number; color?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [face, setFace] = useState(value)
  useEffect(() => {
    if (!rolling) {
      setFace(value)
      return
    }
    const el = ref.current
    const iv = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 70)
    const t = gsap.timeline()
    if (el) {
      t.fromTo(el, { y: -140, rotation: -360, scale: 0.6, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 1.2, ease: 'bounce.out' })
    }
    const stop = setTimeout(() => {
      clearInterval(iv)
      setFace(value)
      if (el) gsap.fromTo(el, { scale: 1.25 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,0.4)' })
    }, 1400)
    return () => {
      clearInterval(iv)
      clearTimeout(stop)
      t.kill()
    }
  }, [rolling, value, sides])
  const pips: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
  }
  const usePips = sides === 6
  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center rounded-2xl border-2 font-display text-3xl font-black text-ink-950"
      style={{ width: size, height: size, background: `linear-gradient(145deg, #fff3cf, ${color})`, borderColor: '#fff6', boxShadow: `0 10px 30px ${color}66` }}
    >
      {usePips ? (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {pips[face]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8.5" fill="#150f1f" />)}
        </svg>
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{face}</span>
      )}
    </div>
  )
}

/** Ascuas flotantes de fondo */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    let w = 0
    let h = 0
    const resize = () => {
      w = c.width = window.innerWidth
      h = c.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    const N = 46
    const ps = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.8, v: 0.12 + Math.random() * 0.4, ph: Math.random() * 6.28, hue: Math.random() < 0.7 ? 42 : 350 }))
    let raf = 0
    const tick = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const p of ps) {
        p.y -= p.v
        p.x += Math.sin(t / 1800 + p.ph) * 0.25
        if (p.y < -10) {
          p.y = h + 10
          p.x = Math.random() * w
        }
        ctx.beginPath()
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${0.18 + 0.18 * Math.sin(t / 700 + p.ph)})`
        ctx.arc(p.x, p.y, p.r, 0, 6.28)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-0 opacity-70" aria-hidden />
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset="1" stopColor="#a67c1d" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#lg)" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#d4a73a" strokeOpacity=".5" strokeDasharray="2 4" />
      <path d="M32 9 L38 32 L32 55 L26 32Z" fill="url(#lg)" opacity=".9" />
      <path d="M9 32 L32 26 L55 32 L32 38Z" fill="#e5485f" opacity=".85" />
      <circle cx="32" cy="32" r="4" fill="#0d0a12" stroke="url(#lg)" />
    </svg>
  )
}
