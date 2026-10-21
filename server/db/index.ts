import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL (cadena de conexión de PostgreSQL)')

// Los drivers de Node/Bun no implementan channel_binding; se omite y se mantiene sslmode.
const clean = url.replace(/([?&])channel_binding=[^&]*&?/, '$1').replace(/[?&]$/, '')

export const sql = postgres(clean, { max: 10, idle_timeout: 20, connect_timeout: 15, ssl: 'require' })
export const db = drizzle(sql, { schema })
export { schema }

export async function runMigrations() {
  await migrate(db, { migrationsFolder: 'drizzle' })
}
