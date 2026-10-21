import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_SETTINGS, type GameSettings, type QuestionRow } from '@shared/types'
import { SourceBadge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Modal } from '#/components/ui/dialog'
import { Input, Label, Select, Textarea } from '#/components/ui/input'
import { requireAuth } from '#/lib/guard'
import { api, cn } from '#/lib/utils'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => requireAuth(context.queryClient, 'admin'),
  component: Admin,
})

const TABS = ['Preguntas', 'Ajustes del juego', 'Usuarios', 'Salas activas'] as const

function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Preguntas')
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<any>('/admin/stats'), refetchInterval: 8000 })
  return (
    <div>
      <h1 className="gold-text text-4xl font-black">Cámara del administrador</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Preguntas', stats.data?.questions],
          ['Activas', stats.data?.activeQuestions],
          ['Usuarios', stats.data?.users],
          ['Partidas', stats.data?.games],
          ['Salas vivas', stats.data?.rooms],
        ].map(([k, v]) => (
          <div key={k as string} className="panel px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-parch-dim">{k}</div>
            <div className="gold-text text-3xl font-black">{v ?? '–'}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2 border-b border-gold/15 pb-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-4 py-1.5 font-display text-xs uppercase tracking-widest transition', tab === t ? 'bg-gold text-ink-950' : 'text-parch-dim hover:text-gold')}>{t}</button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'Preguntas' && <Questions />}
        {tab === 'Ajustes del juego' && <Settings />}
        {tab === 'Usuarios' && <Users />}
        {tab === 'Salas activas' && <Rooms />}
      </div>
    </div>
  )
}

// ───────────── Preguntas ─────────────
const emptyQ = { text: '', options: ['', '', '', ''], correctIndex: 0, source: 'libre' as 'libre' | 'semanario', week: null as number | null, topic: '', explanation: '', active: true }

function Questions() {
  const qc = useQueryClient()
  const [source, setSource] = useState('')
  const [week, setWeek] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<(Partial<QuestionRow> & typeof emptyQ) | null>(null)
  const params = new URLSearchParams()
  if (source) params.set('source', source)
  if (week) params.set('week', week)
  if (q) params.set('q', q)
  const list = useQuery({ queryKey: ['admin', 'questions', source, week, q], queryFn: () => api<QuestionRow[]>(`/admin/questions?${params}`) })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin'] })
  }
  const toggle = useMutation({
    mutationFn: (r: QuestionRow) => api(`/admin/questions/${r.id}/active`, { method: 'PATCH', json: { active: !r.active } }),
    onSuccess: refresh,
  })
  const del = useMutation({
    mutationFn: (id: number) => api(`/admin/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => (toast.success('Pregunta eliminada'), refresh()),
  })
  const reseed = useMutation({
    mutationFn: () => api<{ added: number }>('/admin/questions/reseed', { method: 'POST' }),
    onSuccess: (r) => (toast.success(`${r.added} preguntas base restauradas`), refresh()),
  })

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Origen</Label><Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44"><option value="">Todos</option><option value="semanario">Semanario</option><option value="libre">Libre / general</option></Select></div>
        <div><Label>Semana</Label><Select value={week} onChange={(e) => setWeek(e.target.value)} className="w-28"><option value="">Todas</option>{[1, 2, 3, 4, 5, 6, 7].map((w) => <option key={w} value={w}>{w}</option>)}</Select></div>
        <div className="min-w-48 flex-1"><Label>Buscar</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Texto o tema…" /></div>
        <Button variant="ghost" onClick={() => reseed.mutate()} title="Vuelve a insertar las preguntas base que hayas borrado"><RefreshCw size={15} />Restaurar base</Button>
        <Button onClick={() => setEditing({ ...emptyQ })}><Plus size={16} />Nueva pregunta</Button>
      </div>
      <p className="mt-3 text-sm text-parch-dim">{list.data?.length ?? 0} preguntas</p>
      <div className="mt-2 space-y-2">
        {list.data?.map((r) => (
          <div key={r.id} className={cn('panel flex flex-wrap items-start gap-3 p-3', !r.active && 'opacity-50')}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={r.source} week={r.week} />
                {r.topic && <span className="text-xs uppercase tracking-widest text-parch-dim">{r.topic}</span>}
              </div>
              <p className="mt-1">{r.text}</p>
              <ol className="mt-1 grid gap-x-4 text-sm text-parch-dim sm:grid-cols-2">
                {r.options.map((o, i) => <li key={i} className={cn(i === r.correctIndex && 'font-semibold text-ok')}>{'ABCD'[i]}. {o}</li>)}
              </ol>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="subtle" onClick={() => toggle.mutate(r)}>{r.active ? 'Desactivar' : 'Activar'}</Button>
              <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing({ ...r, week: r.week ?? null } as any)}><Pencil size={15} /></Button>
              <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => confirm('¿Eliminar esta pregunta?') && del.mutate(r.id)}><Trash2 size={15} className="text-infernal" /></Button>
            </div>
          </div>
        ))}
      </div>
      {editing && <QuestionEditor initial={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  )
}

function QuestionEditor({ initial, onClose, onSaved }: { initial: Partial<QuestionRow> & typeof emptyQ; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const save = useMutation({
    mutationFn: () => {
      const body = { text: f.text, options: f.options, correctIndex: f.correctIndex, source: f.source, week: f.source === 'semanario' ? f.week : null, topic: f.topic, explanation: f.explanation, active: f.active }
      return f.id ? api(`/admin/questions/${f.id}`, { method: 'PUT', json: body }) : api('/admin/questions', { method: 'POST', json: body })
    },
    onSuccess: () => (toast.success('Pregunta guardada'), onSaved(), onClose()),
    onError: (e) => toast.error(e.message),
  })
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={f.id ? 'Editar pregunta' : 'Nueva pregunta'} className="w-[min(94vw,720px)]">
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
        <div><Label>Enunciado</Label><Textarea required value={f.text} onChange={(e) => set({ text: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Etiqueta de origen</Label>
            <Select value={f.source} onChange={(e) => set({ source: e.target.value as any, week: e.target.value === 'semanario' ? (f.week ?? 1) : null })}>
              <option value="semanario">📜 Semanario</option>
              <option value="libre">✦ Libre / general</option>
            </Select>
          </div>
          <div><Label>Semana</Label>
            <Select disabled={f.source !== 'semanario'} value={f.week ?? ''} onChange={(e) => set({ week: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((w) => <option key={w} value={w}>Semana {w}</option>)}
            </Select>
          </div>
          <div><Label>Tema</Label><Input value={f.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={80} /></div>
        </div>
        <div>
          <Label>Alternativas (marca la correcta)</Label>
          <div className="space-y-2">
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" className="size-4 accent-[#6fd08c]" checked={f.correctIndex === i} onChange={() => set({ correctIndex: i })} aria-label={`Correcta ${'ABCD'[i]}`} />
                <span className="w-5 font-display text-gold">{'ABCD'[i]}</span>
                <Input required value={o} onChange={(e) => set({ options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              </div>
            ))}
          </div>
        </div>
        <div><Label>Explicación (se muestra al revelar)</Label><Textarea value={f.explanation} onChange={(e) => set({ explanation: e.target.value })} className="min-h-16" /></div>
        <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#d4a73a]" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />Activa (entra en el mazo de preguntas)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={save.isPending}>Guardar</Button></div>
      </form>
    </Modal>
  )
}

// ───────────── Ajustes ─────────────
const FIELDS: { k: keyof GameSettings; label: string; hint?: string; min?: number; max?: number }[] = [
  { k: 'questionTimeSec', label: 'Tiempo por pregunta (s)', hint: 'Instructivo: 30', min: 5, max: 300 },
  { k: 'totalQuestions', label: 'Preguntas por partida', hint: 'Instructivo: 30', min: 3, max: 60 },
  { k: 'pointsFirst', label: 'Puntos 1.er equipo', hint: 'Instructivo: 2', min: 0, max: 10 },
  { k: 'pointsSecond', label: 'Puntos 2.º equipo', hint: 'Instructivo: 1', min: 0, max: 10 },
  { k: 'cardsPerTeam', label: 'Arcanos por equipo', hint: 'Instructivo: 7 (máx. 40 ÷ equipos)', min: 0, max: 10 },
  { k: 'tokensPerTeam', label: 'Integrantes (fichas) por equipo', hint: 'Mínimo 3', min: 3, max: 6 },
  { k: 'minTeams', label: 'Mínimo de equipos', hint: 'Mínimo 3', min: 3, max: 6 },
  { k: 'maxTeams', label: 'Máximo de equipos', hint: 'Máximo 6', min: 3, max: 6 },
  { k: 'whisperCost', label: 'Costo de conversar (pts)', hint: 'Instructivo: 1', min: 0, max: 5 },
  { k: 'unusedCardPenalty', label: 'Penalidad por carta sin usar', hint: 'Instructivo: 1', min: 0, max: 5 },
  { k: 'scoreCap', label: 'Tope de puntaje (donación)', hint: 'Instructivo: 20', min: 5, max: 100 },
  { k: 'reactionTimeSec', label: 'Tiempo de reacción a cartas (s)', min: 4, max: 60 },
  { k: 'revealSec', label: 'Tiempo de revelación (s)', min: 2, max: 20 },
]

function Settings() {
  const qc = useQueryClient()
  const cur = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<GameSettings>('/admin/settings') })
  const [s, setS] = useState<GameSettings>(DEFAULT_SETTINGS)
  useEffect(() => { if (cur.data) setS(cur.data) }, [cur.data])
  const save = useMutation({
    mutationFn: () => api('/admin/settings', { method: 'PUT', json: s }),
    onSuccess: () => (toast.success('Ajustes guardados (aplican a las salas nuevas)'), qc.invalidateQueries({ queryKey: ['admin', 'settings'] })),
    onError: (e) => toast.error(e.message),
  })
  return (
    <form className="panel p-6" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.k}>
            <Label>{f.label}</Label>
            <Input type="number" min={f.min} max={f.max} value={s[f.k] as number} onChange={(e) => setS({ ...s, [f.k]: Number(e.target.value) })} />
            {f.hint && <p className="mt-0.5 text-xs text-parch-dim">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-6">
        <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#d4a73a]" checked={s.allowBots} onChange={(e) => setS({ ...s, allowBots: e.target.checked })} />Permitir cultistas de ensayo (bots)</label>
        {(['semanario', 'libre'] as const).map((src) => (
          <label key={src} className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-[#d4a73a]" checked={s.sources.includes(src)} onChange={(e) => setS({ ...s, sources: e.target.checked ? [...new Set([...s.sources, src])] : s.sources.filter((x) => x !== src) })} />
            Incluir preguntas {src === 'semanario' ? 'de semanarios' : 'libres / generales'}
          </label>
        ))}
      </div>
      <div className="mt-6 flex gap-2"><Button type="submit" disabled={save.isPending || s.sources.length === 0}>Guardar ajustes</Button><Button type="button" variant="ghost" onClick={() => setS(DEFAULT_SETTINGS)}>Valores del instructivo</Button></div>
    </form>
  )
}

// ───────────── Usuarios ─────────────
function Users() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<any[]>('/admin/users') })
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api(`/admin/users/${id}/role`, { method: 'PUT', json: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-ink-700/60 font-display text-xs uppercase tracking-widest text-parch-dim"><tr><th className="p-3">Nombre</th><th className="p-3">Correo</th><th className="p-3">Rol</th><th className="p-3" /></tr></thead>
        <tbody>
          {list.data?.map((u) => (
            <tr key={u.id} className="border-t border-gold/10">
              <td className="p-3">{u.name}</td><td className="p-3 text-parch-dim">{u.email}</td>
              <td className="p-3"><span className={cn('rounded-full px-2 py-0.5 text-xs uppercase tracking-widest', u.role === 'admin' ? 'bg-gold/20 text-gold' : 'bg-ink-600')}>{u.role}</span></td>
              <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => setRole.mutate({ id: u.id, role: u.role === 'admin' ? 'player' : 'admin' })}>{u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────── Salas ─────────────
function Rooms() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'rooms'], queryFn: () => api<any[]>('/admin/rooms'), refetchInterval: 3000 })
  const close = useMutation({ mutationFn: (c: string) => api(`/admin/rooms/${c}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'rooms'] }) })
  if (!list.data?.length) return <p className="text-parch-dim">No hay salas activas.</p>
  return (
    <div className="space-y-2">
      {list.data.map((r) => (
        <div key={r.code} className="panel flex flex-wrap items-center gap-4 p-3">
          <span className="font-mono text-lg tracking-widest text-gold">{r.code}</span>
          <span className="text-parch-dim">Docente {r.host}</span>
          <span>{r.phase}</span><span>{r.teams} equipos</span><span>{r.qDone}/{r.total}</span><span>{r.online} conectados</span>
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => confirm(`¿Cerrar la sala ${r.code}?`) && close.mutate(r.code)}>Cerrar</Button>
        </div>
      ))}
    </div>
  )
}
