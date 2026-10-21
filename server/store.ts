import { and, desc, eq, inArray } from 'drizzle-orm'
import { DEFAULT_SETTINGS, settingsSchema, type GameResult, type GameSettings } from '../shared/types'
import { db, schema } from './db'
import { QUESTION_ROWS } from './data/questions'
import type { RuntimeQuestion } from './game/types'

export function getSettings(): GameSettings {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'game')).get()
  if (!row) return DEFAULT_SETTINGS
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(row.value as object) })
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

export function saveSettings(s: GameSettings) {
  db.insert(schema.settings)
    .values({ key: 'game', value: s })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: s } })
    .run()
}

export function loadQuestions(sources: string[]): RuntimeQuestion[] {
  const rows = db
    .select()
    .from(schema.questions)
    .where(and(eq(schema.questions.active, true), inArray(schema.questions.source, sources as ('semanario' | 'libre')[])))
    .all()
  return rows.map((r) => ({
    id: r.id, text: r.text, options: r.options, correctIndex: r.correctIndex, source: r.source, week: r.week, topic: r.topic, explanation: r.explanation,
  }))
}

export function saveResult(code: string, hostUserId: string, result: GameResult, userIds: string[]): number {
  const row = db
    .insert(schema.gameResults)
    .values({ code, hostUserId, finishedAt: result.finishedAt, totalQuestions: result.totalQuestions, result })
    .returning({ id: schema.gameResults.id })
    .get()
  const ids = [...new Set([hostUserId, ...userIds])]
  for (const userId of ids) db.insert(schema.gameParticipants).values({ gameId: row.id, userId }).run()
  return row.id
}

export function resultsForUser(userId: string, isAdmin: boolean) {
  const rows = isAdmin
    ? db.select().from(schema.gameResults).orderBy(desc(schema.gameResults.finishedAt)).limit(50).all()
    : db
        .select({ r: schema.gameResults })
        .from(schema.gameParticipants)
        .innerJoin(schema.gameResults, eq(schema.gameParticipants.gameId, schema.gameResults.id))
        .where(eq(schema.gameParticipants.userId, userId))
        .orderBy(desc(schema.gameResults.finishedAt))
        .limit(50)
        .all()
        .map((x) => x.r)
  return rows.map((r) => ({ ...(r.result as GameResult), id: r.id }))
}

export function seedQuestions(): number {
  const existing = new Set(db.select({ text: schema.questions.text }).from(schema.questions).all().map((r) => r.text))
  const now = Date.now()
  let n = 0
  for (const [week, topic, text, ok, a, b, c, explanation] of QUESTION_ROWS) {
    if (existing.has(text)) continue
    db.insert(schema.questions)
      .values({ text, options: [ok, a, b, c], correctIndex: 0, source: week ? 'semanario' : 'libre', week: week ?? null, topic, explanation: explanation ?? '', active: true, createdAt: now, updatedAt: now })
      .run()
    n++
  }
  return n
}
