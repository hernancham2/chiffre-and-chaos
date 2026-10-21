import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Logo } from '#/components/Pieces'
import { Button } from '#/components/ui/button'
import { Input, Label } from '#/components/ui/input'
import { authClient } from '#/lib/auth-client'
import { meQuery } from '#/lib/queries'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/auth')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
    if (me) throw redirect({ to: '/lobby' })
  },
  component: AuthPage,
})

function AuthPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email')).trim()
    const password = String(f.get('password'))
    setBusy(true)
    try {
      const res =
        mode === 'up'
          ? await authClient.signUp.email({ email, password, name: String(f.get('name')).trim() })
          : await authClient.signIn.email({ email, password })
      if (res.error) {
        toast.error(res.error.message ?? 'No se pudo completar')
        return
      }
      await qc.invalidateQueries({ queryKey: meQuery.queryKey })
      nav({ to: '/lobby' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md">
      <div className="panel rune-border p-8">
        <div className="flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="gold-text mt-3 text-3xl font-black">{mode === 'in' ? 'Cruza el umbral' : 'Únete al cónclave'}</h1>
          <p className="mt-1 text-sm text-parch-dim">Cada líder necesita su cuenta para guardar sus resultados.</p>
        </div>
        <div className="mt-6 grid grid-cols-2 rounded-lg border border-gold/20 p-1">
          {(['in', 'up'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('rounded-md py-1.5 font-display text-xs uppercase tracking-widest transition', mode === m ? 'bg-gold text-ink-950' : 'text-parch-dim hover:text-parch')}>
              {m === 'in' ? 'Entrar' : 'Registrarme'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'up' && (
            <div>
              <Label htmlFor="name">Nombre del líder</Label>
              <Input id="name" name="name" required minLength={2} maxLength={40} autoComplete="name" placeholder="Ej. Hernán" />
            </div>
          )}
          <div>
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Mínimo 8 caracteres" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}</Button>
        </form>
        {mode === 'up' && <p className="mt-4 text-center text-xs text-parch-dim">La primera cuenta registrada obtiene el rol de administrador.</p>}
      </div>
    </div>
  )
}
