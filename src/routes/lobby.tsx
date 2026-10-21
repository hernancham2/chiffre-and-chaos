import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Crown, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input, Label } from '#/components/ui/input'
import { requireAuth } from '#/lib/guard'
import { api } from '#/lib/utils'

export const Route = createFileRoute('/lobby')({
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: Lobby,
})

function Lobby() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [hostPlays, setHostPlays] = useState(false)
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api<any[]>('/rooms'), refetchInterval: 4000 })

  const create = useMutation({
    mutationFn: () => api<{ code: string }>('/rooms', { method: 'POST', json: { hostPlays } }),
    onSuccess: (r) => nav({ to: '/sala/$code', params: { code: r.code } }),
    onError: (e) => toast.error(e.message),
  })

  async function join(c: string) {
    const clean = c.trim().toUpperCase()
    if (!clean) return
    try {
      await api(`/rooms/${clean}`)
      nav({ to: '/sala/$code', params: { code: clean } })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel rune-border p-6">
        <h2 className="gold-text text-2xl font-black">Convocar un cónclave</h2>
        <p className="mt-1 text-parch-dim">Eres el docente: diriges la partida, lanzas el tiempo y resuelves disputas.</p>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-gold/20 p-3 hover:border-gold/50">
          <input type="checkbox" className="mt-1 size-4 accent-[#d4a73a]" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
          <span>
            <b className="font-display text-sm tracking-wide">También juego como líder</b>
            <span className="block text-sm text-parch-dim">Si lo dejas apagado, sólo diriges y observas la partida.</span>
          </span>
        </label>
        <Button size="lg" className="mt-5 w-full" onClick={() => create.mutate()} disabled={create.isPending}>
          <Crown size={18} />Crear sala
        </Button>
      </section>

      <section className="panel rune-border p-6">
        <h2 className="gold-text text-2xl font-black">Unirme con un código</h2>
        <form className="mt-4 flex gap-2" onSubmit={(e) => (e.preventDefault(), join(code))}>
          <div className="flex-1">
            <Label htmlFor="code">Código de sala</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABCDE" className="text-center font-mono text-xl tracking-[0.4em]" />
          </div>
          <Button type="submit" className="self-end" size="lg">Entrar</Button>
        </form>
        <h3 className="mt-6 text-sm uppercase tracking-widest text-parch-dim">Salas abiertas</h3>
        <ul className="mt-2 space-y-2">
          {rooms.data?.length === 0 && <li className="text-sm text-parch-dim">Nadie ha convocado un cónclave todavía.</li>}
          {rooms.data?.map((r) => (
            <li key={r.code} className="flex items-center justify-between rounded-lg border border-gold/15 bg-ink-800/60 px-3 py-2">
              <div>
                <span className="font-mono text-lg tracking-widest text-gold">{r.code}</span>
                <span className="ml-3 text-sm text-parch-dim">Docente: {r.host}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-parch-dim"><Users size={14} />{r.teams}/{r.max}</span>
                <Button size="sm" variant="ghost" onClick={() => join(r.code)}>Unirme</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
