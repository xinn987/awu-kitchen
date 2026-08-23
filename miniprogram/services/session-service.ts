import type { Session } from '../models/api'
import { callApi } from './cloud-client'

let cached: Session | undefined
let pending: Promise<Session> | undefined

export function bootstrapSession(force = false): Promise<Session> {
  if (!force && cached) return Promise.resolve(cached)
  if (!force && pending) return pending
  pending = callApi<Session>('session.bootstrap').then((session) => {
    cached = session
    pending = undefined
    return session
  }).catch((error: unknown) => {
    pending = undefined
    throw error
  })
  return pending
}

export function setSession(session: Session): void {
  cached = session
  pending = undefined
}

export function clearSession(): void {
  cached = undefined
  pending = undefined
}
