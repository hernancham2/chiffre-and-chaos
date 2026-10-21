import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { createBunWebSocket, serveStatic } from 'hono/bun'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { questionInputSchema, settingsSchema, type ClientMsg } from '../shared/types'
import { auth, getSessionUser, type SessionUser } from './auth'
import { db, runMigrations, schema } from './db'
import { manager, type Conn } from './game/manager'
import { GameError } from './game/types'
import { getSettings, resultsForUser, saveSettings, seedQuestions } from './store'

runMigrations()
const seeded = seedQuestions()
if (seeded) console.log(`✦ ${seeded} preguntas sembradas`)

type Env = { Variables: { user: SessionUser } }
const app = new Hono<Env>()
const { upgradeWebSocket, websocket } = createBunWebSocket()

if (process.env.NODE_ENV !== 'production') app.use('/api/*', logger())

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

const requireUser = async (c: any, next: any) => {
  const user = await getSessionUser(c.req.raw.headers)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  c.set('user', user)
  await next()
}
const requireAdmin = async (c: any, next: any) => {
  const user = await getSessionUser(c.req.raw.headers)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  if (user.role !== 'admin') return c.json({ error: 'Se requiere rol de administrador' }, 403)
  c.set('user', user)
  await next()
}

// ───────────── público / jugador ─────────────
app.get('/api/health', (c) => c.json({ ok: true, rooms: manager.rooms.size }))

app.get('/api/me', async (c) => {
  const user = await getSessionUser(c.req.raw.headers)
  return c.json({ user })
})

app.get('/api/settings', requireUser, (c) => c.json(getSettings()))

app.get('/api/rooms', requireUser, (c) =>
  c.json(
    [...manager.rooms.values()]
      .filter((r) => r.phase === 'lobby')
      .map((r) => ({ code: r.code, host: r.hostName, teams: r.teams.length, max: r.settings.maxTeams, createdAt: r.createdAt })),
  ),
)

app.get('/api/rooms/:code', requireUser, (c) => {
  const room = manager.get(c.req.param('code'))
  if (!room) return c.json({ error: 'Sala inexistente' }, 404)
  return c.json({ code: room.code, host: room.hostName, phase: room.phase, teams: room.teams.length, max: room.settings.maxTeams })
})

app.post(
  '/api/rooms',
  requireUser,
  zValidator('json', z.object({ hostPlays: z.boolean().default(false), settings: settingsSchema.partial().default({}) })),
  (c) => {
    const user = c.get('user')
    const { hostPlays, settings } = c.req.valid('json')
    const base = getSettings()
    const merged = settingsSchema.parse({ ...base, ...settings, tokensPerTeam: base.tokensPerTeam })
    const mine = [...manager.rooms.values()].filter((r) => r.hostUserId === user.id && r.phase !== 'finished')
    if (mine.length >= 3) return c.json({ error: 'Ya diriges demasiadas salas activas' }, 429)
    const room = manager.create(user, hostPlays, merged)
    return c.json({ code: room.code })
  },
)

app.get('/api/results', requireUser, (c) => {
  const user = c.get('user')
  return c.json(resultsForUser(user.id, false))
})
app.get('/api/results/:id', requireUser, (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const row = db.select().from(schema.gameResults).where(eq(schema.gameResults.id, id)).get()
  if (!row) return c.json({ error: 'No encontrado' }, 404)
  const mine = db
    .select()
    .from(schema.gameParticipants)
    .where(and(eq(schema.gameParticipants.gameId, id), eq(schema.gameParticipants.userId, user.id)))
    .get()
  if (!mine && user.role !== 'admin') return c.json({ error: 'No participaste en esa partida' }, 403)
  return c.json({ ...(row.result as object), id: row.id })
})

// ───────────── administración ─────────────
const admin = new Hono<Env>()
admin.use('*', requireAdmin)

admin.get('/questions', (c) => {
  const { source, week, q, active } = c.req.query()
  const conds = []
  if (source === 'semanario' || source === 'libre') conds.push(eq(schema.questions.source, source))
  if (week) conds.push(eq(schema.questions.week, Number(week)))
  if (active === '1' || active === '0') conds.push(eq(schema.questions.active, active === '1'))
  if (q) conds.push(or(like(schema.questions.text, `%${q}%`), like(schema.questions.topic, `%${q}%`)))
  const rows = db
    .select()
    .from(schema.questions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.questions.id))
    .all()
  return c.json(rows)
})

const checkQuestion = (q: z.infer<typeof questionInputSchema>) => {
  if (new Set(q.options.map((o) => o.toLowerCase())).size !== 4) return 'Las 4 alternativas deben ser distintas'
  if (q.source === 'semanario' && !q.week) return 'Una pregunta de semanario necesita su semana (1-7)'
  return null
}

admin.post('/questions', zValidator('json', questionInputSchema), (c) => {
  const q = c.req.valid('json')
  const bad = checkQuestion(q)
  if (bad) return c.json({ error: bad }, 400)
  const now = Date.now()
  const row = db
    .insert(schema.questions)
    .values({ ...q, week: q.source === 'semanario' ? (q.week ?? null) : null, createdAt: now, updatedAt: now })
    .returning()
    .get()
  return c.json(row, 201)
})

admin.put('/questions/:id', zValidator('json', questionInputSchema), (c) => {
  const q = c.req.valid('json')
  const bad = checkQuestion(q)
  if (bad) return c.json({ error: bad }, 400)
  const row = db
    .update(schema.questions)
    .set({ ...q, week: q.source === 'semanario' ? (q.week ?? null) : null, updatedAt: Date.now() })
    .where(eq(schema.questions.id, Number(c.req.param('id'))))
    .returning()
    .get()
  return row ? c.json(row) : c.json({ error: 'No encontrada' }, 404)
})

admin.patch('/questions/:id/active', zValidator('json', z.object({ active: z.boolean() })), (c) => {
  const row = db
    .update(schema.questions)
    .set({ active: c.req.valid('json').active, updatedAt: Date.now() })
    .where(eq(schema.questions.id, Number(c.req.param('id'))))
    .returning()
    .get()
  return row ? c.json(row) : c.json({ error: 'No encontrada' }, 404)
})

admin.delete('/questions/:id', (c) => {
  db.delete(schema.questions).where(eq(schema.questions.id, Number(c.req.param('id')))).run()
  return c.json({ ok: true })
})

admin.post('/questions/reseed', (c) => c.json({ added: seedQuestions() }))

admin.get('/stats', (c) => {
  const [q] = db.select({ n: sql<number>`count(*)`, a: sql<number>`sum(active)` }).from(schema.questions).all()
  const [u] = db.select({ n: sql<number>`count(*)` }).from(schema.user).all()
  const [g] = db.select({ n: sql<number>`count(*)` }).from(schema.gameResults).all()
  return c.json({ questions: q.n, activeQuestions: q.a ?? 0, users: u.n, games: g.n, rooms: manager.rooms.size })
})

admin.get('/settings', (c) => c.json(getSettings()))
admin.put('/settings', zValidator('json', settingsSchema), (c) => {
  const s = c.req.valid('json')
  if (s.minTeams > s.maxTeams) return c.json({ error: 'El mínimo de equipos no puede superar al máximo' }, 400)
  saveSettings(s)
  return c.json(s)
})

admin.get('/users', (c) =>
  c.json(
    db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.user.role, createdAt: schema.user.createdAt })
      .from(schema.user)
      .orderBy(desc(schema.user.createdAt))
      .all(),
  ),
)
admin.put('/users/:id/role', zValidator('json', z.object({ role: z.enum(['admin', 'player']) })), (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const { role } = c.req.valid('json')
  if (id === me.id && role !== 'admin') return c.json({ error: 'No puedes quitarte el rol de administrador a ti mismo' }, 400)
  db.update(schema.user).set({ role }).where(eq(schema.user.id, id)).run()
  return c.json({ ok: true })
})

admin.get('/rooms', (c) =>
  c.json(
    [...manager.rooms.values()].map((r) => ({
      code: r.code,
      host: r.hostName,
      phase: r.phase,
      teams: r.teams.length,
      qDone: r.qDone,
      total: r.settings.totalQuestions,
      online: manager.conns.get(r.code)?.size ?? 0,
      createdAt: r.createdAt,
    })),
  ),
)
admin.delete('/rooms/:code', (c) => {
  manager.close(c.req.param('code').toUpperCase())
  return c.json({ ok: true })
})
app.route('/api/admin', admin)

// ───────────── tiempo real ─────────────
app.get(
  '/api/ws/:code',
  requireUser,
  upgradeWebSocket((c) => {
    const user = c.get('user' as never) as SessionUser
    const room = manager.get(c.req.param('code') ?? '')
    let conn: Conn | null = null
    return {
      onOpen(_evt, ws) {
        if (!room) {
          ws.send(JSON.stringify({ t: 'error', message: 'Sala inexistente' }))
          ws.close(4004, 'no room')
          return
        }
        conn = { ws: { send: (d) => ws.send(d), close: (code, reason) => ws.close(code, reason) }, user }
        manager.attach(room, conn)
      },
      onMessage(evt, ws) {
        if (!room || !conn) return
        let msg: ClientMsg
        try {
          msg = JSON.parse(String(evt.data))
          if (!msg || typeof msg.t !== 'string') return
        } catch {
          return
        }
        if (msg.t === 'ping') return ws.send(JSON.stringify({ t: 'pong' }))
        try {
          room.handle(user.id, user.role === 'admin', msg)
        } catch (e) {
          const known = e instanceof GameError || e instanceof z.ZodError
          if (!known) console.error(e)
          ws.send(JSON.stringify({ t: 'error', message: e instanceof GameError ? e.message : e instanceof z.ZodError ? 'Ajustes inválidos' : 'Error interno' }))
        }
      },
      onClose() {
        if (room && conn) manager.detach(room, conn)
      },
    }
  }),
)

// ───────────── estáticos (producción) ─────────────
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT ?? 3001)
console.log(`✦ Chiffre & Chaos escuchando en :${port}`)

export default { port, fetch: app.fetch, websocket, idleTimeout: 120 }
