import { queryOptions } from '@tanstack/react-query'
import { api } from './utils'

export interface Me {
  id: string
  name: string
  email: string
  role: 'admin' | 'player'
}

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => (await api<{ user: Me | null }>('/me')).user,
  staleTime: 30_000,
})
