import { useState } from 'react'
import type { ParamSpec } from '@shared/types'
import { CARD_BY_KEY } from '@shared/cards'
import { FACTION_STYLE } from '#/lib/card-art'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

/** Formulario genérico: el servidor describe los parámetros como listas de opciones. */
export function ParamForm({
  spec,
  submitLabel,
  onSubmit,
  busy,
}: {
  spec: ParamSpec[]
  submitLabel: string
  onSubmit: (params: Record<string, string[]>) => void
  busy?: boolean
}) {
  const [vals, setVals] = useState<Record<string, string[]>>({})
  const ok = spec.every((p) => {
    const n = (vals[p.key] ?? []).length
    return n >= p.min && n <= p.max
  })
  const toggle = (p: ParamSpec, v: string) =>
    setVals((cur) => {
      const now = cur[p.key] ?? []
      if (p.mode === 'one') return { ...cur, [p.key]: [v] }
      if (now.includes(v)) return { ...cur, [p.key]: now.filter((x) => x !== v) }
      if (now.length >= p.max) return cur
      return { ...cur, [p.key]: [...now, v] }
    })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSubmit(vals)
      }}
    >
      {spec.map((p) => {
        const chosen = vals[p.key] ?? []
        return (
          <fieldset key={p.key}>
            <legend className="mb-1.5 font-display text-xs uppercase tracking-widest text-parch-dim">
              {p.label}
              {p.mode === 'many' && <span className="ml-2 text-gold">{chosen.length}/{p.max}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {p.options.map((o) => {
                const on = chosen.includes(o.value)
                const accent = o.color ?? (o.faction ? FACTION_STYLE[o.faction as keyof typeof FACTION_STYLE]?.ring : undefined) ?? '#d4a73a'
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggle(p, o.value)}
                    className={cn('rounded-lg border-2 px-3 py-1.5 text-left transition', on ? 'bg-white/10 text-white' : 'text-parch hover:bg-white/5')}
                    style={{ borderColor: on ? accent : `${accent}55` }}
                    aria-pressed={on}
                  >
                    <span className="block leading-tight">{o.label}</span>
                    {o.hint && <span className="block text-xs text-parch-dim">{o.hint}</span>}
                  </button>
                )
              })}
              {p.options.length === 0 && <span className="text-sm text-parch-dim">—</span>}
            </div>
          </fieldset>
        )
      })}
      <Button type="submit" className="w-full" disabled={!ok || busy}>{submitLabel}</Button>
    </form>
  )
}

export function cardName(key: string) {
  return CARD_BY_KEY[key]?.name ?? key
}
