import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '#/lib/guard'
import { api } from '#/lib/utils'

export const Route = createFileRoute('/historial')({
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: History,
})

function History() {
  const { data, isLoading } = useQuery({ queryKey: ['results'], queryFn: () => api<any[]>('/results') })
  return (
    <div>
      <h1 className="gold-text text-4xl font-black">Historial de cónclaves</h1>
      <div className="mt-6 space-y-3">
        {isLoading && <p className="text-parch-dim">Consultando el Códice…</p>}
        {data?.length === 0 && <p className="text-parch-dim">Aún no has terminado ninguna partida.</p>}
        {data?.map((r) => (
          <Link key={r.id} to="/resultados/$id" params={{ id: String(r.id) }} className="panel block p-4 transition hover:border-gold/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-gold">{r.code}</span>
              <span className="text-sm text-parch-dim">{new Date(r.finishedAt).toLocaleString()}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {r.teams.map((t: any, i: number) => (
                <span key={t.teamId} style={{ color: t.color }}>{i === 0 && '🏆 '}{t.name} <b>{t.finalScore}</b></span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
