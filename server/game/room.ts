import { CARDS, CARD_BY_KEY, NAMED_KEYS, type CardMeta } from '../../shared/cards'
import {
  TEAM_COLORS,
  settingsSchema,
  type ClientMsg,
  type GameResult,
  type GameSettings,
  type HandCard,
  type LogEntry,
  type LogKind,
  type ParamSpec,
  type Phase,
  type PileCard,
  type PublicPending,
  type PublicQuestion,
  type PublicTeam,
  type RoomSnapshot,
  type Whisper,
} from '../../shared/types'
import { DEFS } from './cards'
import {
  GameError,
  type CardInst,
  type Interrupt,
  type Params,
  type Req,
  type RuntimeQuestion,
  type Script,
  type Team,
  type Token,
} from './types'
import { Clock, pick, randInt, rollDie, shuffle, uid } from './util'

export interface RoomDeps {
  loadQuestions(sources: string[]): RuntimeQuestion[] | Promise<RuntimeQuestion[]>
  saveResult(code: string, hostUserId: string, result: GameResult, userIds: string[]): number | null | Promise<number | null>
}

interface ActiveQ {
  index: number
  rq: RuntimeQuestion
  attempt: 1 | 2
  teamId: string | null
  firstTeamId: string | null
  redirect: { from: string; to: string } | null
  pickedIndex: number | null
  result: PublicQuestion['result']
  revealed: boolean
  awarded: { teamId: string; points: number } | null
}

interface Pending {
  id: number
  kind: PublicPending['kind']
  deadline: number
  data: any
  onRespond: (team: Team, msg: Extract<ClientMsg, { t: 'respond' }>) => void
}

const SEAT_NAMES = ['Escriba', 'Alquimista', 'Heraldo', 'Centinela', 'Oráculo', 'Cantor']
const BOT_NAMES = ['Malphas', 'Sariel', 'Azazel', 'Raguel', 'Ramiel', 'Zadkiel']
const SIGILS = 12

const humanMs = 30_000

export class Room {
  code: string
  hostUserId: string
  hostName: string
  hostPlays: boolean
  settings: GameSettings
  deps: RoomDeps
  createdAt = Date.now()
  lastActivity = Date.now()

  teams: Team[] = []
  phase: Phase = 'lobby'
  paused = false
  qDone = 0
  q: ActiveQ | null = null
  cardsLocked = false
  played: CardInst[] = []
  retired: CardInst[] = []
  undealt: CardInst[] = []
  lastPlayed: { key: string; teamId: string } | null = null
  namedPlayed = 0
  interrupt: Interrupt | null = null
  busy = false
  pending: Pending | null = null
  clock = new Clock()
  ptimer = new Clock()
  logs: LogEntry[] = []
  seq = 0
  whispers: Whisper[] = []
  whisperPaid = new Set<string>()
  donation: { excess: Record<string, number>; submitted: Set<string> } | null = null
  result: GameResult | null = null
  pool: RuntimeQuestion[] = []
  usedIds = new Set<number>()
  listeners = new Set<() => void>()
  onKick?: (userId: string, reason: string) => void
  private pid = 0
  private botTimers = new Set<ReturnType<typeof setTimeout>>()
  private emitQueued = false
  private epoch = 0

  constructor(code: string, host: { id: string; name: string }, hostPlays: boolean, settings: GameSettings, deps: RoomDeps) {
    this.code = code
    this.hostUserId = host.id
    this.hostName = host.name
    this.hostPlays = hostPlays
    this.settings = settings
    this.deps = deps
    this.log('system', `La sala ${code} se abre. El Códice aguarda.`)
    if (hostPlays) this.addTeam(host.id, host.name, false)
  }

  // ───────────────────────── utilidades ─────────────────────────
  team(id: string): Team {
    const t = this.teams.find((x) => x.id === id)
    if (!t) throw new GameError('Equipo inexistente')
    return t
  }
  teamOf(userId: string) {
    return this.teams.find((t) => t.userId === userId) ?? null
  }
  token(id: string): Token {
    for (const t of this.teams) {
      const k = t.tokens.find((x) => x.id === id)
      if (k) return k
    }
    throw new GameError('Integrante inexistente')
  }
  allTokens() {
    return this.teams.flatMap((t) => t.tokens)
  }
  activeTokens(teamId: string) {
    return this.allTokens().filter((k) => k.team === teamId && k.status === 'in')
  }
  outTokens() {
    return this.allTokens().filter((k) => k.status === 'out')
  }
  lostTokens(teamId: string) {
    return this.allTokens().filter((k) => k.origin === teamId && (k.status === 'out' || k.team !== teamId))
  }
  isImmune(t: Team) {
    return t.immuneUntil > this.qDone
  }

  log(kind: LogKind, text: string, data?: Record<string, unknown>) {
    this.logs.push({ seq: ++this.seq, at: Date.now(), kind, text, data })
    if (this.logs.length > 250) this.logs.splice(0, this.logs.length - 250)
    this.emit()
  }

  emit() {
    this.lastActivity = Date.now()
    if (this.emitQueued) return
    this.emitQueued = true
    queueMicrotask(() => {
      this.emitQueued = false
      for (const l of this.listeners) l()
    })
  }

  dispose() {
    this.clock.clear()
    this.ptimer.clear()
    this.cancelBots()
    this.listeners.clear()
  }

  // ───────────────────────── membresía ─────────────────────────
  addTeam(userId: string | null, userName: string, bot: boolean): Team {
    const usedColors = new Set(this.teams.map((t) => t.color))
    const usedSigils = new Set(this.teams.map((t) => t.sigil))
    const seat = this.teams.length + 1
    const id = uid('t')
    const color = TEAM_COLORS.find((c) => !usedColors.has(c)) ?? TEAM_COLORS[0]
    let sigil = 0
    while (usedSigils.has(sigil) && sigil < SIGILS) sigil++
    const name = bot ? `${BOT_NAMES[(seat - 1) % BOT_NAMES.length]} ✦ ensayo` : userName
    const team: Team = {
      id, seat, userId, userName: bot ? 'Cultista (bot)' : userName, name, color, sigil: sigil % SIGILS, score: 0, hand: [], tokens: [],
      barachiel: false, immuneUntil: 0, connected: !bot, bot, correct: 0, donated: 0, rawScore: 0,
    }
    for (let i = 0; i < this.settings.tokensPerTeam; i++) {
      team.tokens.push({ id: uid('k'), name: SEAT_NAMES[i % SEAT_NAMES.length], origin: id, team: id, status: 'in', grade: null, loan: null })
    }
    this.teams.push(team)
    this.log('system', `${name} se une al cónclave.`)
    return team
  }

  join(userId: string, userName: string): Team | null {
    const existing = this.teamOf(userId)
    if (existing) {
      existing.connected = true
      this.emit()
      return existing
    }
    if (userId === this.hostUserId && !this.hostPlays) return null
    if (this.phase === 'lobby' && this.teams.length < this.settings.maxTeams) return this.addTeam(userId, userName, false)
    return null
  }

  setConnected(userId: string, connected: boolean) {
    const t = this.teamOf(userId)
    if (t && !t.bot) {
      t.connected = connected
      this.emit()
    }
  }

  private reseat() {
    this.teams.forEach((t, i) => (t.seat = i + 1))
  }

  // ───────────────────────── mensajes de cliente ─────────────────────────
  handle(userId: string, isAdmin: boolean, msg: ClientMsg): void | Promise<void> {
    this.lastActivity = Date.now()
    const team = this.teamOf(userId)
    const isHost = userId === this.hostUserId || isAdmin
    switch (msg.t) {
      case 'ping':
        return
      case 'team_update': {
        if (!team) throw new GameError('No tienes equipo')
        if (this.phase !== 'lobby') throw new GameError('La partida ya comenzó')
        if (msg.name !== undefined) team.name = msg.name.trim().slice(0, 24) || team.name
        if (msg.color && TEAM_COLORS.includes(msg.color) && !this.teams.some((t) => t !== team && t.color === msg.color)) team.color = msg.color
        if (msg.sigil !== undefined && msg.sigil >= 0 && msg.sigil < SIGILS && !this.teams.some((t) => t !== team && t.sigil === msg.sigil)) team.sigil = msg.sigil
        if (msg.tokenNames) team.tokens.forEach((k, i) => msg.tokenNames![i] && (k.name = msg.tokenNames![i].trim().slice(0, 16) || k.name))
        return this.emit()
      }
      case 'settings': {
        if (!isHost) throw new GameError('Sólo el docente')
        if (this.phase !== 'lobby') throw new GameError('La partida ya comenzó')
        const next = settingsSchema.parse({ ...this.settings, ...msg.patch })
        if (next.tokensPerTeam !== this.settings.tokensPerTeam) throw new GameError('Los integrantes por equipo los define el administrador')
        this.settings = next
        return this.emit()
      }
      case 'add_bot': {
        if (!isHost) throw new GameError('Sólo el docente')
        if (this.phase !== 'lobby') throw new GameError('La partida ya comenzó')
        if (!this.settings.allowBots) throw new GameError('Los cultistas de ensayo están desactivados')
        if (this.teams.length >= this.settings.maxTeams) throw new GameError('Cónclave completo')
        this.addTeam(null, 'bot', true)
        return
      }
      case 'remove_team': {
        if (!isHost) throw new GameError('Sólo el docente')
        if (this.phase !== 'lobby') throw new GameError('La partida ya comenzó')
        const t = this.team(msg.teamId)
        this.teams = this.teams.filter((x) => x !== t)
        this.reseat()
        if (t.userId) this.onKick?.(t.userId, 'El docente te retiró de la sala')
        this.log('system', `${t.name} abandona el cónclave.`)
        return
      }
      case 'start': {
        if (!isHost) throw new GameError('Sólo el docente puede iniciar')
        return this.startGame()
      }
      case 'answer': {
        if (!team) throw new GameError('No tienes equipo')
        return this.answer(team, msg.option)
      }
      case 'play_card': {
        if (!team) throw new GameError('No tienes equipo')
        return this.playCard(team, msg.cardId, msg.params ?? {})
      }
      case 'respond': {
        if (!team) throw new GameError('No tienes equipo')
        if (!this.pending || this.pending.id !== msg.pendingId) throw new GameError('Esa decisión ya no está vigente')
        if (this.paused) throw new GameError('Partida en pausa')
        return this.pending.onRespond(team, msg)
      }
      case 'whisper': {
        if (!team) throw new GameError('No tienes equipo')
        return this.whisper(team, msg.to, msg.text)
      }
      case 'donate': {
        if (!team) throw new GameError('No tienes equipo')
        return this.donate(team, msg.allocation)
      }
      case 'host': {
        if (!isHost) throw new GameError('Sólo el docente')
        return this.hostAction(msg)
      }
    }
  }

  private hostAction(msg: Extract<ClientMsg, { t: 'host' }>): void {
    switch (msg.action) {
      case 'pause':
        if (this.paused || this.phase === 'lobby' || this.phase === 'finished') return
        this.paused = true
        this.clock.hold()
        this.ptimer.hold()
        this.log('system', 'El docente detiene el tiempo.')
        return
      case 'resume':
        if (!this.paused) return
        this.paused = false
        this.clock.release()
        this.ptimer.release()
        this.log('system', 'El tiempo vuelve a correr.')
        return
      case 'adjust': {
        if (!msg.teamId || !msg.delta) return
        this.addScore(msg.teamId, Math.max(-20, Math.min(20, Math.trunc(msg.delta))), 'Decisión del docente')
        return
      }
      case 'kick': {
        if (!msg.teamId) return
        const t = this.team(msg.teamId)
        if (this.phase === 'lobby') return void this.handle(this.hostUserId, true, { t: 'remove_team', teamId: t.id })
        if (t.userId) this.onKick?.(t.userId, 'El docente te retiró de la sala')
        t.bot = true
        t.userId = null
        t.connected = false
        t.name = `${t.name} (autómata)`
        this.log('system', `${t.name} es tomado por un cultista.`)
        return
      }
      case 'skip': {
        if (this.busy) throw new GameError('Hay un efecto en curso')
        if (!this.q || !['answering', 'drawing', 'reveal'].includes(this.phase)) throw new GameError('No hay pregunta activa')
        this.clock.clear()
        this.cancelBots()
        this.q.result = 'skipped'
        this.q.revealed = true
        this.log('warn', 'El docente descarta la pregunta.')
        return this.endQuestion()
      }
      case 'next': {
        if (this.busy) throw new GameError('Hay un efecto en curso')
        if (this.phase === 'reveal') {
          this.clock.clear()
          return this.afterReveal()
        }
        if (this.phase === 'donation') return this.finishGame()
        return
      }
      case 'end': {
        if (this.phase === 'lobby' || this.phase === 'finished') return
        this.clock.clear()
        this.ptimer.clear()
        this.pending = null
        this.busy = false
        this.log('system', 'El docente da por terminada la partida.')
        return this.finishGame()
      }
    }
  }

  // ───────────────────────── inicio ─────────────────────────
  private starting = false
  async startGame() {
    if (this.starting) return
    if (this.phase !== 'lobby') throw new GameError('La partida ya comenzó')
    if (this.teams.length < this.settings.minTeams) throw new GameError(`Se necesitan al menos ${this.settings.minTeams} líderes en la sala`)
    const offline = this.teams.filter((t) => !t.bot && !t.connected)
    if (offline.length) throw new GameError(`Hay líderes desconectados: ${offline.map((t) => t.name).join(', ')}`)
    this.starting = true
    try {
      this.pool = await this.deps.loadQuestions(this.settings.sources)
    } finally {
      this.starting = false
    }
    if (this.phase !== 'lobby') return
    if (!this.pool.length) throw new GameError('No hay preguntas activas con esas fuentes')
    const deck: CardInst[] = shuffle(CARDS.map((c) => ({ id: uid('c'), key: c.key })))
    const per = Math.min(this.settings.cardsPerTeam, Math.floor(deck.length / this.teams.length))
    for (const t of this.teams) t.hand = deck.splice(0, per)
    this.undealt = deck
    this.phase = 'between'
    this.log('system', `El Códice se abre. Cada líder recibe ${per} arcanos boca abajo.`)
    this.log('system', `Preguntas: ${this.settings.totalQuestions} · Tiempo: ${this.settings.questionTimeSec}s.`)
    this.clock.start(3500, () => this.startQuestion())
  }

  private drawQuestion(): RuntimeQuestion {
    let cands = this.pool.filter((q) => !this.usedIds.has(q.id))
    if (!cands.length) {
      this.usedIds.clear()
      cands = this.pool
    }
    const q = pick(cands)
    this.usedIds.add(q.id)
    const order = shuffle([0, 1, 2, 3])
    return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) }
  }

  private startQuestion() {
    this.q = {
      index: this.qDone, rq: this.drawQuestion(), attempt: 1, teamId: null, firstTeamId: null,
      redirect: null, pickedIndex: null, result: null, revealed: false, awarded: null,
    }
    this.log('question', `Pregunta ${this.qDone + 1} de ${this.settings.totalQuestions}`, { index: this.qDone })
    this.drawTeam(null)
  }

  private drawTeam(exclude: string | null) {
    const eligible = this.teams.filter((t) => t.id !== exclude && !this.isImmune(t))
    const list = eligible.length ? eligible : this.teams.filter((t) => t.id !== exclude)
    const chosen = pick(list)
    this.phase = 'drawing'
    this.log('dice', `El dado señala al equipo nº ${chosen.seat}: ${chosen.name}.`, {
      purpose: 'team', sides: this.teams.length, value: chosen.seat, teamId: chosen.id,
    })
    this.epoch++
    this.clock.start(3600, () => this.beginAnswering(chosen.id))
  }

  private beginAnswering(teamId: string) {
    if (!this.q) return
    this.q.teamId = teamId
    this.phase = 'answering'
    this.startAnswerClock()
    this.scheduleBots()
    this.emit()
  }

  private startAnswerClock() {
    this.clock.start(this.settings.questionTimeSec * 1000, () => this.resolveAttempt('timeout'))
  }

  // ───────────────────────── respuestas ─────────────────────────
  private answer(team: Team, option: number) {
    const q = this.q
    if (!q || this.phase !== 'answering') throw new GameError('No hay pregunta en curso')
    if (this.paused) throw new GameError('Partida en pausa')
    if (this.busy) throw new GameError('Hay un efecto resolviéndose')
    if (q.teamId !== team.id) throw new GameError('No te toca responder')
    if (!Number.isInteger(option) || option < 0 || option > 3) throw new GameError('Opción inválida')
    q.pickedIndex = option
    this.resolveAttempt(option === q.rq.correctIndex ? 'correct' : 'wrong')
  }

  private award(teamId: string, points: number) {
    if (!this.q) return
    this.addScore(teamId, points, 'Pregunta')
    this.team(teamId).correct++
    this.q.awarded = { teamId, points }
  }

  private resolveAttempt(res: NonNullable<PublicQuestion['result']>) {
    const q = this.q
    if (!q || this.phase !== 'answering') return
    this.clock.clear()
    this.cancelBots()
    q.result = res
    const pts = q.attempt === 1 ? this.settings.pointsFirst : this.settings.pointsSecond
    const owner = q.teamId!
    if (res === 'correct' || res === 'auto') {
      this.log('question', `${this.team(owner).name} ${res === 'auto' ? 'obtiene los puntos con la ayuda celestial' : 'responde correctamente'} (+${pts}).`)
      this.award(owner, pts)
      if (q.redirect) {
        this.log('warn', `El Rezo a Sealtiel falla: ${this.team(q.redirect.from).name} pierde 1 punto.`)
        this.addScore(q.redirect.from, -1, 'Rezo a Sealtiel')
      }
    } else {
      this.log('question', `${this.team(owner).name} ${res === 'timeout' ? 'no responde a tiempo' : res === 'skipped' ? 'cede la pregunta' : 'responde mal'}.`)
      if (q.redirect) {
        this.log('card', `El Rezo a Sealtiel prospera: ${this.team(q.redirect.from).name} gana 2 puntos.`)
        this.addScore(q.redirect.from, 2, 'Rezo a Sealtiel')
      }
    }
    this.goReveal()
  }

  private goReveal() {
    const q = this.q!
    q.revealed = true
    this.phase = 'reveal'
    const ms = (this.settings.revealSec + (q.awarded ? 4 : 0)) * 1000
    this.clock.start(ms, () => this.afterReveal())
    this.emit()
  }

  private afterReveal() {
    const q = this.q
    if (!q) return
    if (q.awarded || q.attempt === 2) return this.endQuestion()
    q.attempt = 2
    q.firstTeamId = q.teamId
    q.pickedIndex = null
    q.result = null
    q.revealed = false
    q.redirect = null
    q.awarded = null
    this.log('question', 'La pregunta pasa a otro equipo.')
    this.drawTeam(q.firstTeamId)
  }

  private endQuestion() {
    this.cancelBots()
    this.qDone++
    for (const t of this.teams) {
      if (t.barachiel) this.addScore(t.id, 1, 'Divinidad de Barachiel')
    }
    for (const tok of this.allTokens()) {
      if (tok.loan && tok.loan.until <= this.qDone) {
        const back = tok.loan.returnTo
        tok.loan = null
        if (tok.status === 'in') this.moveToken(tok.id, back)
        this.log('token', `${tok.name} regresa a ${this.team(back).name}.`)
      }
    }
    for (const t of this.teams) {
      if (t.immuneUntil && t.immuneUntil === this.qDone) this.log('card', `El Símbolo de la amistad de ${t.name} se extingue.`)
    }
    const total = this.settings.totalQuestions
    if (!this.cardsLocked && total > 2 && this.qDone >= total - 2) this.lockCards()
    if (this.qDone >= total) return this.afterQuestions()
    this.phase = 'between'
    this.clock.start(2600, () => this.startQuestion())
    this.emit()
  }

  private lockCards() {
    this.cardsLocked = true
    const pen = this.settings.unusedCardPenalty
    for (const t of this.teams) {
      const n = t.hand.length
      if (n && pen) this.addScore(t.id, -n * pen, 'Arcanos sin usar')
      for (const c of [...t.hand]) this.retireFrom(t, c)
    }
    this.log('system', `Los arcanos se desvanecen. Cada carta sin usar cuesta ${pen} punto(s).`)
  }

  private afterQuestions() {
    const cap = this.settings.scoreCap
    const excess: Record<string, number> = {}
    for (const t of this.teams) if (t.score > cap) excess[t.id] = t.score - cap
    if (!Object.keys(excess).length) return this.finishGame()
    this.phase = 'donation'
    this.donation = { excess, submitted: new Set() }
    this.log('system', `Los equipos que superan ${cap} puntos pueden donar su excedente.`)
    this.clock.start(60_000, () => this.finishGame())
    for (const t of this.teams) {
      if (t.bot && excess[t.id]) this.schedule(1500 + randInt(2500), () => this.botDonate(t))
    }
    this.emit()
  }

  private botDonate(t: Team) {
    if (this.phase !== 'donation' || !this.donation) return
    const others = this.teams.filter((x) => x.id !== t.id)
    const alloc: Record<string, number> = {}
    let left = this.donation.excess[t.id] ?? 0
    for (const o of shuffle(others)) {
      if (left <= 0) break
      const give = 1 + randInt(left)
      alloc[o.id] = give
      left -= give
    }
    try {
      this.donate(t, alloc)
    } catch {}
  }

  private donate(team: Team, allocation: Record<string, number>) {
    if (this.phase !== 'donation' || !this.donation) throw new GameError('No es momento de donar')
    const excess = this.donation.excess[team.id]
    if (!excess) throw new GameError('No tienes excedente')
    if (this.donation.submitted.has(team.id)) throw new GameError('Ya decidiste')
    let sum = 0
    for (const [id, n] of Object.entries(allocation)) {
      if (id === team.id || !Number.isInteger(n) || n < 0) throw new GameError('Donación inválida')
      this.team(id)
      sum += n
    }
    if (sum > excess) throw new GameError(`Sólo puedes donar hasta ${excess}`)
    for (const [id, n] of Object.entries(allocation)) {
      if (!n) continue
      this.team(id).score += n
      this.log('score', `${team.name} dona ${n} punto(s) a ${this.team(id).name}.`, { teamId: id, delta: n })
    }
    team.donated = sum
    team.score -= sum
    this.donation.submitted.add(team.id)
    if (Object.keys(this.donation.excess).every((id) => this.donation!.submitted.has(id))) this.finishGame()
    this.emit()
  }

  private finishGame() {
    if (this.phase === 'finished') return
    this.clock.clear()
    this.ptimer.clear()
    this.cancelBots()
    const cap = this.settings.scoreCap
    for (const t of this.teams) t.rawScore = t.score + t.donated
    const teams = this.teams
      .map((t) => {
        const finalScore = Math.min(cap, t.score)
        return {
          teamId: t.id, name: t.name, userName: t.userName, color: t.color, rawScore: t.rawScore, finalScore,
          donated: t.donated, correct: t.correct,
          tokens: this.allTokens()
            .filter((k) => (k.status === 'in' && k.team === t.id) || (k.status === 'out' && k.origin === t.id))
            .map((k) => ({
              name: k.name, origin: this.team(k.origin).name, status: k.status,
              grade: k.status === 'in' ? finalScore : Math.min(cap, k.grade ?? 0),
            })),
        }
      })
      .sort((a, b) => b.finalScore - a.finalScore || b.correct - a.correct)
    this.result = { id: null, code: this.code, finishedAt: Date.now(), totalQuestions: this.settings.totalQuestions, teams }
    const result = this.result
    Promise.resolve(this.deps.saveResult(this.code, this.hostUserId, result, this.teams.map((t) => t.userId).filter(Boolean) as string[]))
      .then((id) => {
        result.id = id
        this.emit()
      })
      .catch((e) => console.error('No se pudo guardar el resultado', e))
    this.phase = 'finished'
    this.log('system', 'El Códice se cierra. Los destinos están sellados.')
    this.emit()
  }

  // ───────────────────────── puntos, integrantes y cartas ─────────────────────────
  addScore(teamId: string, delta: number, reason = '') {
    const t = this.team(teamId)
    const before = t.score
    t.score = Math.max(0, t.score + delta)
    const actual = t.score - before
    if (actual !== 0) this.log('score', `${t.name} ${actual > 0 ? '+' : ''}${actual}${reason ? ` · ${reason}` : ''}`, { teamId, delta: actual })
  }
  setScore(teamId: string, value: number, reason = '') {
    this.addScore(teamId, value - this.team(teamId).score, reason)
  }

  moveToken(tokenId: string, toTeam: string) {
    const k = this.token(tokenId)
    const from = this.team(k.team)
    k.team = toTeam
    k.status = 'in'
    this.log('token', `${k.name} pasa de ${from.name} a ${this.team(toTeam).name}.`, { tokenId, to: toTeam })
  }
  removeToken(tokenId: string) {
    const k = this.token(tokenId)
    const t = this.team(k.team)
    k.status = 'out'
    k.grade = t.score
    k.loan = null
    this.log('token', `${k.name} (${t.name}) sale del juego con nota ${t.score}.`, { tokenId, out: true })
  }
  restoreToken(tokenId: string, toTeam: string) {
    const k = this.token(tokenId)
    k.status = 'in'
    k.grade = null
    k.team = toTeam
    k.loan = null
    this.log('token', `${k.name} regresa al juego en ${this.team(toTeam).name}.`, { tokenId, to: toTeam })
  }
  swapTokens(a: string, b: string) {
    const ka = this.token(a)
    const kb = this.token(b)
    ;[ka.team, kb.team] = [kb.team, ka.team]
    this.log('token', `${ka.name} y ${kb.name} intercambian de equipo.`)
  }

  private removeFromHand(t: Team, inst: CardInst) {
    t.hand = t.hand.filter((c) => c.id !== inst.id)
  }
  retireFrom(t: Team, inst: CardInst, sealed = false) {
    this.removeFromHand(t, inst)
    inst.sealed = sealed
    this.retired.push(inst)
    this.log('card', `«${CARD_BY_KEY[inst.key].name}» de ${t.name} sale del juego.`, { cardKey: inst.key })
  }
  sealPlayed(id: string) {
    const c = this.played.find((x) => x.id === id)
    if (c) c.sealed = true
  }
  transferCard(from: Team, inst: CardInst, to: Team) {
    this.removeFromHand(from, inst)
    to.hand.push(inst)
  }
  swapCards(a: Team, ia: CardInst, b: Team, ib: CardInst) {
    this.removeFromHand(a, ia)
    this.removeFromHand(b, ib)
    a.hand.push(ib)
    b.hand.push(ia)
  }
  browsableCards(): PileCard[] {
    return [
      ...this.played.map((c) => ({ id: c.id, key: c.key, pile: 'played' as const, sealed: !!c.sealed })),
      ...this.retired.map((c) => ({ id: c.id, key: c.key, pile: 'retired' as const, sealed: !!c.sealed })),
    ].filter((c) => !c.sealed)
  }
  takeFromPile(id: string, to: Team) {
    for (const pile of [this.played, this.retired]) {
      const i = pile.findIndex((c) => c.id === id && !c.sealed)
      if (i >= 0) {
        const [c] = pile.splice(i, 1)
        to.hand.push(c)
        this.log('card', `${to.name} recupera «${CARD_BY_KEY[c.key].name}».`)
        return
      }
    }
  }

  private registerActivation(team: Team) {
    for (const t of this.teams) {
      if (t.id !== team.id && t.barachiel) {
        t.barachiel = false
        this.log('card', `La Divinidad de Barachiel de ${t.name} se apaga.`)
      }
    }
  }

  /** Mueve una carta de la mano a "jugadas" y avisa a todos (carta reveladas). */
  private spend(team: Team, inst: CardInst, text: string) {
    this.removeFromHand(team, inst)
    this.played.push(inst)
    this.registerActivation(team)
    this.log('card', text, { cardKey: inst.key, teamId: team.id, reveal: true })
  }

  // ───────────────────────── jugar cartas ─────────────────────────
  timingOk(team: Team, meta: CardMeta): boolean {
    switch (meta.timing) {
      case 'answering':
        return this.phase === 'answering'
      case 'answering_team':
        return this.phase === 'answering' && this.q?.teamId === team.id
      case 'post_award':
        return this.phase === 'reveal' && !!this.q?.awarded
      default:
        return false
    }
  }

  cardInfo(team: Team, inst: CardInst): HandCard {
    const meta = CARD_BY_KEY[inst.key]
    const def = DEFS[inst.key]
    let reason: string | null = null
    if (this.cardsLocked) reason = 'Los arcanos se han desvanecido'
    else if (meta.timing === 'reactive') reason = def.check?.(this, team) ?? null
    else if (!this.timingOk(team, meta)) {
      reason =
        meta.timing === 'answering_team' ? 'Sólo el equipo que responde' : meta.timing === 'post_award' ? 'Sólo justo después de otorgar puntos' : 'Se juega durante la pregunta'
    } else reason = def.check?.(this, team) ?? null
    let params: ParamSpec[] = []
    if (!reason) {
      params = def.spec?.(this, team) ?? []
      if (params.some((p) => p.options.length < p.min)) reason = 'No hay objetivos válidos'
    }
    return { id: inst.id, key: inst.key, playable: !reason, reason: reason ?? undefined, params: reason ? [] : params }
  }

  validateParams(spec: ParamSpec[], input: Params): Params {
    const out: Params = {}
    for (const p of spec) {
      const vals = (input[p.key] ?? []).map(String)
      const allowed = new Set(p.options.map((o) => o.value))
      if (p.distinct && new Set(vals).size !== vals.length) throw new GameError(`Elecciones repetidas: ${p.label}`)
      if (vals.some((v) => !allowed.has(v))) throw new GameError(`Elección inválida: ${p.label}`)
      if (vals.length < p.min || vals.length > Math.min(p.max, p.options.length)) throw new GameError(`Debes elegir ${p.min === p.max ? p.min : `${p.min}-${p.max}`}: ${p.label}`)
      out[p.key] = vals
    }
    return out
  }

  autoParams(spec: ParamSpec[]): Params {
    const out: Params = {}
    for (const p of spec) {
      const max = Math.min(p.max, p.options.length)
      const n = p.min + randInt(max - p.min + 1)
      out[p.key] = shuffle(p.options).slice(0, n).map((o) => o.value)
    }
    return out
  }

  private playCard(team: Team, cardId: string, params: Params) {
    if (this.paused) throw new GameError('Partida en pausa')
    if (this.busy) throw new GameError('Otro efecto se está resolviendo')
    const inst = team.hand.find((c) => c.id === cardId)
    if (!inst) throw new GameError('No tienes esa carta')
    const info = this.cardInfo(team, inst)
    if (!info.playable) throw new GameError(info.reason ?? 'No puedes jugarla ahora')
    const valid = this.validateParams(info.params, params)
    this.beginAction()
    this.runScript(this.activate(team, inst, valid, {}), () => this.endAction())
  }

  *activate(team: Team, inst: CardInst, params: Params, opts: { forced?: boolean }): Script {
    const meta = CARD_BY_KEY[inst.key]
    this.spend(team, inst, `${team.name} ${opts.forced ? 'es forzado a activar' : 'activa'} «${meta.name}».`)
    if (NAMED_KEYS.has(inst.key)) this.namedPlayed++
    if (inst.key !== 'copion') this.lastPlayed = { key: inst.key, teamId: team.id }
    yield { t: 'wait', ms: 1800, label: 'reveal' }
    yield* DEFS[inst.key].run({ g: this, team, params, cardKey: inst.key, instId: inst.id, forced: opts.forced })
  }

  private beginAction() {
    this.busy = true
    this.clock.hold()
    this.emit()
  }

  private endAction() {
    this.busy = false
    this.closePending()
    this.clock.release()
    this.applyInterrupt()
    this.emit()
  }

  private applyInterrupt() {
    const it = this.interrupt
    this.interrupt = null
    const q = this.q
    if (!it || !q || this.phase !== 'answering') return
    switch (it.kind) {
      case 'auto_correct':
        if (q.teamId === it.team) this.resolveAttempt('auto')
        return
      case 'redirect':
        q.redirect = { from: it.from, to: it.to }
        q.teamId = it.to
        this.log('card', `La pregunta se redirige a ${this.team(it.to).name}.`)
        this.startAnswerClock()
        this.scheduleBots()
        return
      case 'new_question':
        q.rq = this.drawQuestion()
        q.pickedIndex = null
        this.log('question', 'El docente trae una nueva pregunta.')
        this.startAnswerClock()
        return
      case 'skip':
        q.result = 'skipped'
        this.clock.clear()
        this.cancelBots()
        this.log('question', `${this.team(it.team).name} salta la pregunta.`)
        this.goReveal()
        return
    }
  }

  // ───────────────────────── motor de scripts ─────────────────────────
  private runScript(gen: Script, done: () => void) {
    const step = (val?: unknown) => {
      let r: IteratorResult<Req, void>
      try {
        r = gen.next(val)
      } catch (e) {
        console.error('Fallo en efecto de carta', e)
        this.log('warn', 'El efecto de la carta se desvanece sin resultado.')
        return done()
      }
      if (r.done) return done()
      this.handleReq(r.value, step)
    }
    step()
  }

  private openPending(kind: Pending['kind'], data: any, ms: number, onRespond: Pending['onRespond'], onTimeout: () => void) {
    this.pending = { id: ++this.pid, kind, data, deadline: Date.now() + ms, onRespond }
    this.ptimer.start(ms, () => {
      onTimeout()
    })
    this.emit()
    return this.pending
  }

  private closePending() {
    this.ptimer.clear()
    this.pending = null
  }

  private handleReq(req: Req, resume: (v?: unknown) => void) {
    switch (req.t) {
      case 'wait': {
        this.openPending('delay', { label: req.label }, req.ms, () => {}, () => {
          this.closePending()
          resume()
        })
        return
      }
      case 'roll': {
        const doRoll = () => {
          const v = rollDie(req.sides)
          this.log('dice', `${this.team(req.by).name} lanza el dado (d${req.sides}): ${v}.`, { purpose: 'card', sides: req.sides, value: v, teamId: req.by, cardKey: req.cardKey })
          return v
        }
        let value = doRoll()
        const settle = (v: number) =>
          this.openPending('delay', { label: 'dice' }, 2300, () => {}, () => {
            this.closePending()
            resume(v)
          })
        const holders = () => this.teams.filter((t) => t.hand.some((c) => c.key === 'segunda_opinion'))
        if (!holders().length) return void settle(value)
        this.openPending(
          'dice_window',
          { rollerTeamId: req.by, cardKey: req.cardKey, sides: req.sides, value },
          6000,
          (team, msg) => {
            if (msg.choice !== 'invalidate') return
            const inst = team.hand.find((c) => c.key === 'segunda_opinion')
            if (!inst) throw new GameError('No tienes Segunda opinión')
            this.spend(team, inst, `${team.name} invalida el lanzamiento con «Segunda opinión».`)
            value = doRoll()
            this.closePending()
            settle(value)
          },
          () => {
            this.closePending()
            resume(value)
          },
        )
        for (const t of holders()) if (t.bot && randInt(100) < 35) this.schedule(1200 + randInt(2000), () => this.pending?.kind === 'dice_window' && this.pending.onRespond(t, { t: 'respond', pendingId: this.pending.id, choice: 'invalidate' }))
        return
      }
      case 'react': {
        const shielded = new Set<string>()
        const queue = req.victims.filter((v) => v !== req.source)
        const next = () => {
          const vid = queue.shift()
          if (!vid) return resume(shielded)
          const v = this.team(vid)
          if (this.isImmune(v)) {
            shielded.add(vid)
            this.log('card', `${v.name} está protegido por el Símbolo de la amistad.`)
            return next()
          }
          const shield = v.hand.some((c) => c.key === 'escudo_misericordia')
          const gamble = v.hand.some((c) => c.key === 'apostador_vida')
          if (!shield && !gamble) return next()
          const finish = () => {
            this.closePending()
            next()
          }
          this.openPending(
            'reaction',
            { victimTeamId: vid, sourceTeamId: req.source, cardKey: req.cardKey, shield, gamble },
            this.settings.reactionTimeSec * 1000,
            (team, msg) => {
              if (team.id !== vid) return
              if (msg.choice === 'shield' && shield) {
                this.spend(v, v.hand.find((c) => c.key === 'escudo_misericordia')!, `${v.name} se protege con el «Escudo de la misericordia».`)
                shielded.add(vid)
                return finish()
              }
              if (msg.choice === 'gamble' && gamble) {
                this.spend(v, v.hand.find((c) => c.key === 'apostador_vida')!, `${v.name} apuesta su vida a los dados.`)
                const r = rollDie(6)
                this.log('dice', `${v.name} lanza el dado (d6): ${r}.`, { purpose: 'card', sides: 6, value: r, teamId: vid, cardKey: 'apostador_vida' })
                if (r % 2 === 1) {
                  this.log('warn', `Impar: ${v.name} paga 2 puntos pero se protege.`)
                  this.addScore(vid, -2, 'Apostador de vida')
                } else this.log('card', `Par: ${v.name} se protege sin pagar.`)
                shielded.add(vid)
                this.openPending('delay', { label: 'dice' }, 2300, () => {}, finish)
                return
              }
              if (msg.choice === 'accept') return finish()
            },
            finish,
          )
          if (v.bot) {
            this.schedule(1200 + randInt(1800), () => {
              const p = this.pending
              if (!p || p.kind !== 'reaction') return
              const choice = shield && randInt(100) < 80 ? 'shield' : gamble && randInt(100) < 70 ? 'gamble' : 'accept'
              p.onRespond(v, { t: 'respond', pendingId: p.id, choice })
            })
          }
        }
        return next()
      }
      case 'ask': {
        const team = this.team(req.team)
        this.openPending(
          'input',
          { teamId: req.team, cardKey: req.cardKey, title: req.title, spec: req.spec, peek: req.peek ?? null },
          humanMs,
          (t, msg) => {
            if (t.id !== req.team) return
            const p = this.validateParams(req.spec, msg.params ?? {})
            this.closePending()
            resume(p)
          },
          () => {
            this.log('warn', `${team.name} duda demasiado: el destino elige por ${team.name}.`)
            this.closePending()
            resume(this.autoParams(req.spec))
          },
        )
        if (team.bot) {
          this.schedule(1200 + randInt(1500), () => {
            const p = this.pending
            if (p?.kind === 'input') p.onRespond(team, { t: 'respond', pendingId: p.id, choice: 'submit', params: this.autoParams(req.spec) })
          })
        }
        return
      }
      case 'deny': {
        const voters = this.teams.filter((t) => t.id !== req.source)
        const voted = new Set<string>()
        this.openPending(
          'deny_vote',
          { sourceTeamId: req.source, cardKey: req.cardKey },
          this.settings.reactionTimeSec * 1000,
          (team, msg) => {
            if (team.id === req.source) return
            if (msg.choice === 'deny') {
              this.log('card', `${team.name} niega la activación.`)
              this.closePending()
              return resume(true)
            }
            voted.add(team.id)
            if (voters.every((v) => v.bot || !v.connected || voted.has(v.id))) {
              this.closePending()
              resume(false)
            }
            this.emit()
          },
          () => {
            this.closePending()
            resume(false)
          },
        )
        for (const v of voters) {
          if (v.bot) {
            this.schedule(1500 + randInt(2500), () => {
              const p = this.pending
              if (p?.kind === 'deny_vote') p.onRespond(v, { t: 'respond', pendingId: p.id, choice: randInt(100) < 20 ? 'deny' : 'allow' })
            })
          }
        }
        return
      }
      case 'side_q': {
        const rq = this.drawQuestion()
        const target = this.team(req.target)
        this.log('card', `${this.team(req.asker).name} interroga a ${target.name}.`)
        const conclude = (ok: boolean) => {
          this.log('question', ok ? `${target.name} responde bien.` : `${target.name} falla la pregunta.`)
          this.closePending()
          resume(ok)
        }
        this.openPending(
          'side_question',
          { askerTeamId: req.asker, targetTeamId: req.target, rq },
          this.settings.questionTimeSec * 1000,
          (t, msg) => {
            if (t.id !== req.target || typeof msg.option !== 'number') return
            conclude(msg.option === rq.correctIndex)
          },
          () => conclude(false),
        )
        if (target.bot) {
          this.schedule(2500 + randInt(4000), () => {
            const p = this.pending
            if (p?.kind === 'side_question') p.onRespond(target, { t: 'respond', pendingId: p.id, choice: 'answer', option: randInt(100) < 50 ? rq.correctIndex : randInt(4) })
          })
        }
        return
      }
    }
  }

  // ───────────────────────── diplomacia ─────────────────────────
  private whisper(team: Team, to: string, text: string) {
    const clean = text.trim().slice(0, 240)
    if (!clean) return
    if (to !== 'all') this.team(to)
    const live = this.phase !== 'lobby' && this.phase !== 'finished'
    const key = `${team.id}:${to}:${this.qDone}`
    if (live && this.settings.whisperCost > 0 && !this.whisperPaid.has(key)) {
      this.whisperPaid.add(key)
      this.addScore(team.id, -this.settings.whisperCost, 'Conversar con otro equipo')
    }
    this.whispers.push({ from: team.id, to, text: clean, at: Date.now() })
    if (this.whispers.length > 400) this.whispers.shift()
    this.emit()
  }

  // ───────────────────────── bots ─────────────────────────
  private schedule(ms: number, fn: () => void) {
    const ep = this.epoch
    const id = setTimeout(() => {
      this.botTimers.delete(id)
      if (this.phase === 'finished') return
      try {
        fn()
      } catch (e) {
        if (!(e instanceof GameError)) console.error(e)
      }
      void ep
    }, ms)
    this.botTimers.add(id)
  }

  private cancelBots() {
    for (const t of this.botTimers) clearTimeout(t)
    this.botTimers.clear()
  }

  private scheduleBots() {
    const q = this.q
    if (!q) return
    const answerer = this.team(q.teamId!)
    if (answerer.bot) {
      this.schedule(3000 + randInt(9000), () => {
        if (this.phase !== 'answering' || this.q !== q || this.busy || this.paused || q.teamId !== answerer.id) return this.scheduleBots()
        const ok = randInt(100) < 58
        this.answer(answerer, ok ? q.rq.correctIndex : (q.rq.correctIndex + 1 + randInt(3)) % 4)
      })
    }
    for (const bot of this.teams.filter((t) => t.bot)) {
      if (randInt(100) < 45 && bot.hand.length) {
        this.schedule(4000 + randInt(18_000), () => this.botPlay(bot))
      }
    }
  }

  private botPlay(bot: Team) {
    if (this.phase !== 'answering' && this.phase !== 'reveal') return
    if (this.busy || this.paused || this.pending) return
    const avoid = new Set(['san_miguel_caido', 'entierro_insensato', 'caridad_lucifer', 'escudo_misericordia', 'apostador_vida', 'segunda_opinion', 'contrato_destino'])
    const opts = bot.hand
      .filter((c) => !avoid.has(c.key))
      .map((c) => ({ c, info: this.cardInfo(bot, c) }))
      .filter((x) => x.info.playable)
    if (!opts.length) return
    const { c, info } = pick(opts)
    try {
      this.playCard(bot, c.id, this.autoParams(info.params))
    } catch {}
  }

  // ───────────────────────── instantánea ─────────────────────────
  snapshot(viewerId: string, isAdmin: boolean): RoomSnapshot {
    const me = this.teamOf(viewerId)
    const isHost = viewerId === this.hostUserId || isAdmin
    const q = this.q
    const hand: HandCard[] = me ? me.hand.map((c) => this.decorate(me, this.cardInfo(me, c))) : []
    const teams: PublicTeam[] = this.teams.map((t) => ({
      id: t.id, seat: t.seat, name: t.name, userName: t.userName, userId: t.userId, color: t.color, sigil: t.sigil, score: t.score,
      handCount: t.hand.length, barachiel: t.barachiel, immune: this.isImmune(t), connected: t.connected || t.bot, bot: t.bot,
      tokens: this.allTokens().filter((k) => (k.status === 'in' && k.team === t.id) || (k.status === 'out' && k.origin === t.id)).map((k) => ({
        id: k.id, name: k.name, origin: k.origin, team: k.team, status: k.status, grade: k.grade, loanUntil: k.loan?.until ?? null,
      })),
    }))
    const clockActive = this.clock.active && ['drawing', 'answering', 'reveal', 'between', 'donation'].includes(this.phase)
    const pq: PublicQuestion | null =
      q && ['drawing', 'answering', 'reveal'].includes(this.phase)
        ? {
            index: q.index, text: q.rq.text, options: q.rq.options, source: q.rq.source, week: q.rq.week, topic: q.rq.topic, attempt: q.attempt,
            teamId: this.phase === 'drawing' ? null : q.teamId, firstTeamId: q.firstTeamId, redirectedFrom: q.redirect?.from ?? null,
            correctIndex: q.revealed ? q.rq.correctIndex : null, explanation: q.revealed ? q.rq.explanation || null : null,
            pickedIndex: q.pickedIndex, result: q.result, awarded: q.awarded,
          }
        : null
    return {
      code: this.code,
      serverNow: Date.now(),
      phase: this.phase,
      paused: this.paused,
      hostUserId: this.hostUserId,
      hostName: this.hostName,
      hostPlays: this.hostPlays,
      settings: this.settings,
      teams,
      qDone: this.qDone,
      totalQuestions: this.settings.totalQuestions,
      cardsLocked: this.cardsLocked,
      question: pq,
      clock: clockActive ? { deadline: this.clock.deadline, remainingMs: this.clock.remaining, totalMs: this.clock.total, frozen: this.clock.frozen || this.paused } : null,
      pending: this.pending ? this.publicPending(this.pending, me, isHost) : null,
      me: { teamId: me?.id ?? null, isHost, isAdmin },
      hand,
      piles: {
        played: this.played.length,
        retired: this.retired.length,
        deck: this.undealt.length,
        browsable: [...this.played.map((c) => ({ id: c.id, key: c.key, pile: 'played' as const, sealed: !!c.sealed })), ...this.retired.map((c) => ({ id: c.id, key: c.key, pile: 'retired' as const, sealed: !!c.sealed }))],
      },
      lastPlayed: this.lastPlayed,
      namedPlayed: this.namedPlayed,
      donation: this.donation ? { excess: this.donation.excess, submitted: [...this.donation.submitted] } : null,
      log: this.logs.slice(-90),
      whispers: this.whispers.filter((w) => isHost || (me && (w.from === me.id || w.to === me.id || w.to === 'all'))),
      result: this.result,
    }
  }

  private decorate(me: Team, h: HandCard): HandCard {
    if (!h.playable) return h
    if (this.busy || this.paused || this.pending) return { ...h, playable: false, reason: this.paused ? 'Partida en pausa' : 'Hay un efecto resolviéndose' }
    return h
  }

  private publicPending(p: Pending, me: Team | null, isHost: boolean): PublicPending {
    const d = p.data
    switch (p.kind) {
      case 'reaction':
        return { id: p.id, kind: 'reaction', victimTeamId: d.victimTeamId, sourceTeamId: d.sourceTeamId, cardKey: d.cardKey, shield: me?.id === d.victimTeamId ? d.shield : false, gamble: me?.id === d.victimTeamId ? d.gamble : false, deadline: p.deadline }
      case 'dice_window':
        return { id: p.id, kind: 'dice_window', rollerTeamId: d.rollerTeamId, cardKey: d.cardKey, sides: d.sides, value: d.value, canInvalidate: !!me?.hand.some((c) => c.key === 'segunda_opinion'), deadline: p.deadline }
      case 'deny_vote':
        return { id: p.id, kind: 'deny_vote', sourceTeamId: d.sourceTeamId, cardKey: d.cardKey, canDeny: !!me && me.id !== d.sourceTeamId, deadline: p.deadline }
      case 'input': {
        const mine = me?.id === d.teamId
        return { id: p.id, kind: 'input', teamId: d.teamId, cardKey: d.cardKey, title: d.title, spec: mine ? d.spec : null, peek: mine ? d.peek : null, deadline: p.deadline }
      }
      case 'side_question': {
        const rq: RuntimeQuestion = d.rq
        const mine = me?.id === d.targetTeamId || isHost
        return { id: p.id, kind: 'side_question', askerTeamId: d.askerTeamId, targetTeamId: d.targetTeamId, text: rq.text, options: mine ? rq.options : null, deadline: p.deadline }
      }
      default:
        return { id: p.id, kind: 'delay', label: d.label, deadline: p.deadline }
    }
  }
}
