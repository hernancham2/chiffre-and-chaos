import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { CARD_BY_KEY } from '@shared/cards'
import type { RoomSnapshot } from '@shared/types'
import { ArcanaCard, CardBack } from '#/components/ArcanaCard'
import { Die } from '#/components/Pieces'

type Item =
  | { type: 'dice'; key: number; purpose: 'team' | 'card'; sides: number; value: number; teamId?: string; cardKey?: string }
  | { type: 'card'; key: number; cardKey: string; teamId?: string; text: string }

const DURATION = { dice: 3000, card: 2600 }

function spawnFloat(teamId: string, delta: number) {
  const el = document.querySelector(`[data-score-team="${teamId}"]`) as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  const f = document.createElement('div')
  f.textContent = delta > 0 ? `+${delta}` : String(delta)
  Object.assign(f.style, {
    position: 'fixed', left: `${r.left + r.width / 2}px`, top: `${r.top}px`, zIndex: '80', pointerEvents: 'none',
    fontFamily: 'Cinzel, serif', fontWeight: '900', fontSize: '28px', color: delta > 0 ? '#6fd08c' : '#e5485f',
    textShadow: '0 2px 12px #000', transform: 'translateX(-50%)',
  })
  document.body.appendChild(f)
  gsap.fromTo(f, { y: 0, opacity: 0, scale: 0.6 }, { y: -48, opacity: 1, scale: 1.25, duration: 0.45, ease: 'back.out(2)' })
  gsap.to(f, { y: -90, opacity: 0, duration: 0.9, delay: 0.7, onComplete: () => f.remove() })
  gsap.fromTo(el, { scale: 1.35, color: delta > 0 ? '#6fd08c' : '#e5485f' }, { scale: 1, color: '#f0d58a', duration: 0.8, ease: 'elastic.out(1,0.5)' })
}

export function Overlays({ s }: { s: RoomSnapshot }) {
  const lastSeq = useRef<number | null>(null)
  const [queue, setQueue] = useState<Item[]>([])
  const cur = queue[0]

  useEffect(() => {
    const log = s.log
    if (lastSeq.current === null) {
      lastSeq.current = log.at(-1)?.seq ?? 0
      return
    }
    const fresh = log.filter((l) => l.seq > lastSeq.current!)
    if (!fresh.length) return
    lastSeq.current = fresh[fresh.length - 1].seq
    const add: Item[] = []
    for (const l of fresh) {
      const d = (l.data ?? {}) as any
      if (l.kind === 'dice') add.push({ type: 'dice', key: l.seq, purpose: d.purpose, sides: d.sides, value: d.value, teamId: d.teamId, cardKey: d.cardKey })
      else if (d.reveal && d.cardKey) add.push({ type: 'card', key: l.seq, cardKey: d.cardKey, teamId: d.teamId, text: l.text })
      else if (l.kind === 'score' && d.teamId && d.delta) setTimeout(() => spawnFloat(d.teamId, d.delta), 150)
      else if (l.kind === 'token' && d.tokenId) {
        const el = document.querySelector(`[data-token="${d.tokenId}"]`)
        if (el) gsap.fromTo(el, { scale: 1.8, y: -10 }, { scale: 1, y: 0, duration: 0.9, ease: 'elastic.out(1,0.4)' })
      }
    }
    if (add.length) setQueue((q) => [...q, ...add].slice(-6))
  }, [s.log])

  useEffect(() => {
    if (!cur) return
    const id = setTimeout(() => setQueue((q) => q.slice(1)), DURATION[cur.type])
    return () => clearTimeout(id)
  }, [cur?.key])

  if (!cur) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-[2px]" key={cur.key}>
      {cur.type === 'dice' ? <DiceScene item={cur} s={s} /> : <CardScene item={cur} s={s} />}
    </div>
  )
}

function DiceScene({ item, s }: { item: Extract<Item, { type: 'dice' }>; s: RoomSnapshot }) {
  const team = s.teams.find((t) => t.id === item.teamId)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gsap.fromTo(ref.current, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3 })
  }, [])
  return (
    <div ref={ref} className="flex flex-col items-center gap-5 text-center">
      <div className="font-display text-sm uppercase tracking-[0.4em] text-gold">
        {item.purpose === 'team' ? 'El destino señala' : item.cardKey ? CARD_BY_KEY[item.cardKey]?.name : 'Dado'}
      </div>
      <Die value={item.value} sides={item.sides} rolling size={130} color={team?.color ?? '#d4a73a'} />
      <div className="max-w-md font-display text-2xl font-bold" style={{ color: team?.color }}>
        {item.purpose === 'team' ? <DelayedName name={team?.name} n={item.value} /> : `${team?.name ?? ''} lanza d${item.sides}: ${item.value}`}
      </div>
      <div className="text-xs uppercase tracking-widest text-parch-dim">dado CSPRNG · d{item.sides}</div>
    </div>
  )
}

function DelayedName({ name, n }: { name?: string; n: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(id)
  }, [])
  return <span className={show ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'}>Equipo {n}: {name}</span>
}

function CardScene({ item, s }: { item: Extract<Item, { type: 'card' }>; s: RoomSnapshot }) {
  const front = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const team = s.teams.find((t) => t.id === item.teamId)
  const meta = CARD_BY_KEY[item.cardKey]
  useEffect(() => {
    const tl = gsap.timeline()
    tl.fromTo(wrap.current, { y: 160, scale: 0.5, opacity: 0, rotation: -12 }, { y: 0, scale: 1, opacity: 1, rotation: 0, duration: 0.55, ease: 'back.out(1.6)' })
      .set(front.current, { rotationY: 90 })
      .to(back.current, { rotationY: -90, duration: 0.3, delay: 0.2, ease: 'power1.in' })
      .to(front.current, { rotationY: 0, duration: 0.35, ease: 'power1.out' })
    if (meta.faction === 'infernal') tl.fromTo(wrap.current, { x: -8 }, { x: 8, duration: 0.05, repeat: 7, yoyo: true }, '-=0.1').set(wrap.current, { x: 0 })
    return () => void tl.kill()
  }, [])
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="font-display text-sm uppercase tracking-[0.4em]" style={{ color: team?.color }}>{team?.name} revela…</div>
      <div ref={wrap} className="relative" style={{ perspective: 900, width: 250, height: 370 }}>
        <div ref={back} className="absolute inset-0"><CardBack size="lg" className="!h-full !w-full" /></div>
        <div ref={front} className="absolute inset-0"><ArcanaCard cardKey={item.cardKey} size="lg" /></div>
      </div>
    </div>
  )
}
