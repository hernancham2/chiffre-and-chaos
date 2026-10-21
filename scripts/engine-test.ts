// Prueba de humo del motor: juega cada uno de los 40 Arcanos en una sala con cultistas (bots)
// y verifica invariantes (cartas conservadas, puntajes >= 0, integrantes consistentes).
// Ejecutar: bun scripts/engine-test.ts [clave_carta]
import { CARDS } from '../shared/cards'
import { DEFAULT_SETTINGS } from '../shared/types'
import { Room } from '../server/game/room'
import type { RuntimeQuestion } from '../server/game/types'

const questions: RuntimeQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, text: `Pregunta de prueba ${i + 1}`, options: ['A', 'B', 'C', 'D'], correctIndex: 0, source: 'libre', week: null, topic: 't', explanation: '',
}))

const deps = { loadQuestions: () => questions, saveResult: () => 1 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn: () => boolean, ms = 30_000) {
  const t0 = Date.now()
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando condición')
    await sleep(80)
  }
}

function invariants(room: Room): string[] {
  const errs: string[] = []
  const ids = [...room.teams.flatMap((t) => t.hand), ...room.played, ...room.retired, ...room.undealt].map((c) => c.id)
  if (ids.length !== 40) errs.push(`cartas totales ${ids.length} != 40`)
  if (new Set(ids).size !== ids.length) errs.push('cartas duplicadas')
  for (const t of room.teams) if (t.score < 0 || !Number.isFinite(t.score)) errs.push(`puntaje inválido ${t.name}: ${t.score}`)
  for (const k of room.allTokens()) {
    if (!room.teams.find((t) => t.id === k.team)) errs.push(`token ${k.name} en equipo inexistente`)
  }
  return errs
}

async function testCard(key: string) {
  const room = new Room('TEST' + key.slice(0, 4).toUpperCase(), { id: 'host', name: 'Docente' }, false, { ...DEFAULT_SETTINGS, questionTimeSec: 120, totalQuestions: 10 }, deps)
  for (let i = 0; i < 4; i++) room.addTeam(null, 'bot', true)
  room.startGame()
  await waitFor(() => room.phase === 'answering', 20_000)
  const q = room.q!
  const me = room.team(q.teamId!)
  const others = room.teams.filter((t) => t !== me)

  // preparar el escenario
  for (const t of room.teams) t.score = 8
  const inst = [...room.teams.flatMap((t) => t.hand), ...room.undealt].find((c) => c.key === key)!
  for (const t of room.teams) t.hand = t.hand.filter((c) => c !== inst)
  room.undealt = room.undealt.filter((c) => c !== inst)
  const keep = me.hand.filter((c) => c.key !== 'escudo_misericordia' && c.key !== 'apostador_vida').slice(0, 3)
  room.undealt.push(...me.hand.filter((c) => !keep.includes(c)))
  me.hand = [inst, ...keep]
  if (room.played.length === 0) room.played.push(others[0].hand.pop()!)
  room.namedPlayed = 5
  room.lastPlayed = { key: 'graciosa_caridad', teamId: others[0].id }
  const out = [others[0].tokens[0], others[1].tokens[0]]
  out.forEach((k) => ((k.status = 'out'), (k.grade = 3)))
  if (key === 'rompe_victoria') {
    room.phase = 'reveal'
    q.awarded = { teamId: others[0].id, points: 2 }
  }
  const before = room.logs.length
  const info = room.cardInfo(me, inst)
  if (!info.playable) return { key, status: 'SKIP', note: info.reason, logs: [] }
  ;(room as any).playCard(me, inst.id, room.autoParams(info.params))
  await waitFor(() => !room.busy, 60_000)
  const errs = invariants(room)
  const logs = room.logs.slice(before).map((l) => l.text)
  room.dispose()
  return { key, status: errs.length ? 'FAIL' : 'OK', note: errs.join('; '), logs }
}

const only = process.argv[2]
const keys = CARDS.map((c) => c.key).filter((k) => !only || k === only)
const results = await Promise.all(
  keys.map((k) =>
    testCard(k).catch((e) => ({ key: k, status: 'ERROR', note: String(e?.stack ?? e), logs: [] as string[] })),
  ),
)
let bad = 0
for (const r of results) {
  if (r.status === 'FAIL' || r.status === 'ERROR') bad++
  console.log(`${r.status.padEnd(5)} ${r.key.padEnd(26)} ${r.note ?? ''}`)
  if (only || r.status !== 'OK') for (const l of r.logs) console.log('        ·', l)
}
console.log(`\n${results.length - bad}/${results.length} sin fallos`)
process.exit(bad ? 1 : 0)
