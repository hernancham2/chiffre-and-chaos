import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { GameResult } from '@shared/types'
import { ResultsView } from '#/components/ResultsView'
import { requireAuth } from '#/lib/guard'
import { api } from '#/lib/utils'

export const Route = createFileRoute('/resultados/$id')({
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: Page,
})

function Page() {
  const { id } = Route.useParams()
  const { data, error } = useQuery({ queryKey: ['result', id], queryFn: () => api<GameResult>(`/results/${id}`) })
  if (error) return <p className="text-infernal">{error.message}</p>
  if (!data) return <p className="text-parch-dim">Cargando…</p>
  return (
    <div>
      <h1 className="gold-text mb-6 text-4xl font-black">Resultados · {data.code}</h1>
      <ResultsView result={data} />
    </div>
  )
}
