import type { Family, Member } from './recipe'

export type Session =
  | { status: 'onboarding' }
  | { status: 'removed' }
  | { status: 'ready'; family: Family; member: Member }

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export interface InvitePreview {
  familyName: string
  expiresAt: number
}
