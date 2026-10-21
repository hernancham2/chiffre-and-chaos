import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { meQuery } from './queries'

export async function requireAuth(queryClient: QueryClient, role?: 'admin') {
  const me = await queryClient.ensureQueryData(meQuery)
  if (!me) throw redirect({ to: '/auth' })
  if (role === 'admin' && me.role !== 'admin') throw redirect({ to: '/lobby' })
  return { me }
}
