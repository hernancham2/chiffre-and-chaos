import type { ParamSpec } from '../../shared/types'

export class GameError extends Error {}

export interface Token {
  id: string
  name: string
  origin: string
  team: string
  status: 'in' | 'out'
  grade: number | null
  loan: { returnTo: string; until: number } | null
}

export interface CardInst {
  id: string
  key: string
  sealed?: boolean
}

export interface Team {
  id: string
  seat: number
  userId: string | null
  userName: string
  name: string
  color: string
  sigil: number
  score: number
  hand: CardInst[]
  tokens: Token[]
  barachiel: boolean
  immuneUntil: number
  connected: boolean
  bot: boolean
  correct: number
  donated: number
  rawScore: number
}

export interface RuntimeQuestion {
  id: number
  text: string
  options: string[]
  correctIndex: number
  source: 'semanario' | 'libre'
  week: number | null
  topic: string
  explanation: string
}

export type Interrupt =
  | { kind: 'auto_correct'; team: string }
  | { kind: 'redirect'; from: string; to: string }
  | { kind: 'new_question' }
  | { kind: 'skip'; team: string }

// ───────── protocolo de scripts de cartas ─────────
export type Req =
  | { t: 'roll'; sides: number; by: string; cardKey: string }
  | { t: 'react'; source: string; victims: string[]; cardKey: string }
  | { t: 'ask'; team: string; title: string; cardKey: string; spec: ParamSpec[]; peek?: string[] }
  | { t: 'deny'; source: string; cardKey: string }
  | { t: 'side_q'; asker: string; target: string }
  | { t: 'wait'; ms: number; label: string }

export type Script = Generator<Req, void, any>

export type Params = Record<string, string[]>
