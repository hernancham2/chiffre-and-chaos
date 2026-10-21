// Simulación de extremo a extremo: 1 docente + 3 líderes reales (cuentas + WebSocket) juegan una partida corta.
// Requiere el API en marcha (bun server/index.ts). Uso: bun scripts/simulate.ts [url]
import type { ClientMsg, RoomSnapshot, ServerMsg } from '../shared/types'

const BASE = process.argv[2] ?? 'http://localhost:3001'
const stamp = Date.now().toString(36)

async function signUp(name: string) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ name, email: `${name.toLowerCase()}-${stamp}@sim.local`, password: 'simulacion-123' }),
  })
  if (!res.ok) throw new Error(`signup ${name}: ${res.status} ${await res.text()}`)
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  return cookie
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

class Client {
  state: RoomSnapshot | null = null
  ws!: WebSocket
  answeredKey = ''
  constructor(public name: string, public cookie: string, public play: boolean) {}
  connect(code: string) {
    return new Promise<void>((resolve) => {
      this.ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/ws/${code}`, { headers: { Cookie: this.cookie, Origin: 'http://localhost:3000' } } as any)
      this.ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as ServerMsg
        if (m.t === 'state') {
          const first = !this.state
          this.state = m.state
          if (first) resolve()
          if (this.play) this.react()
        } else if (m.t === 'error') console.log(`  [${this.name}] error: ${m.message}`)
      }
    })
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m))
  }
  autoParams(spec: any[]) {
    const out: Record<string, string[]> = {}
    for (const p of spec) {
      const max = Math.min(p.max, p.options.length)
      const n = p.min + Math.floor(Math.random() * (max - p.min + 1))
      out[p.key] = [...p.options].sort(() => Math.random() - 0.5).slice(0, n).map((o: any) => o.value)
    }
    return out
  }
  react() {
    const s = this.state!
    const me = s.me.teamId
    if (!me) return
    const p = s.pending
    if (p) {
      const k = `p${p.id}`
      if (this.answeredKey === k) return
      if (p.kind === 'reaction' && p.victimTeamId === me) {
        this.answeredKey = k
        this.send({ t: 'respond', pendingId: p.id, choice: p.shield ? 'shield' : p.gamble ? 'gamble' : 'accept' })
      } else if (p.kind === 'input' && p.teamId === me && p.spec) {
        this.answeredKey = k
        this.send({ t: 'respond', pendingId: p.id, choice: 'submit', params: this.autoParams(p.spec) })
      } else if (p.kind === 'deny_vote' && p.canDeny) {
        this.answeredKey = k
        this.send({ t: 'respond', pendingId: p.id, choice: Math.random() < 0.3 ? 'deny' : 'allow' })
      } else if (p.kind === 'side_question' && p.targetTeamId === me && p.options) {
        this.answeredKey = k
        this.send({ t: 'respond', pendingId: p.id, choice: 'answer', option: Math.floor(Math.random() * 4) })
      } else if (p.kind === 'dice_window' && p.canInvalidate && Math.random() < 0.5) {
        this.answeredKey = k
        this.send({ t: 'respond', pendingId: p.id, choice: 'invalidate' })
      }
      return
    }
    if (s.phase === 'answering' && s.question?.teamId === me) {
      const k = `a${s.question.index}-${s.question.attempt}-${s.question.text}`
      if (this.answeredKey !== k) {
        this.answeredKey = k
        setTimeout(() => this.send({ t: 'answer', option: Math.floor(Math.random() * 4) }), 300 + Math.random() * 1500)
      }
    }
    if ((s.phase === 'answering' || s.phase === 'reveal') && Math.random() < 0.08) {
      const playable = s.hand.filter((c) => c.playable)
      if (playable.length) {
        const c = pick(playable)
        this.send({ t: 'play_card', cardId: c.id, params: this.autoParams(c.params) })
      }
    }
    if (s.phase === 'donation' && s.donation && s.donation.excess[me] && !s.donation.submitted.includes(me)) {
      const other = s.teams.find((t) => t.id !== me)!
      this.send({ t: 'donate', allocation: { [other.id]: s.donation.excess[me] } })
    }
  }
}

const hostCookie = await signUp('Docente')
const cookies = await Promise.all(['Ana', 'Beto', 'Cleo'].map(signUp))

const created = await fetch(`${BASE}/api/rooms`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: hostCookie, Origin: 'http://localhost:3000' },
  body: JSON.stringify({ hostPlays: false, settings: { totalQuestions: 6, questionTimeSec: 6, revealSec: 2, reactionTimeSec: 5 } }),
}).then((r) => r.json() as Promise<{ code: string }>)
console.log('sala', created.code)

const host = new Client('Docente', hostCookie, false)
const players = cookies.map((c, i) => new Client(['Ana', 'Beto', 'Cleo'][i], c, true))
await host.connect(created.code)
for (const p of players) await p.connect(created.code)
await new Promise((r) => setTimeout(r, 400))
console.log('equipos en sala:', host.state!.teams.map((t) => t.name).join(', '))
host.send({ t: 'start' })

let lastQ = -1
const t0 = Date.now()
while (host.state!.phase !== 'finished') {
  await new Promise((r) => setTimeout(r, 500))
  const s = host.state!
  if (s.qDone !== lastQ) {
    lastQ = s.qDone
    console.log(`pregunta ${s.qDone}/${s.totalQuestions} · ${s.teams.map((t) => `${t.name}:${t.score}`).join(' ')}`)
  }
  if (Date.now() - t0 > 240_000) {
    console.log('TIMEOUT: la partida no terminó')
    console.log(s.phase, s.pending)
    process.exit(1)
  }
}
const res = host.state!.result!
console.log('\nRESULTADOS (id', res.id, ')')
for (const t of res.teams) console.log(`  ${t.name}: final ${t.finalScore} (bruto ${t.rawScore}, donó ${t.donated}, aciertos ${t.correct}) fichas: ${t.tokens.map((k) => `${k.name}=${k.grade}`).join(', ')}`)
const log = host.state!.log
console.log(`\nbitácora: ${log.length} entradas; cartas jugadas: ${log.filter((l) => l.kind === 'card').length}`)
process.exit(0)
