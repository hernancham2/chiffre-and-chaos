import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { ac, roles } from '@shared/access'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  plugins: [adminClient({ ac, roles })],
})
