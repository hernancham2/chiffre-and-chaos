import { desc, eq, and, inArray } from 'drizzle-orm'
import { DEFAULT_SETTINGS, settingsSchema, type GameResult, type GameSettings } from '../shared/types'
import { QUESTION_ROWS } from './data/questions'
import { db, schema } from './db'
import type { RuntimeQuestion } from './game/types'

export async function getSettings(): Promise<GameSettings> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'game'))
  if (!row) return DEFAULT_SETTINGS
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row.value as object) })
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export async function saveSettings(s: GameSettings) {
  await db
    .insert(schema.settings)
    .values({ key: 'game', value: s })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: s } })
}

export async function loadQuestions(sources: string[]): Promise<RuntimeQuestion[]> {
  const rows = await db
    .select()
    .from(schema.questions)
    .where(and(eq(schema.questions.active, true), inArray(schema.questions.source, sources as ('semanario' | 'libre')[])))
  return rows.map((r) => ({
    id: r.id, text: r.text, options: r.options, correctIndex: r.correctIndex, source: r.source, week: r.week, topic: r.topic, explanation: r.explanation,
  }))
}

export async function saveResult(code: string, hostUserId: string, result: GameResult, userIds: string[]): Promise<number> {
  const [row] = await db
    .insert(schema.gameResults)
    .values({ code, hostUserId, finishedAt: result.finishedAt, totalQuestions: result.totalQuestions, result })
    .returning({ id: schema.gameResults.id })
  const ids = [...new Set([hostUserId, ...userIds])]
  await db.insert(schema.gameParticipants).values(ids.map((userId) => ({ gameId: row.id, userId })))
  return row.id
}

export async function resultsForUser(userId: string) {
  const rows = await db
    .select({ r: schema.gameResults })
    .from(schema.gameParticipants)
    .innerJoin(schema.gameResults, eq(schema.gameParticipants.gameId, schema.gameResults.id))
    .where(eq(schema.gameParticipants.userId, userId))
    .orderBy(desc(schema.gameResults.finishedAt))
    .limit(50)
  return rows.map(({ r }) => ({ ...(r.result as GameResult), id: r.id }))
}

export async function seedQuestions(): Promise<number> {
  const existing = new Set((await db.select({ text: schema.questions.text }).from(schema.questions)).map((r) => r.text))
  const now = Date.now()
  const fresh = QUESTION_ROWS.filter((r) => !existing.has(r[2])).map(([week, topic, text, ok, a, b, c, explanation]) => ({
    text, options: [ok, a, b, c], correctIndex: 0, source: (week ? 'semanario' : 'libre') as 'semanario' | 'libre',
    week: week ?? null, topic, explanation: explanation ?? '', active: true, createdAt: now, updatedAt: now,
  }))
  for (let i = 0; i < fresh.length; i += 100) await db.insert(schema.questions).values(fresh.slice(i, i + 100))
  return fresh.length
}
