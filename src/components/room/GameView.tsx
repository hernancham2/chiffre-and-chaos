import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Gavel, Pause, Play, Send, SkipForward, Square, Shield, Sun, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CARD_BY_KEY } from '@shared/cards'
import type { ClientMsg, HandCard, PublicTeam, RoomSnapshot } from '@shared/types'
import { ArcanaCard, CardBack } from '#/components/ArcanaCard'
import { Pawn, Sigil } from '#/components/Pieces'
import { SourceBadge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Modal } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { useRemaining } from '#/lib/useRoom'
import { cn } from '#/lib/utils'
import { Overlays } from './Overlays'
import { ParamForm } from './ParamForm'
import { PendingLayer } from './Pending'

type Send = (m: ClientMsg) => void

export function GameView({ s, send, now }: { s: RoomSnapshot; send: Send; now: () => number }) {
  const me = s.teams.find((t) => t.id === s.me.teamId)
  return (
    <div className="space-y-4">
      <TopBar s={s} now={now} send={send} />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {s.phase === 'donation' ? <Donation s={s} send={send} now={now} /> : <QuestionPanel s={s} send={send} now={now} />}
          {me && <Hand s={s} send={send} />}
          {!me && s.hostPlays === false && <p className="panel p-3 text-center text-sm text-parch-dim">Observas la partida como {s.me.isHost ? 'docente' : 'espectador'}.</p>}
        </div>
        <div className="space-y-4">
          <TeamRail s={s} />
          <SidePanel s={s} send={send} />
          {s.me.isHost && <HostBar s={s} send={send} />}
        </div>
      </div>
      <PendingLayer s={s} send={send} now={now} />
      <Overlays s={s} />
      {s.paused && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[70] mx-auto w-fit rounded-full border border-gold bg-ink-900/95 px-6 py-2 font-display uppercase tracking-widest text-gold">⏸ Tiempo detenido por el docente</div>
      )}
    </div>
  )
}

// ───────────── barra superior ─────────────
function TimerRing({ s, now }: { s: RoomSnapshot; now: () => number }) {
  const ms = useRemaining(s.clock, now)
  if (!s.clock || ms === null) return <div className="size-16" />
  const total = Math.max(1, s.clock.totalMs)
  const frac = Math.min(1, ms / total)
  const sec = Math.ceil(ms / 1000)
  const low = s.phase === 'answering' && sec <= 8
  const C = 2 * Math.PI * 26
  return (
    <div className={cn('relative size-16', low && !s.clock.frozen && 'animate-pulse')}>
      <svg viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#2b2439" strokeWidth="6" />
        <circle cx="32" cy="32" r="26" fill="none" stroke={low ? '#e5485f' : s.clock.frozen ? '#a98bff' : '#d4a73a'} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-semibold">{sec}</span>
    </div>
  )
}

function TopBar({ s, now, send }: { s: RoomSnapshot; now: () => number; send: Send }) {
  const phaseText: Record<string, string> = {
    drawing: 'El dado elige…', answering: 'Responde…', reveal: 'Revelación', between: 'Siguiente pregunta…', donation: 'Donación de excedentes', finished: 'Fin',
  }
  const pct = (s.qDone / s.totalQuestions) * 100
  return (
    <div className="panel rune-border flex items-center gap-4 px-4 py-3">
      <TimerRing s={s} now={now} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="gold-text font-display text-xl font-black">
            {s.question ? `Pregunta ${Math.min(s.qDone + 1, s.totalQuestions)}` : 'El Códice'} <span className="text-parch-dim">/ {s.totalQuestions}</span>
          </span>
          <span className="font-display text-xs uppercase tracking-widest text-parch-dim">{phaseText[s.phase]}</span>
          {s.cardsLocked && <span className="rounded bg-infernal/20 px-2 py-0.5 text-xs text-infernal">arcanos desvanecidos</span>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-600"><div className="h-full bg-gradient-to-r from-gold to-infernal transition-all duration-700" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="hidden text-right text-xs text-parch-dim sm:block">
        Sala <b className="font-mono tracking-widest text-gold">{s.code}</b>
        <br />
        mazo: {s.piles.played} jugadas · {s.piles.retired} retiradas
      </div>
      {s.me.isHost && (
        <Button size="icon" variant="ghost" aria-label={s.paused ? 'Reanudar' : 'Pausar'} onClick={() => send({ t: 'host', action: s.paused ? 'resume' : 'pause' })}>
          {s.paused ? <Play size={16} /> : <Pause size={16} />}
        </Button>
      )}
    </div>
  )
}

// ───────────── pregunta ─────────────
function QuestionPanel({ s, send, now }: { s: RoomSnapshot; send: Send; now: () => number }) {
  const q = s.question
  const root = useRef<HTMLDivElement>(null)
  const me = s.teams.find((t) => t.id === s.me.teamId)
  const answerer = s.teams.find((t) => t.id === q?.teamId)
  const myTurn = !!q && q.teamId === me?.id && s.phase === 'answering' && !s.pending && !s.paused

  useGSAP(
    () => {
      if (!q) return
      gsap.from('.q-text', { y: 18, opacity: 0, duration: 0.6, ease: 'power2.out' })
      gsap.from('.q-opt', { x: -26, opacity: 0, duration: 0.45, stagger: 0.08, delay: 0.15, ease: 'power2.out' })
    },
    { scope: root, dependencies: [q?.index, q?.attempt, q?.text] },
  )
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [q?.index, q?.attempt, q?.text])

  if (!q || s.phase === 'between')
    return (
      <div className="panel flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <div className="gold-text font-display text-3xl font-black">{s.qDone === 0 ? 'El Códice se abre' : 'El Códice pasa la página…'}</div>
        <p className="mt-2 text-parch-dim">{s.qDone === 0 ? 'Cada líder tiene sus arcanos boca abajo.' : `${s.qDone} de ${s.totalQuestions} fragmentos descifrados.`}</p>
      </div>
    )
  const reveal = s.phase === 'reveal'
  return (
    <div ref={root} className="panel rune-border p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={q.source} week={q.week} />
        {q.topic && <span className="text-xs uppercase tracking-widest text-parch-dim">{q.topic}</span>}
        <span className="ml-auto rounded-full border border-gold/30 px-3 py-0.5 font-display text-xs uppercase tracking-widest text-gold">
          {q.attempt === 1 ? `Vale ${s.settings.pointsFirst} pts` : `Segunda oportunidad · ${s.settings.pointsSecond} pt`}
        </span>
      </div>
      {s.phase === 'drawing' ? (
        <div className="py-16 text-center font-display text-2xl text-gold">El dado rueda por el Códice…</div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            {answerer && <Sigil index={answerer.sigil} color={answerer.color} size={40} />}
            <div className="font-display text-sm uppercase tracking-widest" style={{ color: answerer?.color }}>
              {myTurn ? '¡Tu equipo responde!' : `${answerer?.name ?? ''} responde`}
              {q.redirectedFrom && <span className="ml-2 text-xs text-celestial">(redirigida por {s.teams.find((t) => t.id === q.redirectedFrom)?.name})</span>}
            </div>
          </div>
          <h2 className="q-text mt-3 font-sans text-2xl font-semibold leading-snug tracking-normal sm:text-[1.7rem]">{q.text}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {q.options.map((o, i) => {
              const isCorrect = reveal && q.correctIndex === i
              const isPicked = q.pickedIndex === i
              return (
                <button
                  key={i}
                  disabled={!myTurn}
                  onClick={() => (setPicked(i), send({ t: 'answer', option: i }))}
                  className={cn(
                    'q-opt flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg transition',
                    isCorrect ? 'border-ok bg-ok/15' : reveal && isPicked ? 'border-infernal bg-infernal/15' : picked === i ? 'border-gold bg-gold/15' : 'border-gold/25 bg-ink-800/70',
                    myTurn && 'cursor-pointer hover:-translate-y-0.5 hover:border-gold hover:bg-gold/10',
                    !myTurn && !reveal && 'opacity-90',
                  )}
                >
                  <span className="font-display text-xl font-black text-gold">{'ABCD'[i]}</span>
                  <span>{o}</span>
                  {isCorrect && <span className="ml-auto text-ok">✓</span>}
                </button>
              )
            })}
          </div>
          {reveal && (
            <div className="mt-5 rounded-lg border border-gold/20 bg-ink-800/70 p-4">
              <div className="font-display text-sm uppercase tracking-widest text-gold">
                {q.result === 'correct' || q.result === 'auto' ? `✔ ${answerer?.name} acierta` : q.result === 'timeout' ? '⌛ Se agotó el tiempo' : q.result === 'skipped' ? '↷ Pregunta saltada' : '✘ Respuesta incorrecta'}
                {q.awarded && <span className="ml-2 text-ok">+{q.awarded.points} → {s.teams.find((t) => t.id === q.awarded!.teamId)?.name}</span>}
              </div>
              {q.explanation && <p className="mt-1 text-parch-dim">{q.explanation}</p>}
              {q.awarded && <p className="mt-1 text-xs text-infernal">Ventana de «Rompe victoria» abierta…</p>}
            </div>
          )}
        </>
      )}
      <div className="sr-only">{now() > 0 && ''}</div>
    </div>
  )
}

// ───────────── equipos ─────────────
function TeamRail({ s }: { s: RoomSnapshot }) {
  const root = useRef<HTMLDivElement>(null)
  const sorted = useMemo(() => [...s.teams], [s.teams])
  return (
    <div ref={root} className="panel p-3">
      <h3 className="px-1 pb-2 font-display text-xs uppercase tracking-widest text-parch-dim">Cónclaves</h3>
      <div className="space-y-2">
        {sorted.map((t) => (
          <TeamRow key={t.id} t={t} s={s} />
        ))}
      </div>
    </div>
  )
}

function TeamRow({ t, s }: { t: PublicTeam; s: RoomSnapshot }) {
  const active = s.question?.teamId === t.id && s.phase === 'answering'
  const mine = s.me.teamId === t.id
  return (
    <div className={cn('rounded-xl border p-2.5 transition', active ? 'bg-white/5 shadow-[0_0_22px_var(--c)]' : 'bg-ink-800/50')} style={{ borderColor: active ? t.color : `${t.color}44`, ['--c' as any]: `${t.color}66` }}>
      <div className="flex items-center gap-2.5">
        <Sigil index={t.sigil} color={t.color} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-sm font-bold" style={{ color: t.color }}>{t.name}</span>
            {mine && <span className="rounded bg-gold/20 px-1 text-[10px] uppercase text-gold">tú</span>}
            {t.barachiel && <Sun size={13} className="text-gold" aria-label="Barachiel activo" />}
            {t.immune && <Shield size={13} className="text-celestial" aria-label="Protegido" />}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-parch-dim">
            {t.connected ? <Wifi size={11} className="text-ok" /> : <WifiOff size={11} className="text-infernal" />}
            {t.bot ? 'cultista' : t.userName} · {t.handCount} arcano{t.handCount === 1 ? '' : 's'}
          </div>
        </div>
        <div data-score-team={t.id} className="gold-text min-w-10 text-right font-display text-3xl font-black" style={{ color: '#f0d58a' }}>{t.score}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-1.5">
        {t.tokens.map((k) => <Pawn key={k.id} token={k} color={s.teams.find((x) => x.id === k.origin)?.color ?? t.color} size={24} owner={s.teams.find((x) => x.id === k.origin)?.name} />)}
        <span className="ml-auto flex">{Array.from({ length: Math.min(t.handCount, 7) }, (_, i) => <CardBack key={i} size="xs" className="-ml-[62px] !h-7 !w-5 first:ml-0 rounded-[3px]" />)}</span>
      </div>
    </div>
  )
}

// ───────────── mano ─────────────
function Hand({ s, send }: { s: RoomSnapshot; send: Send }) {
  const [sel, setSel] = useState<HandCard | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (sel && !s.hand.some((c) => c.id === sel.id)) setSel(null)
  }, [s.hand, sel])
  const cur = sel ? (s.hand.find((c) => c.id === sel.id) ?? sel) : null
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      gsap.from('.hand-card', { y: 90, opacity: 0, rotation: 8, duration: 0.7, stagger: 0.07, ease: 'back.out(1.3)' })
    },
    { scope: root, dependencies: [s.hand.length === 0] },
  )
  return (
    <div className="panel p-4" ref={root}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-xs uppercase tracking-widest text-parch-dim">Tus arcanos ({s.hand.length})</h3>
        <span className="text-xs text-parch-dim">{s.cardsLocked ? 'Los arcanos se han desvanecido' : 'Toca una carta para ver sus detalles y activarla'}</span>
      </div>
      <div className="flex min-h-[180px] flex-wrap gap-3">
        {s.hand.length === 0 && <p className="m-auto text-parch-dim">Tu mano está vacía.</p>}
        {s.hand.map((c) => (
          <button key={c.id} onClick={() => setSel(c)} className="hand-card transition-transform hover:-translate-y-3 hover:rotate-[-2deg]" aria-label={CARD_BY_KEY[c.key].name}>
            <ArcanaCard cardKey={c.key} size="sm" dim={!c.playable && CARD_BY_KEY[c.key].timing !== 'reactive'} />
            {c.playable && <span className="mt-1 block text-center text-[10px] font-semibold uppercase tracking-widest text-ok">jugable</span>}
            {CARD_BY_KEY[c.key].timing === 'reactive' && <span className="mt-1 block text-center text-[10px] uppercase tracking-widest text-chaos">reactiva</span>}
          </button>
        ))}
      </div>
      <Modal open={!!cur} onOpenChange={(o) => !o && setSel(null)} title={cur ? CARD_BY_KEY[cur.key].name : ''} className="w-[min(94vw,720px)]">
        {cur && (
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="flex justify-center"><ArcanaCard cardKey={cur.key} size="md" showText /></div>
            <div className="min-w-0 flex-1">
              <p className="text-lg">{CARD_BY_KEY[cur.key].text}</p>
              {!cur.playable ? (
                <p className="mt-4 rounded-lg border border-infernal/30 bg-infernal/10 p-3 text-parch">⚠ {cur.reason ?? 'No se puede jugar ahora'}</p>
              ) : (
                <div className="mt-4">
                  <ParamForm spec={cur.params} submitLabel="Activar arcano" busy={busy} onSubmit={(params) => (setBusy(true), send({ t: 'play_card', cardId: cur.id, params }), setSel(null), setTimeout(() => setBusy(false), 600))} />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ───────────── lateral: bitácora y diplomacia ─────────────
function SidePanel({ s, send }: { s: RoomSnapshot; send: Send }) {
  const [tab, setTab] = useState<'log' | 'chat'>('log')
  const [to, setTo] = useState<string>('all')
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const me = s.teams.find((t) => t.id === s.me.teamId)
  const items = tab === 'log' ? s.log : s.whispers
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, tab])
  const color = (id: string) => s.teams.find((t) => t.id === id)?.color
  const name = (id: string) => (id === 'all' ? 'todos' : (s.teams.find((t) => t.id === id)?.name ?? '?'))
  return (
    <div className="panel flex h-[420px] flex-col p-3">
      <div className="mb-2 flex gap-1">
        {(['log', 'chat'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 rounded-md py-1 font-display text-xs uppercase tracking-widest', tab === k ? 'bg-gold text-ink-950' : 'text-parch-dim hover:text-gold')}>
            {k === 'log' ? 'Bitácora' : `Susurros (${s.whispers.length})`}
          </button>
        ))}
      </div>
      <div ref={scroller} className="flex-1 space-y-1 overflow-y-auto pr-1 text-sm">
        {tab === 'log'
          ? s.log.map((l) => (
              <div key={l.seq} className={cn('leading-snug', l.kind === 'score' && 'text-parch', l.kind === 'warn' && 'text-infernal', l.kind === 'system' && 'italic text-parch-dim', l.kind === 'dice' && 'text-chaos', l.kind === 'card' && 'text-gold-soft', l.kind === 'question' && 'text-celestial', l.kind === 'token' && 'text-neutral-arc', l.kind === 'info' && 'text-parch-dim')}>
                {l.text}
              </div>
            ))
          : s.whispers.map((w, i) => (
              <div key={i} className="leading-snug">
                <b style={{ color: color(w.from) }}>{name(w.from)}</b>
                <span className="text-parch-dim"> → {name(w.to)}: </span>
                {w.text}
              </div>
            ))}
        {tab === 'chat' && s.whispers.length === 0 && <p className="text-parch-dim">Nadie ha susurrado todavía.</p>}
      </div>
      {tab === 'chat' && me && (
        <form className="mt-2 space-y-1.5" onSubmit={(e) => (e.preventDefault(), text.trim() && (send({ t: 'whisper', to, text }), setText('')))}>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full rounded-lg border border-gold/25 bg-ink-800 px-2 text-sm">
            <option value="all">A todos (proclamar)</option>
            {s.teams.filter((t) => t.id !== me.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex gap-2">
            <Input value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder="Susurra un pacto…" className="h-9" />
            <Button size="icon" type="submit" aria-label="Enviar"><Send size={15} /></Button>
          </div>
          {s.settings.whisperCost > 0 && <p className="text-[11px] text-infernal">Conversar con un equipo cuesta {s.settings.whisperCost} pt (una vez por equipo y pregunta).</p>}
        </form>
      )}
    </div>
  )
}

// ───────────── docente ─────────────
function HostBar({ s, send }: { s: RoomSnapshot; send: Send }) {
  const [team, setTeam] = useState('')
  const sel = team || s.teams[0]?.id
  return (
    <div className="panel p-3">
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-xs uppercase tracking-widest text-gold"><Gavel size={13} />Mesa del docente</h3>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="subtle" onClick={() => send({ t: 'host', action: s.paused ? 'resume' : 'pause' })}>{s.paused ? 'Reanudar' : 'Pausar'}</Button>
        <Button size="sm" variant="subtle" onClick={() => send({ t: 'host', action: 'next' })}><SkipForward size={13} />Adelantar</Button>
        <Button size="sm" variant="subtle" onClick={() => confirm('¿Descartar la pregunta actual?') && send({ t: 'host', action: 'skip' })}>Descartar pregunta</Button>
        <Button size="sm" variant="danger" onClick={() => confirm('¿Terminar la partida ahora?') && send({ t: 'host', action: 'end' })}><Square size={13} />Terminar</Button>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <select value={sel} onChange={(e) => setTeam(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-gold/25 bg-ink-800 px-2 text-sm">
          {s.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Button size="sm" variant="ghost" onClick={() => send({ t: 'host', action: 'adjust', teamId: sel, delta: -1 })}>−1</Button>
        <Button size="sm" variant="ghost" onClick={() => send({ t: 'host', action: 'adjust', teamId: sel, delta: 1 })}>+1</Button>
        <Button size="sm" variant="ghost" title="Un cultista toma el mando del equipo" onClick={() => confirm('¿Pasar este equipo a un autómata?') && send({ t: 'host', action: 'kick', teamId: sel })}>🤖</Button>
      </div>
    </div>
  )
}

// ───────────── donación ─────────────
function Donation({ s, send, now }: { s: RoomSnapshot; send: Send; now: () => number }) {
  const meId = s.me.teamId
  const excess = meId ? (s.donation?.excess[meId] ?? 0) : 0
  const done = meId ? s.donation?.submitted.includes(meId) : false
  const [alloc, setAlloc] = useState<Record<string, number>>({})
  const sum = Object.values(alloc).reduce((a, b) => a + b, 0)
  const ms = useRemaining(s.clock, now)
  return (
    <div className="panel rune-border p-7">
      <h2 className="gold-text text-3xl font-black">Donación de excedentes</h2>
      <p className="mt-1 text-parch-dim">Los equipos que superan {s.settings.scoreCap} puntos pueden donar el excedente. Lo que no se done se pierde. <span className="font-mono text-gold">{ms !== null ? Math.ceil(ms / 1000) : ''}s</span></p>
      <ul className="mt-4 space-y-1">
        {Object.entries(s.donation?.excess ?? {}).map(([id, n]) => {
          const t = s.teams.find((x) => x.id === id)!
          return <li key={id} style={{ color: t.color }}>{t.name}: excedente {n} {s.donation?.submitted.includes(id) ? '✓ decidido' : '· decidiendo…'}</li>
        })}
      </ul>
      {excess > 0 && !done && (
        <form className="mt-5 space-y-2" onSubmit={(e) => (e.preventDefault(), send({ t: 'donate', allocation: alloc }))}>
          {s.teams.filter((t) => t.id !== meId).map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <Sigil index={t.sigil} color={t.color} size={28} />
              <span className="flex-1" style={{ color: t.color }}>{t.name}</span>
              <Input type="number" min={0} max={excess} value={alloc[t.id] ?? 0} onChange={(e) => setAlloc({ ...alloc, [t.id]: Math.max(0, Number(e.target.value) || 0) })} className="w-20 text-center" />
            </div>
          ))}
          <Button type="submit" disabled={sum > excess} className="w-full">Donar {sum} de {excess}</Button>
        </form>
      )}
    </div>
  )
}
