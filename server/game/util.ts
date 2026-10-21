export function randInt(n: number): number {
  if (n <= 1) return 0
  const max = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= max)
  return buf[0] % n
}

/** Dado de `sides` caras (1..sides) con CSPRNG */
export const rollDie = (sides = 6) => randInt(sides) + 1

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const pick = <T>(arr: readonly T[]): T => arr[randInt(arr.length)]

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)

export function genCode(len = 5): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < len; i++) s += alphabet[randInt(alphabet.length)]
  return s
}

/** Reloj pausable: un temporizador con retención (hold) para suspender/reanudar. */
export class Clock {
  private id: ReturnType<typeof setTimeout> | null = null
  deadline: number | null = null
  remaining: number | null = null
  total = 0
  private fn: (() => void) | null = null
  private holds = 0

  get active() {
    return this.fn !== null
  }
  get frozen() {
    return this.fn !== null && this.deadline === null
  }

  start(ms: number, fn: () => void) {
    this.clear()
    this.total = ms
    this.fn = fn
    if (this.holds > 0) {
      this.remaining = ms
    } else this.arm(ms)
  }

  private arm(ms: number) {
    this.deadline = Date.now() + ms
    this.remaining = null
    this.id = setTimeout(() => {
      this.id = null
      this.deadline = null
      this.remaining = null
      const f = this.fn
      this.fn = null
      f?.()
    }, ms)
  }

  hold() {
    if (this.holds++ === 0 && this.id) {
      clearTimeout(this.id)
      this.id = null
      this.remaining = Math.max(0, (this.deadline ?? Date.now()) - Date.now())
      this.deadline = null
    }
  }

  release() {
    if (this.holds === 0) return
    if (--this.holds === 0 && this.fn && this.remaining !== null) this.arm(this.remaining)
  }

  clear() {
    if (this.id) clearTimeout(this.id)
    this.id = null
    this.deadline = null
    this.remaining = null
    this.fn = null
    this.total = 0
  }
}
