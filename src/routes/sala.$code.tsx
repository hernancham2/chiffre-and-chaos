import { Link, createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { GameView } from '#/components/room/GameView'
import { RoomLobby } from '#/components/room/RoomLobby'
import { ResultsView } from '#/components/ResultsView'
import { Button } from '#/components/ui/button'
import { requireAuth } from '#/lib/guard'
import { useRoom } from '#/lib/useRoom'

export const Route = createFileRoute('/sala/$code')({
  beforeLoad: ({ context }) => requireAuth(context.queryClient),
  component: RoomPage,
})

function RoomPage() {
  const { code } = Route.useParams()
  const { state, status, send, now } = useRoom(code.toUpperCase())

  if (status === 'missing' || status === 'kicked')
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="gold-text text-3xl font-black">{status === 'kicked' ? 'Fuiste retirado de la sala' : 'Esa sala no existe'}</h1>
        <p className="mt-2 text-parch-dim">Puede haberse cerrado o el código es incorrecto.</p>
        <Link to="/lobby"><Button className="mt-6">Volver a las salas</Button></Link>
      </div>
    )
  if (!state)
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-parch-dim">
        <Loader2 className="animate-spin" /> Abriendo las puertas del Códice…
      </div>
    )
  return (
    <div>
      {status === 'reconnecting' && <div className="mb-3 rounded-lg border border-infernal/40 bg-infernal/10 px-4 py-2 text-center text-sm">Conexión perdida. Reintentando…</div>}
      {state.phase === 'lobby' && <RoomLobby s={state} send={send} />}
      {state.phase !== 'lobby' && state.phase !== 'finished' && <GameView s={state} send={send} now={now} />}
      {state.phase === 'finished' && state.result && (
        <div>
          <div className="mb-6 text-center">
            <p className="font-display text-xs uppercase tracking-[0.5em] text-infernal">El Códice se ha cerrado</p>
            <h1 className="gold-text text-5xl font-black">Resultados finales</h1>
          </div>
          <ResultsView result={state.result} />
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/lobby"><Button variant="ghost">Volver a las salas</Button></Link>
            <Link to="/historial"><Button>Ver historial</Button></Link>
          </div>
        </div>
      )}
    </div>
  )
}
