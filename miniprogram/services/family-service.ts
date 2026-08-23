import type { InvitePreview, Session } from '../models/api'
import type { Family, Member } from '../models/recipe'
import { callApi } from './cloud-client'
import { setSession } from './session-service'

export interface MemberViewData extends Member {
  contributionCount: number
}

export interface FamilyMembersData {
  family: Family
  currentMemberId: string
  members: MemberViewData[]
}

export async function createFamily(familyName: string, displayName: string): Promise<Session> {
  const session = await callApi<Session>('family.create', { familyName, displayName })
  setSession(session)
  return session
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return callApi('family.previewInvite', { token })
}

export async function joinFamily(token: string, displayName: string): Promise<Session> {
  const session = await callApi<Session>('family.join', { token, displayName })
  setSession(session)
  return session
}

export function createInvite(): Promise<{ token: string; expiresAt: number }> {
  return callApi('family.createInvite')
}

export function listMembers(): Promise<FamilyMembersData> {
  return callApi('family.listMembers')
}

export function removeMember(memberId: string): Promise<{ removedMemberId: string }> {
  return callApi('family.removeMember', { memberId })
}
