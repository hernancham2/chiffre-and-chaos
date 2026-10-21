import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { CARDS, FACTION_LABEL, type Faction } from '@shared/cards'
import { ArcanaCard } from '#/components/ArcanaCard'
import { Modal } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/grimorio')({ component: Grimorio })

const RULES = [
  'El examen consta de 30 preguntas. El docente dirige; sólo los líderes juegan.',
  'Cada líder recibe 7 arcanos boca abajo (6 si hay 6 cónclaves, porque el mazo tiene 40).',
  'Un dado elige el equipo que responde, con 30 segundos. Acierto: +2. Si falla, otro dado elige a otro equipo: acierto +1. Si falla también, la pregunta se descarta.',
  'Durante esos 30 segundos todos los equipos pueden jugar cartas.',
  'Al terminar la pregunta 28 se retiran los arcanos: cada carta sin usar resta 1 punto.',
  'Los equipos que superen 20 puntos pueden donar el excedente a otros equipos.',
  'Si los equipos conversan entre ellos se descuenta 1 punto.',
]

function Grimorio() {
  const [f, setF] = useState<Faction | 'all'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = useMemo(
    () => CARDS.filter((c) => (f === 'all' || c.faction === f) && (c.name + c.text).toLowerCase().includes(q.toLowerCase())),
    [f, q],
  )
  const sel = CARDS.find((c) => c.key === open)
  return (
    <div>
      <h1 className="gold-text text-4xl font-black">Grimorio de los Arcanos</h1>
      <p className="mt-2 max-w-3xl text-parch-dim">Los 40 Arcanos del Códice, según el instructivo del examen. Celestiales, infernales, arcanos neutros y cartas del caos.</p>
      <div className="panel mt-5 p-4">
        <h2 className="text-sm uppercase tracking-widest text-gold">Reglas del cónclave</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-parch-dim">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(['all', 'celestial', 'infernal', 'neutral', 'chaos'] as const).map((x) => (
          <button key={x} onClick={() => setF(x)} className={cn('rounded-full border px-4 py-1 font-display text-xs uppercase tracking-widest transition', f === x ? 'border-gold bg-gold text-ink-950' : 'border-gold/30 text-parch-dim hover:border-gold/70')}>
            {x === 'all' ? 'Todos' : FACTION_LABEL[x]}
          </button>
        ))}
        <Input className="ml-auto w-56" placeholder="Buscar arcano…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] justify-items-center gap-6">
        {list.map((c) => (
          <button key={c.key} onClick={() => setOpen(c.key)} className="group transition-transform hover:-translate-y-1.5 hover:rotate-1" aria-label={c.name}>
            <ArcanaCard cardKey={c.key} size="md" />
          </button>
        ))}
      </div>
      <Modal open={!!sel} onOpenChange={(o) => !o && setOpen(null)} title={sel ? `${sel.n}. ${sel.name}` : ''} className="w-[min(94vw,520px)]">
        {sel && (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <ArcanaCard cardKey={sel.key} size="lg" />
            <div>
              <p className="text-lg leading-relaxed">{sel.text}</p>
              <p className="mt-3 text-sm text-parch-dim">
                {FACTION_LABEL[sel.faction]}
                {sel.timing === 'reactive' && ' · reactiva'}
                {sel.timing === 'answering_team' && ' · sólo el equipo que responde'}
                {sel.timing === 'post_award' && ' · tras otorgar puntos'}
                {sel.dice && ' · usa dado'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
