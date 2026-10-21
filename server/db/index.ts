import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'

mkdirSync('data', { recursive: true })
export const sqlite = new Database(process.env.DB_PATH ?? 'data/chiffre.db', { create: true })
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite, { schema })
export { schema }

export function runMigrations() {
  migrate(db, { migrationsFolder: 'drizzle' })
}
