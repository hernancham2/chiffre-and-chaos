import { CARDS, CARD_BY_KEY } from '../../shared/cards'
import type { ParamOption, ParamSpec } from '../../shared/types'
import type { Room } from './room'
import type { Params, Script, Team, Token } from './types'
import { pick, shuffle } from './util'

export interface Ctx {
  g: Room
  team: Team
  params: Params
  cardKey: string
  instId?: string
  forced?: boolean
}

export interface CardDef {
  /** Condiciones para poder jugarla (null = ok). No incluye la ventana temporal. */
  check?: (g: Room, t: Team) => string | null
  spec?: (g: Room, t: Team) => ParamSpec[]
  run: (c: Ctx) => Script
}

// ───────── helpers de opciones ─────────
const teamOpt = (t: Team): ParamOption => ({ value: t.id, label: t.name, color: t.color })
const tokOpt = (g: Room, tok: Token): ParamOption => {
  const owner = g.team(tok.team)
  return { value: tok.id, label: tok.name, hint: owner.name, color: owner.color }
}
const one = (key: string, label: string, options: ParamOption[]): ParamSpec => ({ key, label, mode: 'one', min: 1, max: 1, options })
const many = (key: string, label: string, min: number, max: number, options: ParamOption[], distinct = true): ParamSpec => ({
  key, label, mode: 'many', min, max, options, distinct,
})

const otherTeams = (g: Room, t: Team) => g.teams.filter((x) => x.id !== t.id && !g.isImmune(x))
const selectableTeams = (g: Room, t: Team) => g.teams.filter((x) => x.id === t.id || !g.isImmune(x))
const teamsWithCards = (g: Room, t: Team) => otherTeams(g, t).filter((x) => x.hand.length > 0)
const foreignTokens = (g: Room, t: Team) =>
  otherTeams(g, t).flatMap((o) => g.activeTokens(o.id).filter((tok) => !tok.loan))
const cardNameOptions = (): ParamOption[] =>
  CARDS.map((c) => ({ value: c.key, label: `${c.n}. ${c.name}`, faction: c.faction }))

const randomCard = (t: Team) => pick(t.hand)

const NO_TARGETS = 'No hay objetivos válidos'

// ───────── definiciones ─────────
export const DEFS: Record<string, CardDef> = {
  graciosa_caridad: {
    spec: (g, t) => [one('team', 'Equipo que recibirá +2', selectableTeams(g, t).map(teamOpt))],
    *run({ g, team, params }) {
      g.addScore(params.team[0], 2, 'Graciosa caridad')
    },
  },

  san_miguel_caido: {
    spec: (g, t) => [one('team', 'Equipo que perderá 2 puntos', selectableTeams(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = params.team[0]
      if (target !== team.id) {
        const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target], cardKey }
        if (shielded.has(target)) return
      }
      g.addScore(target, -2, 'San Miguel caído')
    },
  },

  caridad_lucifer: {
    check: (g, t) => (g.activeTokens(t.id).length < 2 ? 'Necesitas al menos 2 integrantes' : null),
    spec: (g, t) => [one('team', 'Equipo que recibirá a tus 2 integrantes', otherTeams(g, t).map(teamOpt))],
    *run({ g, team, params }) {
      const target = params.team[0]
      g.addScore(team.id, 3, 'Caridad de Lucifer')
      const toks = g.activeTokens(team.id).slice(-2)
      for (const tok of toks) g.moveToken(tok.id, target)
      g.log('token', `${team.name} cede 2 integrantes a ${g.team(target).name}.`)
    },
  },

  orden_delegado: {
    check: (g, t) => {
      const n = g.activeTokens(t.id).length
      if (n < 2) return 'Necesitas al menos 2 integrantes para perder la mitad'
      return null
    },
    spec: (g, t) => {
      const k = Math.floor(g.activeTokens(t.id).length / 2)
      const others = otherTeams(g, t)
      return [
        one('team', 'Equipo al que quitas la mitad de sus puntos', others.map(teamOpt)),
        many('dest', `Equipos destino de tus ${k} integrante(s) perdido(s) (distintos)`, k, k, g.teams.filter((x) => x.id !== t.id).map(teamOpt)),
      ]
    },
    *run({ g, team, params, cardKey }) {
      const target = params.team[0]
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target], cardKey }
      if (shielded.has(target)) return
      const half = Math.floor(g.team(target).score / 2)
      g.addScore(target, -half, 'Orden del delegado')
      g.addScore(team.id, half, 'Orden del delegado')
      const toks = g.activeTokens(team.id).slice(0, params.dest.length)
      toks.forEach((tok, i) => g.moveToken(tok.id, params.dest[i]))
      g.log('token', `${team.name} sacrifica a la mitad de su equipo.`)
    },
  },

  gratitud_jeudiel: {
    spec: (g, t) => {
      const opts = g.teams.filter((x) => x.id === t.id || !g.isImmune(x)).flatMap((x) => g.activeTokens(x.id)).map((tok) => tokOpt(g, tok))
      return [one('token', 'Participante a retirar del juego', opts)]
    },
    *run({ g, team, params, cardKey }) {
      const tok = g.token(params.token[0])
      if (tok.team !== team.id) {
        const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [tok.team], cardKey }
        if (shielded.has(tok.team)) return
      }
      g.removeToken(tok.id)
    },
  },

  escudo_misericordia: { check: () => 'Se activa sola cuando te atacan', *run() {} },
  apostador_vida: { check: () => 'Se activa sola cuando te atacan', *run() {} },
  segunda_opinion: { check: () => 'Se activa sola al ver un lanzamiento de dado', *run() {} },

  equivalencia_intercambio: {
    *run({ g, team, cardKey }) {
      const total = g.teams.reduce((s, t) => s + t.score, 0)
      const avg = Math.round(total / g.teams.length)
      const victims = g.teams.filter((t) => t.id !== team.id && t.score > avg).map((t) => t.id)
      const shielded: Set<string> = victims.length
        ? yield { t: 'react', source: team.id, victims, cardKey }
        : new Set<string>()
      for (const t of g.teams) {
        if (shielded.has(t.id)) continue
        g.setScore(t.id, avg, 'Equivalencia de intercambio')
      }
      g.log('info', `Todos los puntajes se igualan a ${avg}.`)
    },
  },

  fuego_uriel: {
    spec: (g, t) => [one('token', 'Integrante a incorporar a tu equipo', foreignTokens(g, t).map((k) => tokOpt(g, k)))],
    *run({ g, team, params, cardKey }) {
      const tok = g.token(params.token[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [tok.team], cardKey }
      if (shielded.has(tok.team)) return
      g.moveToken(tok.id, team.id)
    },
  },

  ayuda_gabriel: {
    *run({ g, team }) {
      g.interrupt = { kind: 'auto_correct', team: team.id }
    },
  },

  pacto_socios: {
    check: (g, t) => (t.hand.length < 2 ? 'Necesitas otra carta para intercambiar' : null),
    spec: (g, t) => [one('team', 'Equipo con el que pactas', teamsWithCards(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id) || !team.hand.length || !target.hand.length) return
      const mine = randomCard(team)
      const theirs = randomCard(target)
      g.swapCards(team, mine, target, theirs)
      g.log('card', `${team.name} y ${target.name} intercambian un arcano a ciegas.`)
    },
  },

  divinidad_barachiel: {
    *run({ g, team }) {
      team.barachiel = true
      g.log('card', `${team.name} recibirá +1 punto por turno hasta que otro equipo active una carta.`)
    },
  },

  sanacion_rafael: {
    check: () => null,
    spec: (g, t) => {
      const lost = g.lostTokens(t.id)
      if (lost.length) return [one('token', 'Integrante perdido a recuperar (gratis)', lost.map((k) => tokOpt(g, k)))]
      return [one('token', 'Integrante de otro equipo a integrar (−2 puntos)', foreignTokens(g, t).map((k) => tokOpt(g, k)))]
    },
    *run({ g, team, params, cardKey }) {
      const tok = g.token(params.token[0])
      if (tok.origin === team.id && tok.status === 'out') {
        g.restoreToken(tok.id, team.id)
        return
      }
      const holder = tok.team
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [holder], cardKey }
      if (shielded.has(holder)) return
      if (tok.origin !== team.id) g.addScore(team.id, -2, 'Sanación de Rafael')
      g.moveToken(tok.id, team.id)
    },
  },

  rezo_sealtiel: {
    spec: (g, t) => [one('team', 'Equipo al que rediriges la pregunta', otherTeams(g, t).filter((x) => x.id !== g.q?.firstTeamId || g.q?.attempt === 1).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = params.team[0]
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target], cardKey }
      if (shielded.has(target)) return
      g.interrupt = { kind: 'redirect', from: team.id, to: target }
    },
  },

  designador_cruzada: {
    spec: (g, t) => [
      one('team', 'Equipo a designar', otherTeams(g, t).map(teamOpt)),
      one('card', 'Nombre de la carta que declaras', cardNameOptions()),
    ],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const key = params.card[0]
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id)) return
      const found = target.hand.find((c) => c.key === key)
      if (found) {
        g.retireFrom(target, found)
        g.log('card', `¡Acierto! ${target.name} tenía «${CARD_BY_KEY[key].name}» y se retira del juego.`)
      } else {
        g.log('card', `${target.name} no tenía «${CARD_BY_KEY[key].name}». La cruzada falla.`)
      }
    },
  },

  copion: {
    check: (g, t) => {
      const last = g.lastPlayed
      if (!last) return 'Todavía no se jugó ninguna carta'
      const d = DEFS[last.key]
      const meta = CARD_BY_KEY[last.key]
      if (meta.timing === 'reactive') return 'No se puede copiar una carta reactiva'
      if (!g.timingOk(t, meta)) return `No se puede copiar «${meta.name}» en este momento`
      const why = d.check?.(g, t)
      if (why) return `«${meta.name}»: ${why}`
      return null
    },
    spec: (g, t) => (g.lastPlayed ? DEFS[g.lastPlayed.key].spec?.(g, t) ?? [] : []),
    *run(c) {
      const last = c.g.lastPlayed
      if (!last) return
      c.g.log('card', `Copión imita «${CARD_BY_KEY[last.key].name}».`)
      yield* DEFS[last.key].run({ ...c, cardKey: last.key })
    },
  },

  santuario_ritual: {
    spec: (g, t) => {
      const opts = t.hand.map((c) => ({ value: c.id, label: CARD_BY_KEY[c.key].name, faction: CARD_BY_KEY[c.key].faction }))
      return [many('cards', 'Cartas a descartar (cada una da +1 punto)', 0, opts.length, opts)]
    },
    *run({ g, team, params, instId }) {
      for (const id of params.cards ?? []) {
        const c = team.hand.find((x) => x.id === id)
        if (c) g.retireFrom(team, c, true)
      }
      if (instId) g.sealPlayed(instId)
      const n = (params.cards ?? []).length + 1
      g.addScore(team.id, n, 'Santuario ritual')
    },
  },

  entierro_insensato: {
    check: (_g, t) => (t.score <= 5 ? 'Tu puntuación debe ser mayor a 5' : null),
    spec: (g, t) => [one('team', 'Equipo cuyas cartas se descartan', selectableTeams(g, t).filter((x) => x.hand.length > 1 || x.id === t.id).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      if (target.id !== team.id) {
        const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
        if (shielded.has(target.id)) return
      }
      g.addScore(team.id, -5, 'Entierro extra insensato')
      const n = Math.floor(target.hand.length / 2)
      for (const c of shuffle(target.hand).slice(0, n)) g.retireFrom(target, c)
      g.log('card', `${target.name} pierde ${n} carta(s) enterrada(s).`)
    },
  },

  gobernante_oscuro: {
    spec: (g, t) => [one('token', 'Integrante a tomar prestado 3 preguntas', foreignTokens(g, t).map((k) => tokOpt(g, k)))],
    *run({ g, team, params, cardKey }) {
      const tok = g.token(params.token[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [tok.team], cardKey }
      if (shielded.has(tok.team)) return
      const returnTo = tok.team
      g.moveToken(tok.id, team.id)
      tok.loan = { returnTo, until: g.qDone + 3 }
    },
  },

  forzar_activacion: {
    spec: (g, t) => [one('team', 'Equipo cuyas cartas verás', teamsWithCards(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const victim = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [victim.id], cardKey }
      if (shielded.has(victim.id)) return
      const usable = victim.hand.filter((c) => {
        const meta = CARD_BY_KEY[c.key]
        if (meta.timing === 'reactive') return false
        return g.cardInfo(victim, c).playable
      })
      if (!usable.length) {
        g.log('card', `${victim.name} no tiene cartas que puedan forzarse.`)
        return
      }
      const [pickedId]: string[] = (yield {
        t: 'ask',
        team: team.id,
        cardKey,
        title: `Cartas de ${victim.name}: fuerza la activación de una`,
        peek: victim.hand.map((c) => c.key),
        spec: [one('card', 'Carta a forzar', usable.map((c) => ({ value: c.id, label: CARD_BY_KEY[c.key].name, faction: CARD_BY_KEY[c.key].faction })))],
      }).card
      const inst = victim.hand.find((c) => c.id === pickedId)
      if (!inst) return
      const sub = g.cardInfo(victim, inst).params
      const params2: Params = sub.length
        ? yield { t: 'ask', team: team.id, cardKey: inst.key, title: `Elige los parámetros de «${CARD_BY_KEY[inst.key].name}» (forzada)`, spec: sub }
        : {}
      yield* g.activate(victim, inst, params2, { forced: true })
    },
  },

  agua_vida: {
    *run({ g }) {
      for (const t of g.teams) if (t.hand.length > 2) g.addScore(t.id, 2, 'Agua de vida')
    },
  },

  anguila_avaricia: {
    check: (g, t) => (t.hand.length < 3 ? 'Necesitas al menos 3 cartas en tu poder' : null),
    *run({ g, team, cardKey }) {
      const victims = g.teams.filter((x) => x.id !== team.id).map((x) => x.id)
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims, cardKey }
      for (const other of shuffle(g.teams.filter((x) => x.id !== team.id && !shielded.has(x.id)))) {
        if (!team.hand.length) break
        const mine = randomCard(team)
        if (other.hand.length) g.swapCards(team, mine, other, randomCard(other))
        else g.transferCard(team, mine, other)
      }
      g.log('card', `${team.name} comercia con la Anguila de la avaricia.`)
    },
  },

  contrato_destino: {
    check: (g, t) => {
      if (g.namedPlayed < 4) return `Se necesitan 4 cartas con nombre (van ${g.namedPlayed})`
      if (g.activeTokens(t.id).length < 2) return 'Necesitas al menos 2 integrantes'
      return null
    },
    spec: (g, t) => {
      const toks = g.activeTokens(t.id)
      const k = Math.floor(toks.length / 2)
      return [many('tokens', `Integrantes a retirar (${k})`, k, k, toks.map((x) => tokOpt(g, x)))]
    },
    *run({ g, params }) {
      for (const id of params.tokens) g.removeToken(id)
    },
  },

  pandemonium: {
    check: (g) => (g.outTokens().length < 1 ? 'No hay estudiantes retirados' : null),
    spec: (g) => [one('token', 'Estudiante retirado que regresa a tu equipo', g.outTokens().map((k) => tokOpt(g, k)))],
    *run({ g, team, params }) {
      g.restoreToken(params.token[0], team.id)
    },
  },

  ironia_belcebu: {
    check: (g) => (g.outTokens().length < 2 ? 'Se necesitan 2 estudiantes retirados' : null),
    spec: (g) => [one('token', 'Retirado que regresa a su equipo de origen', g.outTokens().map((k) => tokOpt(g, k)))],
    *run({ g, team, params, cardKey }) {
      const tok = g.token(params.token[0])
      g.restoreToken(tok.id, tok.origin)
      const victims = g.teams.filter((x) => x.id !== team.id).map((x) => x.id)
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims, cardKey }
      for (const id of victims) if (!shielded.has(id)) g.addScore(id, -1, 'Ironía de Belcebú')
    },
  },

  compania_querubines: {
    *run({ g }) {
      for (const t of g.teams) {
        const missing = Math.max(0, 4 - g.activeTokens(t.id).length)
        if (missing) g.addScore(t.id, missing, 'Compañía de querubines')
      }
    },
  },

  dado_caridad: {
    *run({ g, team, cardKey }) {
      const v: number = yield { t: 'roll', sides: g.teams.length, by: team.id, cardKey }
      const target = g.teams.find((t) => t.seat === v) ?? g.teams[0]
      g.log('card', `El dado señala al equipo nº ${v}: ${target.name}.`)
      if (g.isImmune(target) && target.id !== team.id) {
        g.log('warn', `${target.name} está protegido por el Símbolo de la amistad.`)
        return
      }
      const denied: boolean = yield { t: 'deny', source: team.id, cardKey }
      if (denied) {
        g.log('warn', 'Un equipo niega la activación: pierdes 2 puntos.')
        g.addScore(team.id, -2, 'Dado caridad negado')
        return
      }
      g.addScore(team.id, g.activeTokens(target.id).length, 'Dado caridad')
    },
  },

  dado_inhumano: {
    spec: (g, t) => [one('team', 'Equipo que sufrirá el dado', otherTeams(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = params.team[0]
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target], cardKey }
      if (shielded.has(target)) return
      const v: number = yield { t: 'roll', sides: 6, by: team.id, cardKey }
      g.addScore(target, -v, 'Dado inhumano')
    },
  },

  dadofon: {
    *run({ g, team, cardKey }) {
      const v: number = yield { t: 'roll', sides: 6, by: team.id, cardKey }
      const mine = () => g.activeTokens(team.id)
      const title = (s: string) => `Dadofón (${v}): ${s}`
      switch (v) {
        case 1:
          g.addScore(team.id, 3, 'Dadofón')
          return
        case 2: {
          const theirs = foreignTokens(g, team)
          if (!mine().length || !theirs.length) return g.log('warn', 'Dadofón: no hay integrantes que intercambiar.')
          const p: Params = yield {
            t: 'ask', team: team.id, cardKey, title: title('intercambia un integrante'),
            spec: [one('mine', 'Tu integrante', mine().map((k) => tokOpt(g, k))), one('theirs', 'Integrante del otro equipo', theirs.map((k) => tokOpt(g, k)))],
          }
          const other = g.token(p.theirs[0])
          const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [other.team], cardKey }
          if (shielded.has(other.team)) return
          g.swapTokens(p.mine[0], other.id)
          return
        }
        case 3: {
          if (!mine().length) return
          const p: Params = yield { t: 'ask', team: team.id, cardKey, title: title('retira a un miembro de tu equipo (+2 puntos)'), spec: [one('token', 'Miembro a retirar', mine().map((k) => tokOpt(g, k)))] }
          g.removeToken(p.token[0]) // sale con la puntuación anterior
          g.addScore(team.id, 2, 'Dadofón')
          return
        }
        case 4: {
          const targets = teamsWithCards(g, team)
          if (!team.hand.length || !targets.length) return g.log('warn', 'Dadofón: no hay cartas que intercambiar.')
          const p: Params = yield {
            t: 'ask', team: team.id, cardKey, title: title('intercambia una carta'),
            spec: [one('card', 'Tu carta', team.hand.map((c) => ({ value: c.id, label: CARD_BY_KEY[c.key].name, faction: CARD_BY_KEY[c.key].faction }))), one('team', 'Equipo con el que cambias', targets.map(teamOpt))],
          }
          const other = g.team(p.team[0])
          const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [other.id], cardKey }
          const mineCard = team.hand.find((c) => c.id === p.card[0])
          if (shielded.has(other.id) || !mineCard || !other.hand.length) return
          g.swapCards(team, mineCard, other, randomCard(other))
          return
        }
        case 5: {
          const p: Params = yield { t: 'ask', team: team.id, cardKey, title: title('−2 puntos a un equipo'), spec: [one('team', 'Equipo objetivo', otherTeams(g, team).map(teamOpt))] }
          const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [p.team[0]], cardKey }
          if (!shielded.has(p.team[0])) g.addScore(p.team[0], -2, 'Dadofón')
          return
        }
        default: {
          const opts = g.teams.filter((x) => x.id === team.id || !g.isImmune(x)).flatMap((x) => g.activeTokens(x.id))
          if (!opts.length) return
          const p: Params = yield { t: 'ask', team: team.id, cardKey, title: title('saca del juego a un integrante'), spec: [one('token', 'Integrante a retirar', opts.map((k) => tokOpt(g, k)))] }
          const tok = g.token(p.token[0])
          if (tok.team !== team.id) {
            const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [tok.team], cardKey }
            if (shielded.has(tok.team)) return
          }
          g.removeToken(tok.id)
        }
      }
    },
  },

  ayuda_ladrones: {
    spec: (g, t) => [one('team', 'Equipo al que le quitas una carta', teamsWithCards(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id) || !target.hand.length) return
      const c = randomCard(target)
      g.transferCard(target, c, team)
      g.log('card', `${team.name} roba un arcano a ${target.name}.`)
    },
  },

  chico_cobarde: {
    *run({ g }) {
      g.interrupt = { kind: 'new_question' }
    },
  },

  quita_trampas: {
    check: (g) => (g.teams.some((t) => t.score > 6) ? null : 'Ningún equipo tiene más de 6 puntos'),
    spec: (g, t) => [one('team', 'Equipo del que retiras una carta', teamsWithCards(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const victims = g.teams.filter((x) => x.id !== team.id).map((x) => x.id)
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims, cardKey }
      if (!shielded.has(target.id) && target.hand.length) g.retireFrom(target, randomCard(target))
      g.addScore(team.id, 2, 'El quita trampas')
      for (const id of victims) if (!shielded.has(id)) g.addScore(id, -1, 'El quita trampas')
    },
  },

  mas_fuerte: {
    spec: (g, t) => [one('team', 'Equipo con el que se barajan las cartas', otherTeams(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id)) return
      const pool = shuffle([...team.hand, ...target.hand])
      const half = Math.floor(pool.length / 2)
      const theirs = pool.slice(0, half)
      const mine = pool.slice(half)
      team.hand = mine
      target.hand = theirs
      g.log('card', `${team.name} y ${target.name} reparten sus cartas por igual.`)
    },
  },

  espina: {
    check: (g) => (g.browsableCards().length ? null : 'No hay cartas jugadas o retiradas'),
    spec: (g) => [
      one('card', 'Carta a incorporar a tu mano', g.browsableCards().map((c) => ({ value: c.id, label: CARD_BY_KEY[c.key].name, hint: c.pile === 'played' ? 'jugada' : 'retirada', faction: CARD_BY_KEY[c.key].faction }))),
    ],
    *run({ g, team, params }) {
      g.takeFromPile(params.card[0], team)
    },
  },

  acertado: {
    *run({ g, team, cardKey }) {
      const v: number = yield { t: 'roll', sides: 6, by: team.id, cardKey }
      const title = (s: string) => `El acertado (${v}): ${s}`
      const force = function* (key: string): Script {
        const holders = g.teams.filter((x) => x.id !== team.id && x.hand.some((c) => c.key === key))
        if (!holders.length) return g.log('warn', `Ningún equipo porta «${CARD_BY_KEY[key].name}».`)
        const holder = pick(holders)
        const inst = holder.hand.find((c) => c.key === key)!
        const sub = g.cardInfo(holder, inst).params
        if (!g.cardInfo(holder, inst).playable) return g.log('warn', `«${CARD_BY_KEY[key].name}» no puede activarse ahora.`)
        const p: Params = sub.length ? yield { t: 'ask', team: team.id, cardKey: key, title: title(`fuerzas «${CARD_BY_KEY[key].name}» de ${holder.name}`), spec: sub } : {}
        yield* g.activate(holder, inst, p, { forced: true })
      }
      switch (v) {
        case 1:
          return yield* force('ayuda_ladrones')
        case 2: {
          if (g.q?.teamId !== team.id || g.phase !== 'answering') return g.log('warn', 'No eras el equipo en turno: nada ocurre.')
          g.addScore(team.id, 2, 'El acertado')
          for (const t of g.teams) if (t.id !== team.id) g.addScore(t.id, 1, 'El acertado')
          g.interrupt = { kind: 'skip', team: team.id }
          return
        }
        case 3:
          return yield* force('mas_fuerte')
        case 4: {
          const retired = g.browsableCards().filter((c) => c.pile === 'retired')
          if (!retired.length) return g.log('warn', 'No hay cartas retiradas.')
          const p: Params = yield { t: 'ask', team: team.id, cardKey, title: title('recupera una carta retirada'), spec: [one('card', 'Carta retirada', retired.map((c) => ({ value: c.id, label: CARD_BY_KEY[c.key].name, faction: CARD_BY_KEY[c.key].faction })))] }
          g.takeFromPile(p.card[0], team)
          return
        }
        case 5: {
          const p: Params = yield { t: 'ask', team: team.id, cardKey, title: title('lanza una pregunta a un equipo'), spec: [one('team', 'Equipo interrogado', otherTeams(g, team).map(teamOpt))] }
          const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [p.team[0]], cardKey }
          if (shielded.has(p.team[0])) return
          const ok: boolean = yield { t: 'side_q', asker: team.id, target: p.team[0] }
          if (!ok) g.addScore(team.id, 2, 'El acertado')
          return
        }
        default: {
          const keys = new Set(['ayuda_ladrones', 'chico_cobarde', 'quita_trampas', 'mas_fuerte', 'espina', 'acertado'])
          const victims = g.teams.filter((x) => x.id !== team.id && !x.hand.some((c) => keys.has(c.key))).map((x) => x.id)
          if (!victims.length) return g.log('info', 'Todos los equipos portan alguna carta de ayuda.')
          const shielded: Set<string> = yield { t: 'react', source: team.id, victims, cardKey }
          for (const id of victims) if (!shielded.has(id)) g.addScore(id, -2, 'El acertado')
        }
      }
    },
  },

  rompe_victoria: {
    check: (g, t) => {
      const a = g.q?.awarded
      if (!a) return 'Aún no se otorgaron puntos'
      if (a.teamId === t.id) return 'Los puntos ya son tuyos'
      if (g.isImmune(g.team(a.teamId))) return 'El equipo está protegido'
      return null
    },
    *run({ g, team, cardKey }) {
      const a = g.q?.awarded
      if (!a) return
      const victim = a.teamId
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [victim], cardKey }
      if (shielded.has(victim)) return
      g.addScore(victim, -a.points, 'Rompe victoria')
      g.addScore(team.id, a.points, 'Rompe victoria')
      if (g.q) g.q.awarded = { teamId: team.id, points: a.points }
    },
  },

  destruccion_cartas: {
    spec: (g, t) => [one('team', 'Equipo que descarta cartas', teamsWithCards(g, t).map(teamOpt))],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id)) return
      const v: number = yield { t: 'roll', sides: 6, by: team.id, cardKey }
      const n = Math.min(v, target.hand.length)
      for (const c of shuffle(target.hand).slice(0, n)) g.retireFrom(target, c)
      g.addScore(team.id, -n, 'Destrucción de cartas')
      g.log('card', `${target.name} descarta ${n} carta(s); ${team.name} paga ${n} punto(s).`)
    },
  },

  pago_dolor: {
    spec: (g, t) => [
      one('team', 'Equipo que descarta contigo', otherTeams(g, t).map(teamOpt)),
      one('n', 'Cartas que descarta cada equipo (1 a 4)', [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))),
    ],
    *run({ g, team, params, cardKey }) {
      const target = g.team(params.team[0])
      const shielded: Set<string> = yield { t: 'react', source: team.id, victims: [target.id], cardKey }
      if (shielded.has(target.id)) return
      const n = Number(params.n[0])
      for (const t of [team, target]) {
        for (const c of shuffle(t.hand).slice(0, n)) g.retireFrom(t, c)
      }
      g.log('card', `Ambos equipos descartan hasta ${n} carta(s).`)
    },
  },

  simbolo_amistad: {
    check: (_g, t) => (t.score <= 6 ? 'Tu puntaje debe ser mayor a 6' : null),
    *run({ g, team }) {
      team.immuneUntil = g.qDone + 5
      g.log('card', `${team.name} queda protegido durante 5 turnos.`)
    },
  },
}
