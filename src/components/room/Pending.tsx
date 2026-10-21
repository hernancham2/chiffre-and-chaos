import { Hourglass } from 'lucide-react'
import { useState } from 'react'
import { CARD_BY_KEY } from '@shared/cards'
import type { ClientMsg, PublicPending, RoomSnapshot } from '@shared/types'
import { ArcanaCard } from '#/components/ArcanaCard'
import { Button } from '#/components/ui/button'
import { Modal } from '#/components/ui/dialog'
import { useRemaining } from '#/lib/useRoom'
import { cn } from '#/lib/utils'
import { ParamForm } from './ParamForm'

export function Countdown({ deadline, now }: { deadline: number; now: () => number }) {
  const ms = useRemaining({ deadline, remainingMs: null, frozen: false }, now) ?? 0
  return <span className="font-mono tabular-nums text-gold">{Math.ceil(ms / 1000)}s</span>
}

export function PendingLayer({ s, send, now }: { s: RoomSnapshot; send: (m: ClientMsg) => void; now: () => number }) {
  const p = s.pending
  if (!p || p.kind === 'delay') return null
  const team = (id: string) => s.teams.find((t) => t.id === id)
  const respond = (choice: string, extra: Partial<Extract<ClientMsg, { t: 'respond' }>> = {}) => send({ t: 'respond', pendingId: p.id, choice, ...extra })
  const meId = s.me.teamId

  const waiting = (who: string, what: string) => (
    <div className="pointer-events-none fixed left-1/2 top-20 z-[55] -translate-x-1/2 rounded-full border border-gold/40 bg-ink-800/95 px-5 py-2 text-sm shadow-xl">
      <Hourglass size={14} className="mr-2 inline text-gold" />
      {what} <b style={{ color: team(who)?.color }}>{team(who)?.name}</b> · <Countdown deadline={p.deadline} now={now} />
    </div>
  )

  switch (p.kind) {
    case 'reaction': {
      const mine = meId === p.victimTeamId
      if (!mine) return waiting(p.victimTeamId, 'Decide si se protege:')
      return (
        <Modal open hideClose title="¡Un arcano te ataca!" description={`${team(p.sourceTeamId)?.name} activa «${CARD_BY_KEY[p.cardKey]?.name}» contra tu equipo.`} className="w-[min(94vw,520px)]">
          <div className="flex justify-center"><ArcanaCard cardKey={p.cardKey} size="md" /></div>
          <p className="mt-3 text-center text-sm text-parch-dim">Tienes <Countdown deadline={p.deadline} now={now} /> para reaccionar.</p>
          <div className="mt-4 grid gap-2">
            {p.shield && <Button variant="celestial" onClick={() => respond('shield')}>🛡 Escudo de la misericordia (gratis)</Button>}
            {p.gamble && <Button variant="subtle" onClick={() => respond('gamble')}>🎲 Apostador de vida (par: gratis · impar: −2)</Button>}
            <Button variant="ghost" onClick={() => respond('accept')}>Aceptar el destino</Button>
          </div>
        </Modal>
      )
    }
    case 'dice_window': {
      if (!p.canInvalidate)
        return (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-[55] -translate-x-1/2 rounded-full border border-chaos/40 bg-ink-800/95 px-5 py-2 text-sm">
            Lanzamiento: <b className="text-gold">{p.value}</b> · ventana de «Segunda opinión» <Countdown deadline={p.deadline} now={now} />
          </div>
        )
      return (
        <div className="fixed bottom-6 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-xl border-2 border-chaos bg-ink-800 px-5 py-3 shadow-2xl">
          <span>Salió <b className="text-gold">{p.value}</b>. ¿Invalidar el lanzamiento? <Countdown deadline={p.deadline} now={now} /></span>
          <Button variant="subtle" onClick={() => respond('invalidate')}>🔁 Segunda opinión</Button>
        </div>
      )
    }
    case 'deny_vote': {
      if (!p.canDeny) return waiting(p.sourceTeamId, 'Los demás equipos votan sobre el Dado caridad de')
      return (
        <Modal open hideClose title="Dado caridad" description={`${team(p.sourceTeamId)?.name} ganará puntos con el Dado caridad. Si algún equipo lo niega, pierde 2 puntos.`} className="w-[min(94vw,460px)]">
          <p className="text-center text-sm text-parch-dim"><Countdown deadline={p.deadline} now={now} /></p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => respond('deny')}>Negar</Button>
            <Button variant="ghost" onClick={() => respond('allow')}>Permitir</Button>
          </div>
        </Modal>
      )
    }
    case 'input': {
      if (p.spec) return <InputModal p={p} respond={(params) => respond('submit', { params })} now={now} />
      return waiting(p.teamId, `«${CARD_BY_KEY[p.cardKey]?.name}» · elige`)
    }
    case 'side_question': {
      const mine = meId === p.targetTeamId
      if (!mine || !p.options)
        return (
          <div className="fixed left-1/2 top-20 z-[55] w-[min(94vw,520px)] -translate-x-1/2 rounded-xl border border-gold/40 bg-ink-800/95 p-4 text-center shadow-xl">
            <div className="text-xs uppercase tracking-widest text-gold">{team(p.askerTeamId)?.name} interroga a {team(p.targetTeamId)?.name}</div>
            <p className="mt-1">{p.text}</p>
            <div className="mt-1 text-sm text-parch-dim"><Countdown deadline={p.deadline} now={now} /></div>
          </div>
        )
      return (
        <Modal open hideClose title="¡Te interrogan!" description={`${team(p.askerTeamId)?.name} te lanza una pregunta con El acertado. Si fallas, ganan 2 puntos.`} className="w-[min(94vw,620px)]">
          <p className="text-lg">{p.text}</p>
          <p className="mt-1 text-right text-sm"><Countdown deadline={p.deadline} now={now} /></p>
          <div className="mt-3 grid gap-2">
            {p.options.map((o, i) => (
              <Button key={i} variant="ghost" className="h-auto justify-start whitespace-normal py-2 text-left font-sans text-base normal-case" onClick={() => respond('answer', { option: i })}>
                <b className="mr-2 text-gold">{'ABCD'[i]}</b>{o}
              </Button>
            ))}
          </div>
        </Modal>
      )
    }
  }
}

function InputModal({ p, respond, now }: { p: Extract<PublicPending, { kind: 'input' }>; respond: (params: Record<string, string[]>) => void; now: () => number }) {
  const [sent, setSent] = useState(false)
  return (
    <Modal open hideClose title={p.title} className="w-[min(94vw,680px)]">
      <p className="mb-3 text-sm text-parch-dim">Decide antes de que se agote el tiempo: <Countdown deadline={p.deadline} now={now} /></p>
      {p.peek && (
        <div className="mb-4">
          <div className="mb-1 font-display text-xs uppercase tracking-widest text-gold">Cartas reveladas</div>
          <div className="flex flex-wrap gap-2">{p.peek.map((k, i) => <ArcanaCard key={i} cardKey={k} size="xs" />)}</div>
        </div>
      )}
      <ParamForm spec={p.spec!} submitLabel="Confirmar" busy={sent} onSubmit={(v) => (setSent(true), respond(v), setTimeout(() => setSent(false), 800))} />
    </Modal>
  )
}

export function clsx(...a: string[]) {
  return cn(...a)
}
