import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { count } from 'drizzle-orm'
import { db, schema } from './db'

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const origins = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me-dev-only-secret-change-me',
  trustedOrigins: origins,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'player', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          const [{ n }] = await db.select({ n: count() }).from(schema.user)
          const isAdmin = n === 0 || adminEmails.includes(u.email.toLowerCase())
          return { data: { ...u, role: isAdmin ? 'admin' : 'player' } }
        },
      },
    },
  },
})

export type SessionUser = { id: string; name: string; email: string; role: string }

export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers })
  if (!s) return null
  const u = s.user as SessionUser
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? 'player' }
}
