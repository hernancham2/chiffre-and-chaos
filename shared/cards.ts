// Metadatos estáticos de los 40 Arcanos (la lógica vive en server/game/cards.ts).
// Textos fieles al "Instructivo Examen" (Listado de cartas).

export type Faction = 'celestial' | 'infernal' | 'neutral' | 'chaos'

export type CardTiming =
  | 'answering' // se puede jugar durante el tiempo de la pregunta
  | 'answering_team' // sólo el equipo que está respondiendo
  | 'post_award' // justo después de que un equipo ganó puntos por una pregunta
  | 'reactive' // se activa como respuesta (no se juega desde la mano)

export interface CardMeta {
  n: number
  key: string
  name: string
  faction: Faction
  icon: string
  text: string
  timing: CardTiming
  dice?: boolean
}

const c = (
  n: number,
  key: string,
  name: string,
  faction: Faction,
  icon: string,
  text: string,
  timing: CardTiming = 'answering',
  dice = false,
): CardMeta => ({ n, key, name, faction, icon, text, timing, dice })

export const CARDS: CardMeta[] = [
  c(1, 'graciosa_caridad', 'Graciosa caridad', 'celestial', 'HeartHandshake', 'Suma 2 puntos a tu equipo o a otro equipo que señales.'),
  c(2, 'san_miguel_caido', 'San Miguel caído', 'infernal', 'Sword', 'Resta 2 puntos a tu puntuación o a la de otro equipo.'),
  c(3, 'caridad_lucifer', 'Caridad de Lucifer', 'infernal', 'Flame', 'Ganas 3 puntos, pero pierdes a 2 integrantes, cediéndolos al equipo que elijas.'),
  c(4, 'orden_delegado', 'Orden del delegado', 'infernal', 'Crown', 'Quitas la mitad de los puntos a un equipo y los sumas a los tuyos, pero pierdes la mitad de tus integrantes: cada uno va a un equipo distinto.'),
  c(5, 'gratitud_jeudiel', 'Gratitud de Jeudiel', 'celestial', 'UserMinus', 'Retiras del juego a un participante de cualquier equipo; su calificación será el puntaje actual de su equipo.'),
  c(6, 'escudo_misericordia', 'Escudo de la misericordia', 'celestial', 'ShieldCheck', 'Protege a tu equipo del efecto de una carta, sin perder puntos. Se activa al ser atacado.', 'reactive'),
  c(7, 'apostador_vida', 'Apostador de vida', 'chaos', 'Dices', 'Lanza el dado: si sale par, te proteges de una carta gratis; si sale impar, pagas 2 puntos para protegerte. Se activa al ser atacado.', 'reactive', true),
  c(8, 'equivalencia_intercambio', 'Equivalencia de intercambio', 'neutral', 'Scale', 'Suma los puntos de todos los equipos y repártelos en partes iguales (redondeado).'),
  c(9, 'fuego_uriel', 'Fuego de Uriel', 'celestial', 'Flame', 'Seleccionas a un integrante de otro equipo y lo incorporas al tuyo.'),
  c(10, 'ayuda_gabriel', 'Ayuda de Gabriel', 'celestial', 'Feather', 'Si tu equipo debe responder, obtienes automáticamente los puntos de la pregunta sin contestarla.', 'answering_team'),
  c(11, 'pacto_socios', 'Pacto de socios', 'neutral', 'Handshake', 'Intercambias una carta con otro equipo, a ciegas: ninguno conoce la carta que entrega.'),
  c(12, 'divinidad_barachiel', 'Divinidad de Barachiel', 'celestial', 'Sun', 'Ganas 1 punto por turno, hasta que se active una carta en otro equipo.'),
  c(13, 'sanacion_rafael', 'Sanación de Rafael', 'celestial', 'Cross', 'Recuperas gratis a un integrante perdido; si no has perdido ninguno, tomas uno de otro equipo pagando 2 puntos.'),
  c(14, 'rezo_sealtiel', 'Rezo a Sealtiel', 'celestial', 'HandHeart', 'Si te toca responder, redirige la pregunta a otro equipo: si falla ganas 2 puntos, si acierta pierdes 1.', 'answering_team'),
  c(15, 'designador_cruzada', 'Designador de cruzada', 'neutral', 'Crosshair', 'Elige un equipo y nombra una carta: si la tiene, se retira del juego.'),
  c(16, 'copion', 'Copión', 'chaos', 'Copy', 'Copia el efecto de la última carta jugada por cualquier equipo.'),
  c(17, 'santuario_ritual', 'Santuario ritual', 'celestial', 'Church', 'Ganas 1 punto por cada carta que descartes (incluida ésta). Las descartadas ya no se pueden usar.'),
  c(18, 'entierro_insensato', 'Entierro extra insensato', 'infernal', 'Skull', 'Pagas 5 puntos para descartar la mitad de las cartas de un equipo. Requiere más de 5 puntos.'),
  c(19, 'gobernante_oscuro', 'Gobernante oscuro', 'infernal', 'Gavel', 'Te prestas un integrante de otro equipo durante 3 preguntas; luego regresa.'),
  c(20, 'forzar_activacion', 'Forzar activación', 'infernal', 'Eye', 'Eliges un equipo, ves sus cartas y fuerzas la activación de una de ellas.'),
  c(21, 'agua_vida', 'Agua de vida', 'celestial', 'Droplets', 'Todos los equipos que controlen más de 2 cartas ganan 2 puntos.'),
  c(22, 'anguila_avaricia', 'Anguila de la avaricia', 'infernal', 'Fish', 'Intercambias una carta con cada equipo; si alguno no tiene, le donas una. Requiere 3+ cartas.'),
  c(23, 'contrato_destino', 'Contrato del destino', 'infernal', 'ScrollText', 'Si se jugaron 4+ cartas con nombre angelical/demoníaco, retiras a la mitad de tu equipo con la nota actual.'),
  c(24, 'pandemonium', 'Pandemónium', 'infernal', 'Ghost', 'Regresas a un estudiante retirado: se une a tu equipo con tu puntuación.'),
  c(25, 'ironia_belcebu', 'Ironía de Belcebú', 'infernal', 'Bug', 'Regresas a un retirado con su origen y quitas 1 punto a todos los demás equipos. Requiere 2+ retirados.'),
  c(26, 'compania_querubines', 'Compañía de querubines', 'celestial', 'Baby', 'Cada equipo gana 1 punto por cada integrante que le falte para completar 4.'),
  c(27, 'dado_caridad', 'Dado caridad', 'chaos', 'Dice5', 'Lanzas el dado: el nº es el equipo elegido; ganas 1 punto por cada integrante suyo. Si algún equipo lo niega, pierdes 2.', 'answering', true),
  c(28, 'dado_inhumano', 'Dado inhumano', 'infernal', 'Dice6', 'Eliges un equipo y lanzas el dado: pierde tantos puntos como el número obtenido.', 'answering', true),
  c(29, 'segunda_opinion', 'Segunda opinión', 'chaos', 'RefreshCcw', 'Invalida el primer lanzamiento de dado de una carta y exige uno nuevo. Se activa al ver un lanzamiento.', 'reactive'),
  c(30, 'dadofon', 'Dadofón', 'chaos', 'Dices', 'Lanzas el dado y aplicas el efecto del número: 1 +3 pts · 2 intercambias miembro · 3 retiras uno y +2 · 4 cambias carta · 5 −2 a un equipo · 6 sacas a un integrante.', 'answering', true),
  c(31, 'ayuda_ladrones', 'Ayuda de ladrones', 'infernal', 'HandMetal', 'Le quitas una carta a cualquier equipo.'),
  c(32, 'chico_cobarde', 'Chico cobarde', 'neutral', 'Rabbit', 'Si te toca responder y no sabes, pides una nueva pregunta.', 'answering_team'),
  c(33, 'quita_trampas', 'El quita trampas', 'neutral', 'ShieldOff', 'Cuando un equipo tenga más de 6 puntos: retiras una carta de cualquier equipo, ganas 2 y los demás pierden 1.'),
  c(34, 'mas_fuerte', 'El más fuerte', 'neutral', 'BicepsFlexed', 'Eliges un equipo: se barajan las cartas de ambos y se reparten por igual (si es impar, una más para ti).'),
  c(35, 'espina', 'La espina', 'neutral', 'Pin', 'Tomas para tu mano una carta de las jugadas o retiradas del juego.'),
  c(36, 'acertado', 'El acertado', 'chaos', 'Target', 'Lanzas el dado y aplicas el efecto del número: 1 fuerza Ayuda de ladrones · 2 saltas la pregunta y +2/+1 · 3 fuerza El más fuerte · 4 recuperas una carta retirada · 5 preguntas a un equipo (+2 si falla) · 6 −2 a quien no porte cartas "ayuda".', 'answering', true),
  c(37, 'rompe_victoria', 'Rompe victoria', 'infernal', 'Zap', 'Robas los puntos que un equipo obtuvo por una pregunta, justo después de otorgárselos.', 'post_award'),
  c(38, 'destruccion_cartas', 'Destrucción de cartas', 'infernal', 'Bomb', 'Eliges un equipo y lanzas el dado: descarta ese nº de cartas y tú pierdes tantos puntos como descartó.', 'answering', true),
  c(39, 'pago_dolor', 'Pago al dolor', 'infernal', 'Gem', 'Ambos equipos (el elegido y el tuyo) descartan de 1 a 4 cartas; tú decides cuántas.'),
  c(40, 'simbolo_amistad', 'Símbolo de la amistad', 'celestial', 'Link2', 'Durante 5 turnos ninguna carta ni el docente pueden seleccionarte. Requiere más de 6 puntos.'),
]

export const CARD_BY_KEY: Record<string, CardMeta> = Object.fromEntries(CARDS.map((x) => [x.key, x]))

/** Cartas con nombre angelical/demoníaco para el Contrato del destino. */
export const NAMED_KEYS = new Set([
  'san_miguel_caido', // Miguel
  'caridad_lucifer', // Lucifer
  'divinidad_barachiel', // Barachiel
  'gratitud_jeudiel', // Jeudiel
  'fuego_uriel', // Uriel
  'ayuda_gabriel', // Gabriel
  'sanacion_rafael', // Rafael
  'rezo_sealtiel', // Sealtiel
])

export const FACTION_LABEL: Record<Faction, string> = {
  celestial: 'Celestial',
  infernal: 'Infernal',
  neutral: 'Arcano',
  chaos: 'Caos',
}
