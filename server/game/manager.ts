import type { ServerMsg, GameSettings } from '../../shared/types'
import type { SessionUser } from '../auth'
import { loadQuestions, saveResult } from '../store'
import { Room } from './room'
import { genCode } from './util'

export interface Conn {
  ws: { send(data: string): void; close(code?: number, reason?: string): void }
  user: SessionUser
}

class RoomManager {
  rooms = new Map<string, Room>()
  conns = new Map<string, Set<Conn>>()

  create(host: SessionUser, hostPlays: boolean, settings: GameSettings): Room {
    let code = genCode()
    while (this.rooms.has(code)) code = genCode()
    const room = new Room(code, { id: host.id, name: host.name }, hostPlays, settings, { loadQuestions, saveResult })
    this.rooms.set(code, room)
    this.conns.set(code, new Set())
    room.listeners.add(() => this.broadcast(room))
    room.onKick = (userId, reason) => {
      for (const c of this.conns.get(code) ?? []) {
        if (c.user.id === userId) {
          this.send(c, { t: 'kicked', reason })
          c.ws.close(4000, reason)
        }
      }
    }
    return room
  }

  get(code: string) {
    return this.rooms.get(code.toUpperCase())
  }

  send(c: Conn, msg: ServerMsg) {
    try {
      c.ws.send(JSON.stringify(msg))
    } catch {}
  }

  sendState(room: Room, c: Conn) {
    this.send(c, { t: 'state', state: room.snapshot(c.user.id, c.user.role === 'admin') })
  }

  broadcast(room: Room) {
    for (const c of this.conns.get(room.code) ?? []) this.sendState(room, c)
  }

  attach(room: Room, c: Conn) {
    this.conns.get(room.code)!.add(c)
    room.join(c.user.id, c.user.name)
    this.broadcast(room)
  }

  detach(room: Room, c: Conn) {
    const set = this.conns.get(room.code)
    set?.delete(c)
    if (![...(set ?? [])].some((x) => x.user.id === c.user.id)) room.setConnected(c.user.id, false)
  }

  close(code: string) {
    const room = this.rooms.get(code)
    if (!room) return
    for (const c of this.conns.get(code) ?? []) {
      this.send(c, { t: 'kicked', reason: 'La sala fue cerrada' })
      c.ws.close(4001, 'closed')
    }
    room.dispose()
    this.rooms.delete(code)
    this.conns.delete(code)
  }

  sweep() {
    const now = Date.now()
    for (const [code, room] of this.rooms) {
      const online = (this.conns.get(code)?.size ?? 0) > 0
      const idle = now - room.lastActivity
      if ((!online && idle > 30 * 60_000) || idle > 6 * 3600_000) this.close(code)
    }
  }
}

export const manager = new RoomManager()
setInterval(() => manager.sweep(), 60_000).unref?.()
