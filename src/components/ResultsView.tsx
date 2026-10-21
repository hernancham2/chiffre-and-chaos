import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Trophy } from 'lucide-react'
import { useRef } from 'react'
import type { GameResult } from '@shared/types'
import { cn } from '#/lib/utils'

export function ResultsView({ result }: { result: GameResult }) {
  const root = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      gsap.from('.pod', { y: 80, opacity: 0, duration: 0.8, stagger: 0.18, ease: 'back.out(1.5)' })
      gsap.from('.score-n', { textContent: 0, duration: 1.6, ease: 'power2.out', snap: { textContent: 1 }, stagger: 0.1 })
      gsap.from('.row-in', { x: -30, opacity: 0, duration: 0.5, stagger: 0.07, delay: 0.5 })
    },
    { scope: root },
  )
  const top = result.teams.slice(0, 3)
  const order = top.length === 3 ? [top[1], top[0], top[2]] : top
  const place = (t: (typeof top)[number]) => result.teams.indexOf(t)
  const heights = ['h-40', 'h-52', 'h-32']
  return (
    <div ref={root}>
      <div className="mb-8 flex items-end justify-center gap-3 sm:gap-6">
        {order.map((t, i) => {
          const p = place(t)
          return (
            <div key={t.teamId} className="pod flex w-1/3 max-w-52 flex-col items-center">
              <Trophy className={cn(p === 0 ? 'text-gold' : p === 1 ? 'text-parch-dim' : 'text-[#b9793c]')} size={p === 0 ? 40 : 28} />
              <div className="mt-1 text-center font-display text-sm font-bold" style={{ color: t.color }}>{t.name}</div>
              <div className="text-xs text-parch-dim">{t.userName}</div>
              <div className={cn('mt-2 flex w-full flex-col items-center justify-start rounded-t-xl border border-gold/30 pt-3', top.length === 3 ? heights[i] : 'h-40')} style={{ background: `linear-gradient(180deg, ${t.color}55, transparent)` }}>
                <span className="score-n gold-text text-4xl font-black">{t.finalScore}</span>
                <span className="mt-1 font-display text-xs uppercase tracking-widest text-parch-dim">{p + 1}.º lugar</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="space-y-4">
        {result.teams.map((t, i) => (
          <div key={t.teamId} className="row-in panel p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-xl text-parch-dim">#{i + 1}</span>
              <span className="size-3 rounded-full" style={{ background: t.color }} />
              <b className="font-display text-lg" style={{ color: t.color }}>{t.name}</b>
              <span className="text-sm text-parch-dim">líder: {t.userName}</span>
              <span className="ml-auto text-right">
                <span className="gold-text text-3xl font-black">{t.finalScore}</span>
                <span className="block text-xs text-parch-dim">
                  {t.rawScore !== t.finalScore || t.donated ? `bruto ${t.rawScore}${t.donated ? ` · donó ${t.donated}` : ''} · ` : ''}aciertos {t.correct}
                </span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.tokens.map((k, j) => (
                <span key={j} className={cn('rounded-md border px-2.5 py-1 text-sm', k.status === 'out' ? 'border-infernal/40 text-parch-dim' : 'border-gold/25')}>
                  {k.name}
                  {k.origin !== t.name && <em className="text-parch-dim"> ({k.origin})</em>}
                  <b className="ml-2 text-gold">{k.grade}</b>
                  {k.status === 'out' && <span className="ml-1 text-infernal"> retirado</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-parch-dim">
        El puntaje del equipo es la calificación de todos sus miembros; los retirados conservan la nota que tenía su equipo al salir. Tope: máximo del examen.
      </p>
    </div>
  )
}
