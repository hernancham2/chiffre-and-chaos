import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Bot, Check, Copy, Play, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { TEAM_COLORS, type ClientMsg, type RoomSnapshot } from '@shared/types'
import { Pawn, SIGIL_COUNT, Sigil } from '#/components/Pieces'
import { Button } from '#/components/ui/button'
import { Input, Label } from '#/components/ui/input'
import { cn } from '#/lib/utils'

export function RoomLobby({ s, send }: { s: RoomSnapshot; send: (m: ClientMsg) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const me = s.teams.find((t) => t.id === s.me.teamId)
  const need = s.settings.minTeams
  const ready = s.teams.length >= need && s.teams.every((t) => t.connected)

  useGSAP(
    () => {
      gsap.from('.slot', { y: 30, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' })
    },
    { scope: root },
  )

  const link = `${location.origin}/sala/${s.code}`
  return (
    <div ref={root} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="panel rune-border flex flex-wrap items-center gap-4 p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-parch-dim">Código de sala</div>
            <div className="gold-text font-mono text-5xl font-black tracking-[0.3em]">{s.code}</div>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(link)
              setCopied(true)
              toast.success('Enlace copiado')
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}Copiar enlace
          </Button>
          <div className="ml-auto text-right text-sm text-parch-dim">
            Docente: <b className="text-parch">{s.hostName}</b>
            <br />
            {s.teams.length}/{s.settings.maxTeams} líderes · mínimo {need}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: s.settings.maxTeams }, (_, i) => {
            const t = s.teams[i]
            if (!t)
              return (
                <div key={i} className="slot flex min-h-28 items-center justify-center rounded-xl border-2 border-dashed border-gold/15 text-parch-dim/60">
                  Asiento {i + 1} · libre
                </div>
              )
            const mine = t.id === s.me.teamId
            return (
              <div key={t.id} className={cn('slot panel relative p-4', mine && 'ring-1 ring-gold/60')} style={{ borderColor: `${t.color}77` }}>
                <div className="flex items-center gap-3">
                  <Sigil index={t.sigil} color={t.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-bold" style={{ color: t.color }}>{t.name}</div>
                    <div className="truncate text-xs text-parch-dim">
                      {t.bot ? 'Cultista de ensayo' : t.userName} · <span className={t.connected ? 'text-ok' : 'text-infernal'}>{t.connected ? 'conectado' : 'desconectado'}</span>
                    </div>
                  </div>
                  {s.me.isHost && (
                    <button aria-label="Retirar" className="text-parch-dim hover:text-infernal" onClick={() => send({ t: 'remove_team', teamId: t.id })}>
                      <X size={18} />
                    </button>
                  )}
                </div>
                <div className="mt-3 flex gap-1.5">{t.tokens.map((k) => <Pawn key={k.id} token={k} color={t.color} size={26} />)}</div>
                <div className="mt-1 text-[11px] text-parch-dim">{t.tokens.map((k) => k.name).join(' · ')}</div>
              </div>
            )
          })}
        </div>

        {me && <TeamEditor key={me.id} s={s} send={send} />}
        {!me && <p className="panel mt-5 p-4 text-parch-dim">Observas esta sala {s.me.isHost ? 'como docente' : '(no hay asiento libre)'}.</p>}
      </div>

      <aside className="space-y-4">
        <div className="panel p-5">
          <h3 className="gold-text text-lg font-bold">Mesa del docente</h3>
          {s.me.isHost ? (
            <HostSettings s={s} send={send} />
          ) : (
            <p className="mt-2 text-sm text-parch-dim">
              Duración: {s.settings.totalQuestions} preguntas · {s.settings.questionTimeSec}s cada una. Fuentes: {s.settings.sources.map((x) => (x === 'semanario' ? 'semanarios' : 'libres')).join(' y ')}.
            </p>
          )}
          {s.me.isHost && (
            <div className="mt-4 space-y-2">
              {s.settings.allowBots && (
                <Button variant="ghost" className="w-full" onClick={() => send({ t: 'add_bot' })} disabled={s.teams.length >= s.settings.maxTeams}>
                  <Bot size={16} />Añadir cultista de ensayo
                </Button>
              )}
              <Button size="lg" className="w-full" disabled={!ready} onClick={() => send({ t: 'start' })}>
                <Play size={18} />Abrir el Códice
              </Button>
              {!ready && <p className="text-center text-xs text-parch-dim">Se necesitan {need} líderes conectados para comenzar.</p>}
            </div>
          )}
          {!s.me.isHost && <p className="mt-4 text-center text-sm text-parch-dim">Esperando a que el docente abra el Códice…</p>}
        </div>
        <div className="panel p-5 text-sm text-parch-dim">
          <h3 className="mb-1 font-display text-xs uppercase tracking-widest text-gold">Recuerda</h3>
          Cada líder juega por su equipo de {s.teams[0]?.tokens.length ?? 3} integrantes. Los dados usan un generador criptográfico. Conversar con otro equipo cuesta {s.settings.whisperCost} punto.
        </div>
      </aside>
    </div>
  )
}

function TeamEditor({ s, send }: { s: RoomSnapshot; send: (m: ClientMsg) => void }) {
  const me = s.teams.find((t) => t.id === s.me.teamId)!
  const [name, setName] = useState(me.name)
  const [toks, setToks] = useState(me.tokens.map((k) => k.name))
  const takenColors = new Set(s.teams.filter((t) => t.id !== me.id).map((t) => t.color))
  const takenSigils = new Set(s.teams.filter((t) => t.id !== me.id).map((t) => t.sigil))
  return (
    <div className="panel mt-5 p-5">
      <h3 className="gold-text text-lg font-bold">Tu cónclave</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="tn">Nombre del equipo</Label>
          <Input id="tn" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => send({ t: 'team_update', name })} />
          <Label className="mt-3">Integrantes (fichas)</Label>
          <div className="space-y-1.5">
            {toks.map((n, i) => (
              <Input key={i} value={n} maxLength={16} onChange={(e) => setToks(toks.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => send({ t: 'team_update', tokenNames: toks })} />
            ))}
          </div>
        </div>
        <div>
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLORS.map((c) => (
              <button key={c} disabled={takenColors.has(c)} onClick={() => send({ t: 'team_update', color: c })} aria-label={`Color ${c}`} className={cn('size-9 rounded-full border-2 transition disabled:opacity-20', me.color === c ? 'scale-110 border-white' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
          <Label className="mt-4">Sello</Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: SIGIL_COUNT }, (_, i) => (
              <button key={i} disabled={takenSigils.has(i)} onClick={() => send({ t: 'team_update', sigil: i })} aria-label={`Sello ${i + 1}`} className={cn('rounded-full transition disabled:opacity-20', me.sigil === i && 'ring-2 ring-white')}>
                <Sigil index={i} color={me.color} size={34} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HostSettings({ s, send }: { s: RoomSnapshot; send: (m: ClientMsg) => void }) {
  const set = (patch: Partial<RoomSnapshot['settings']>) => send({ t: 'settings', patch })
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Preguntas</Label>
          <Input type="number" min={3} max={60} defaultValue={s.settings.totalQuestions} onBlur={(e) => set({ totalQuestions: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Segundos</Label>
          <Input type="number" min={5} max={300} defaultValue={s.settings.questionTimeSec} onBlur={(e) => set({ questionTimeSec: Number(e.target.value) })} />
        </div>
      </div>
      <div className="space-y-1.5">
        {(['semanario', 'libre'] as const).map((src) => (
          <label key={src} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[#d4a73a]" checked={s.settings.sources.includes(src)} onChange={(e) => {
              const next = e.target.checked ? [...new Set([...s.settings.sources, src])] : s.settings.sources.filter((x) => x !== src)
              if (next.length) set({ sources: next })
            }} />
            Preguntas {src === 'semanario' ? '📜 de semanarios' : '✦ libres / generales'}
          </label>
        ))}
      </div>
    </div>
  )
}
