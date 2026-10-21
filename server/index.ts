import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { serveStatic, upgradeWebSocket, websocket } from '@hono/bun'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { questionInputSchema, settingsSchema, type ClientMsg } from '../shared/types'
import { auth, getSessionUser, type SessionUser } from './auth'
import { db, runMigrations, schema } from './db'
import { manager, type Conn } from './game/manager'
import { GameError } from './game/types'
import { getSettings, resultsForUser, saveSettings, seedQuestions } from './store'

await runMigrations()
const seeded = await seedQuestions()
if (seeded) console.log(`✦ ${seeded} preguntas sembradas`)

type Env = { Variables: { user: SessionUser } }
const app = new Hono<Env>()

if (process.env.NODE_ENV !== 'production') app.use('/api/*', logger())

app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

const requireUser = async (c: any, next: any) => {
  const user = await getSessionUser(c.req.raw.headers)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  c.set('user', user)
  await next()
}

/** Exige un permiso del control de acceso de better-auth (plugin admin). */
const requirePerm = (permissions: Record<string, string[]>) => async (c: any, next: any) => {
  const user = await getSessionUser(c.req.raw.headers)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  const res = await auth.api.userHasPermission({ body: { userId: user.id, permissions } })
  if (!res.success) return c.json({ error: 'No tienes permiso para esta acción' }, 403)
  c.set('user', user)
  await next()
}

// ───────────── público / jugador ─────────────
app.get('/api/health', (c) => c.json({ ok: true, rooms: manager.rooms.size }))

app.get('/api/me', async (c) => {
  const user = await getSessionUser(c.req.raw.headers)
  return c.json({ user })
})

app.get('/api/settings', requireUser, async (c) => c.json(await getSettings()))

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
  async (c) => {
    const user = c.get('user')
    const { hostPlays, settings } = c.req.valid('json')
    const base = await getSettings()
    const merged = settingsSchema.parse({ ...base, ...settings, tokensPerTeam: base.tokensPerTeam })
    const mine = [...manager.rooms.values()].filter((r) => r.hostUserId === user.id && r.phase !== 'finished')
    if (mine.length >= 3) return c.json({ error: 'Ya diriges demasiadas salas activas' }, 429)
    const room = manager.create(user, hostPlays, merged)
    return c.json({ code: room.code })
  },
)

app.get('/api/results', requireUser, async (c) => c.json(await resultsForUser(c.get('user').id)))
app.get('/api/results/:id', requireUser, async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.gameResults).where(eq(schema.gameResults.id, id))
  if (!row) return c.json({ error: 'No encontrado' }, 404)
  const [mine] = await db
    .select()
    .from(schema.gameParticipants)
    .where(and(eq(schema.gameParticipants.gameId, id), eq(schema.gameParticipants.userId, user.id)))
  if (!mine && user.role !== 'admin') return c.json({ error: 'No participaste en esa partida' }, 403)
  return c.json({ ...(row.result as object), id: row.id })
})

// ───────────── administración (permisos de better-auth admin) ─────────────
// La gestión de usuarios (listar, rol, ban) la ofrece el propio plugin en /api/auth/admin/*.
const admin = new Hono<Env>()
const canList = requirePerm({ user: ['list'] })

admin.get('/questions', canList, async (c) => {
  const { source, week, q, active } = c.req.query()
  const conds = []
  if (source === 'semanario' || source === 'libre') conds.push(eq(schema.questions.source, source))
  if (week) conds.push(eq(schema.questions.week, Number(week)))
  if (active === '1' || active === '0') conds.push(eq(schema.questions.active, active === '1'))
  if (q) conds.push(or(like(schema.questions.text, `%${q}%`), like(schema.questions.topic, `%${q}%`)))
  const rows = await db
    .select()
    .from(schema.questions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.questions.id))
  return c.json(rows)
})

const checkQuestion = (q: z.infer<typeof questionInputSchema>) => {
  if (new Set(q.options.map((o) => o.toLowerCase())).size !== 4) return 'Las 4 alternativas deben ser distintas'
  if (q.source === 'semanario' && !q.week) return 'Una pregunta de semanario necesita su semana (1-7)'
  return null
}

admin.post('/questions', requirePerm({ question: ['create'] }), zValidator('json', questionInputSchema), async (c) => {
  const q = c.req.valid('json')
  const bad = checkQuestion(q)
  if (bad) return c.json({ error: bad }, 400)
  const now = Date.now()
  const [row] = await db
    .insert(schema.questions)
    .values({ ...q, week: q.source === 'semanario' ? (q.week ?? null) : null, createdAt: now, updatedAt: now })
    .returning()
  return c.json(row, 201)
})

admin.put('/questions/:id', requirePerm({ question: ['update'] }), zValidator('json', questionInputSchema), async (c) => {
  const q = c.req.valid('json')
  const bad = checkQuestion(q)
  if (bad) return c.json({ error: bad }, 400)
  const [row] = await db
    .update(schema.questions)
    .set({ ...q, week: q.source === 'semanario' ? (q.week ?? null) : null, updatedAt: Date.now() })
    .where(eq(schema.questions.id, Number(c.req.param('id'))))
    .returning()
  return row ? c.json(row) : c.json({ error: 'No encontrada' }, 404)
})

admin.patch('/questions/:id/active', requirePerm({ question: ['update'] }), zValidator('json', z.object({ active: z.boolean() })), async (c) => {
  const [row] = await db
    .update(schema.questions)
    .set({ active: c.req.valid('json').active, updatedAt: Date.now() })
    .where(eq(schema.questions.id, Number(c.req.param('id'))))
    .returning()
  return row ? c.json(row) : c.json({ error: 'No encontrada' }, 404)
})

admin.delete('/questions/:id', requirePerm({ question: ['delete'] }), async (c) => {
  await db.delete(schema.questions).where(eq(schema.questions.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

admin.post('/questions/reseed', requirePerm({ question: ['create'] }), async (c) => c.json({ added: await seedQuestions() }))

admin.get('/stats', canList, async (c) => {
  const [q] = await db
    .select({ n: sql<number>`count(*)::int`, a: sql<number>`count(*) filter (where ${schema.questions.active})::int` })
    .from(schema.questions)
  const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.user)
  const [g] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.gameResults)
  return c.json({ questions: q.n, activeQuestions: q.a ?? 0, users: u.n, games: g.n, rooms: manager.rooms.size })
})

admin.get('/settings', canList, async (c) => c.json(await getSettings()))
admin.put('/settings', requirePerm({ settings: ['update'] }), zValidator('json', settingsSchema), async (c) => {
  const s = c.req.valid('json')
  if (s.minTeams > s.maxTeams) return c.json({ error: 'El mínimo de equipos no puede superar al máximo' }, 400)
  await saveSettings(s)
  return c.json(s)
})

admin.get('/rooms', canList, (c) =>
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
admin.delete('/rooms/:code', requirePerm({ room: ['close'] }), (c) => {
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
      async onMessage(evt, ws) {
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
          await room.handle(user.id, user.role === 'admin', msg)
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
