import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext, useNavigate } from '@tanstack/react-router'
import { LogOut, ScrollText, ShieldCheck, Swords, History } from 'lucide-react'
import { Toaster } from 'sonner'
import { Embers, Logo } from '#/components/Pieces'
import { Button } from '#/components/ui/button'
import { authClient } from '#/lib/auth-client'
import { meQuery } from '#/lib/queries'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg py-24 text-center">
      <h1 className="gold-text text-4xl font-black">Página perdida en el Códice</h1>
      <p className="mt-3 text-parch-dim">Esa ruta no existe.</p>
      <Link to="/" className="mt-6 inline-block text-gold underline">Volver al inicio</Link>
    </div>
  ),
})

function Header() {
  const { data: me } = useQuery(meQuery)
  const qc = useQueryClient()
  const nav = useNavigate()
  const link = 'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-xs uppercase tracking-widest text-parch-dim transition hover:text-gold'
  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link to="/" className="mr-3 flex items-center gap-2">
          <Logo size={30} />
          <span className="gold-text font-display text-lg font-black tracking-widest">Chiffre &amp; Chaos</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          <Link to="/lobby" className={link} activeProps={{ className: 'text-gold' }}><Swords size={14} />Salas</Link>
          <Link to="/grimorio" className={link} activeProps={{ className: 'text-gold' }}><ScrollText size={14} />Grimorio</Link>
          {me && <Link to="/historial" className={link} activeProps={{ className: 'text-gold' }}><History size={14} />Historial</Link>}
          {me?.role === 'admin' && <Link to="/admin" className={link} activeProps={{ className: 'text-gold' }}><ShieldCheck size={14} />Admin</Link>}
        </nav>
        {me ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-parch-dim sm:inline">{me.name}{me.role === 'admin' && <em className="ml-1 text-gold">· admin</em>}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Salir"
              onClick={async () => {
                await authClient.signOut()
                qc.setQueryData(meQuery.queryKey, null)
                nav({ to: '/' })
              }}
            >
              <LogOut size={16} />
            </Button>
          </div>
        ) : (
          <Link to="/auth"><Button size="sm">Entrar</Button></Link>
        )}
      </div>
    </header>
  )
}

function Root() {
  return (
    <div className="relative min-h-full">
      <Embers />
      <div className="relative z-10">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pb-16 pt-6">
          <Outlet />
        </main>
      </div>
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: '#1f1a2b', border: '1px solid rgba(212,167,58,.3)', color: '#ebdfc4' } }} />
    </div>
  )
}
