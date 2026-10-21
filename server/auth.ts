import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { count } from 'drizzle-orm'
import { ac, roles } from '../shared/access'
import { db, schema } from './db'

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

// En Render, RENDER_EXTERNAL_URL trae la URL pública; así no hace falta configurarla a mano.
const publicUrl = process.env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000'
const origins = [
  ...(process.env.TRUSTED_ORIGINS ?? 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000').split(','),
  publicUrl,
].map((s) => s.trim()).filter(Boolean)

export const auth = betterAuth({
  baseURL: publicUrl,
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me-dev-only-secret-change-me',
  trustedOrigins: origins,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  plugins: [admin({ ac, roles, defaultRole: 'user', adminRoles: ['admin'] })],
  databaseHooks: {
    user: {
      create: {
        // la primera cuenta (o las de ADMIN_EMAILS) nace como administradora
        before: async (u) => {
          const [{ n }] = await db.select({ n: count() }).from(schema.user)
          const isAdmin = n === 0 || adminEmails.includes(u.email.toLowerCase())
          return { data: { ...u, role: isAdmin ? 'admin' : 'user' } }
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
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? 'user' }
}
