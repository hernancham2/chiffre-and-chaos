import { z } from 'zod'

// ───────────────────────── Ajustes del juego ─────────────────────────

export const settingsSchema = z.object({
  questionTimeSec: z.number().int().min(5).max(300).default(30),
  totalQuestions: z.number().int().min(3).max(60).default(30),
  pointsFirst: z.number().int().min(0).max(10).default(2),
  pointsSecond: z.number().int().min(0).max(10).default(1),
  cardsPerTeam: z.number().int().min(0).max(10).default(7),
  tokensPerTeam: z.number().int().min(3).max(6).default(3),
  minTeams: z.number().int().min(3).max(6).default(3),
  maxTeams: z.number().int().min(3).max(6).default(6),
  whisperCost: z.number().int().min(0).max(5).default(1),
  unusedCardPenalty: z.number().int().min(0).max(5).default(1),
  scoreCap: z.number().int().min(5).max(100).default(20),
  reactionTimeSec: z.number().int().min(4).max(60).default(12),
  revealSec: z.number().int().min(2).max(20).default(6),
  allowBots: z.boolean().default(true),
  sources: z.array(z.enum(['semanario', 'libre'])).min(1).default(['semanario', 'libre']),
})
export type GameSettings = z.infer<typeof settingsSchema>
export const DEFAULT_SETTINGS: GameSettings = settingsSchema.parse({})

// ───────────────────────── Preguntas ─────────────────────────

export const questionInputSchema = z.object({
  text: z.string().trim().min(8).max(600),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  source: z.enum(['semanario', 'libre']),
  week: z.number().int().min(1).max(7).nullable().optional(),
  topic: z.string().trim().max(80).default(''),
  explanation: z.string().trim().max(600).default(''),
  active: z.boolean().default(true),
})
export type QuestionInput = z.infer<typeof questionInputSchema>

export interface QuestionRow extends QuestionInput {
  id: number
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Estado público de la sala ─────────────────────────

export type Phase = 'lobby' | 'drawing' | 'answering' | 'reveal' | 'between' | 'donation' | 'finished'

export interface PublicToken {
  id: string
  name: string
  origin: string
  team: string
  status: 'in' | 'out'
  grade: number | null
  loanUntil: number | null
}

export interface PublicTeam {
  id: string
  seat: number
  name: string
  userName: string
  userId: string | null
  color: string
  sigil: number
  score: number
  handCount: number
  tokens: PublicToken[]
  barachiel: boolean
  immune: boolean
  connected: boolean
  bot: boolean
}

export interface ParamOption {
  value: string
  label: string
  hint?: string
  color?: string
  faction?: string
}

export interface ParamSpec {
  key: string
  label: string
  mode: 'one' | 'many'
  min: number
  max: number
  options: ParamOption[]
  distinct?: boolean
}

export interface HandCard {
  id: string
  key: string
  playable: boolean
  reason?: string
  params: ParamSpec[]
}

export interface PublicQuestion {
  index: number
  text: string
  options: string[]
  source: 'semanario' | 'libre'
  week: number | null
  topic: string
  attempt: 1 | 2
  teamId: string | null
  firstTeamId: string | null
  redirectedFrom: string | null
  /** Sólo tras revelarse la respuesta */
  correctIndex: number | null
  explanation: string | null
  pickedIndex: number | null
  result: 'correct' | 'wrong' | 'timeout' | 'auto' | 'skipped' | null
  awarded: { teamId: string; points: number } | null
}

export type PublicPending =
  | { id: number; kind: 'reaction'; victimTeamId: string; sourceTeamId: string; cardKey: string; shield: boolean; gamble: boolean; deadline: number }
  | { id: number; kind: 'dice_window'; rollerTeamId: string; cardKey: string; sides: number; value: number; canInvalidate: boolean; deadline: number }
  | { id: number; kind: 'deny_vote'; sourceTeamId: string; cardKey: string; canDeny: boolean; deadline: number }
  | { id: number; kind: 'input'; teamId: string; cardKey: string; title: string; spec: ParamSpec[] | null; peek: string[] | null; deadline: number }
  | { id: number; kind: 'side_question'; askerTeamId: string; targetTeamId: string; text: string | null; options: string[] | null; deadline: number }
  | { id: number; kind: 'delay'; label: string; deadline: number }

export type LogKind = 'info' | 'dice' | 'card' | 'score' | 'token' | 'question' | 'system' | 'warn'

export interface LogEntry {
  seq: number
  at: number
  kind: LogKind
  text: string
  data?: Record<string, unknown>
}

export interface PileCard {
  id: string
  key: string
  pile: 'played' | 'retired'
  sealed: boolean
}

export interface RoomSnapshot {
  code: string
  serverNow: number
  phase: Phase
  paused: boolean
  hostUserId: string
  hostName: string
  hostPlays: boolean
  settings: GameSettings
  teams: PublicTeam[]
  qDone: number
  totalQuestions: number
  cardsLocked: boolean
  question: PublicQuestion | null
  clock: { deadline: number | null; remainingMs: number | null; totalMs: number; frozen: boolean } | null
  pending: PublicPending | null
  /** El equipo del jugador que mira (null si es docente/observador) */
  me: { teamId: string | null; isHost: boolean; isAdmin: boolean }
  hand: HandCard[]
  piles: { played: number; retired: number; deck: number; browsable: PileCard[] }
  lastPlayed: { key: string; teamId: string } | null
  namedPlayed: number
  donation: { excess: Record<string, number>; submitted: string[] } | null
  log: LogEntry[]
  whispers: Whisper[]
  result: GameResult | null
}

export interface Whisper {
  from: string
  to: string | 'all'
  text: string
  at: number
}

export interface GameResultTeam {
  teamId: string
  name: string
  userName: string
  color: string
  rawScore: number
  finalScore: number
  donated: number
  correct: number
  tokens: { name: string; origin: string; grade: number; status: 'in' | 'out' }[]
}

export interface GameResult {
  id: number | null
  code: string
  finishedAt: number
  totalQuestions: number
  teams: GameResultTeam[]
}

// ───────────────────────── Mensajes WebSocket ─────────────────────────

export type ClientMsg =
  | { t: 'team_update'; name?: string; color?: string; sigil?: number; tokenNames?: string[] }
  | { t: 'settings'; patch: Partial<GameSettings> }
  | { t: 'add_bot' }
  | { t: 'remove_team'; teamId: string }
  | { t: 'start' }
  | { t: 'answer'; option: number }
  | { t: 'play_card'; cardId: string; params: Record<string, string[]> }
  | { t: 'respond'; pendingId: number; choice: string; params?: Record<string, string[]>; option?: number }
  | { t: 'whisper'; to: string; text: string }
  | { t: 'donate'; allocation: Record<string, number> }
  | { t: 'host'; action: 'pause' | 'resume' | 'skip' | 'next' | 'end' | 'adjust' | 'kick'; teamId?: string; delta?: number }
  | { t: 'ping' }

export type ServerMsg =
  | { t: 'state'; state: RoomSnapshot }
  | { t: 'error'; message: string }
  | { t: 'kicked'; reason: string }
  | { t: 'pong' }

export const TEAM_COLORS = [
  '#d4a73a', // oro
  '#5aa9e6', // azur
  '#c44569', // carmesí
  '#7bc97b', // verde alquímico
  '#9b6bd6', // amatista
  '#e8833a', // ámbar
]
