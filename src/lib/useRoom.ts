import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ClientMsg, RoomSnapshot, ServerMsg } from '@shared/types'

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'kicked' | 'missing'

export function useRoom(code: string) {
  const [state, setState] = useState<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const skew = useRef(0)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let retry = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let ping: ReturnType<typeof setInterval> | undefined

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const sock = new WebSocket(`${proto}://${location.host}/api/ws/${code}`)
      ws.current = sock
      sock.onopen = () => {
        retry = 0
        setStatus('open')
        ping = setInterval(() => sock.readyState === 1 && sock.send(JSON.stringify({ t: 'ping' })), 20_000)
      }
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMsg
        if (msg.t === 'state') {
          skew.current = msg.state.serverNow - Date.now()
          setState(msg.state)
        } else if (msg.t === 'error') toast.error(msg.message)
        else if (msg.t === 'kicked') {
          closed = true
          setStatus('kicked')
          toast.error(msg.reason)
        }
      }
      sock.onclose = (e) => {
        clearInterval(ping)
        if (closed) return
        if (e.code === 4004 || e.code === 4001) {
          closed = true
          setStatus('missing')
          return
        }
        setStatus('reconnecting')
        timer = setTimeout(connect, Math.min(5000, 600 * 2 ** retry++))
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      clearInterval(ping)
      ws.current?.close()
    }
  }, [code])

  const send = useCallback((msg: ClientMsg) => {
    if (ws.current?.readyState === 1) ws.current.send(JSON.stringify(msg))
    else toast.error('Sin conexión con el servidor')
  }, [])

  const now = useCallback(() => Date.now() + skew.current, [])
  return { state, status, send, now }
}

/** Milisegundos restantes de un reloj del servidor, actualizado ~10 veces por segundo. */
export function useRemaining(clock: { deadline: number | null; remainingMs: number | null; frozen: boolean } | null, now: () => number) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 100)
    return () => clearInterval(id)
  }, [])
  if (!clock) return null
  if (clock.frozen || clock.deadline === null) return clock.remainingMs ?? 0
  return Math.max(0, clock.deadline - now())
}
