import crypto from 'crypto'
import { ensureUser, getActiveContext, requireAdmin, type MemberRecord } from './auth'
import { db } from './cloud'
import { DomainError, assertDomain } from './errors'
import { normalizeDisplayName, requiredText } from './validation'
import { defaultRecipeOptions } from './recipe-option-model'
const MEMBER_COLORS = ['#BF5924', '#4A7C8A', '#6B8A4A', '#8A6A4A', '#6A5A8A']
const INVITE_TTL = 24 * 60 * 60 * 1000

function id(prefix: string): string {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function viewMember(member: MemberRecord) {
  return {
    id: member._id,
    name: member.displayName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    color: member.color,
  }
}

export async function bootstrap(userId: string) {
  const user = await ensureUser(userId)
  if (!user.activeMemberId) return { status: 'onboarding' as const }
  try {
    const { member } = await getActiveContext(userId, user)
    const familyResult = await db.collection('families').doc(member.familyId).get() as unknown as {
      data: { _id: string; name: string }
    }
    const family = familyResult.data as { _id: string; name: string }
    return {
      status: 'ready' as const,
      family: { id: family._id, name: family.name },
      member: viewMember(member),
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === 'MEMBERSHIP_REMOVED') {
      await db.collection('users').doc(userId).update({ data: { activeMemberId: null } })
      return { status: 'removed' as const }
    }
    throw error
  }
}

export async function createFamily(userId: string, payload: Record<string, unknown>) {
  const familyName = requiredText(payload.familyName, '家庭名称', 40)
  const displayName = normalizeDisplayName(payload.displayName)
  const familyId = id('f-')
  const memberId = id('m-')
  const now = new Date().toISOString()

  // 正常客户端会先 bootstrap；这里仍确保直接调用创建接口时用户文档存在。
  await ensureUser(userId)
  await db.runTransaction(async (transaction: any) => {
    const userResult = await transaction.collection('users').doc(userId).get()
    const user = userResult.data as { activeMemberId?: string | null }
    assertDomain(!user.activeMemberId, 'ALREADY_IN_FAMILY', '你已经加入了一个家庭')
    await transaction.collection('families').doc(familyId).set({
      data: {
        name: familyName,
        adminMemberId: memberId,
        recipeOptions: defaultRecipeOptions(),
        createdAt: now,
        updatedAt: now,
      },
    })
    await transaction.collection('family_members').doc(memberId).set({
      data: {
        familyId, userId, displayName, role: 'admin', status: 'active',
        color: MEMBER_COLORS[0], joinedAt: now,
      },
    })
    await transaction.collection('users').doc(userId).update({ data: { activeMemberId: memberId, lastSeenAt: now } })
  })
  return bootstrap(userId)
}

export async function createInvite(userId: string) {
  const { member } = await getActiveContext(userId)
  requireAdmin(member)
  const token = crypto.randomBytes(32).toString('base64url')
  const inviteId = id('inv-')
  const now = Date.now()
  await db.collection('family_invites').doc(inviteId).set({
    data: {
      familyId: member.familyId,
      tokenHash: hashToken(token),
      createdByMemberId: member._id,
      status: 'active',
      createdAt: new Date(now).toISOString(),
      expiresAt: now + INVITE_TTL,
    },
  })
  return { token, expiresAt: now + INVITE_TTL }
}

async function findInvite(token: unknown) {
  const value = requiredText(token, '邀请链接', 200)
  const result = await db.collection('family_invites')
    .where({ tokenHash: hashToken(value) }).limit(1).get() as unknown as { data: Array<Record<string, unknown>> }
  const invite = result.data[0] as Record<string, unknown> | undefined
  if (!invite) throw new DomainError('INVITE_INVALID', '邀请链接无效')
  if (invite.status === 'used') throw new DomainError('INVITE_USED', '这个邀请已经被使用')
  if (invite.status !== 'active' || Number(invite.expiresAt) <= Date.now()) {
    throw new DomainError('INVITE_EXPIRED', '这个邀请已经过期')
  }
  return invite
}

export async function previewInvite(token: unknown) {
  const invite = await findInvite(token)
  const familyResult = await db.collection('families').doc(String(invite.familyId)).get() as unknown as {
    data: { name: string }
  }
  const family = familyResult.data as { name: string }
  return { familyName: family.name, expiresAt: Number(invite.expiresAt) }
}

export async function joinFamily(userId: string, payload: Record<string, unknown>) {
  const token = requiredText(payload.token, '邀请链接', 200)
  const displayName = normalizeDisplayName(payload.displayName)
  const invite = await findInvite(token)
  const inviteId = String(invite._id)
  const familyId = String(invite.familyId)
  const memberId = id('m-')
  const now = new Date().toISOString()

  // 保证没有走过 bootstrap 的受邀用户也能正常加入。
  await ensureUser(userId)
  await db.runTransaction(async (transaction: any) => {
    const userResult = await transaction.collection('users').doc(userId).get()
    const user = userResult.data as { activeMemberId?: string | null }
    assertDomain(!user.activeMemberId, 'ALREADY_IN_FAMILY', '你已经加入了一个家庭')
    const inviteResult = await transaction.collection('family_invites').doc(inviteId).get()
    const currentInvite = inviteResult.data as { status: string; expiresAt: number }
    assertDomain(currentInvite.status === 'active', 'INVITE_USED', '这个邀请已经被使用')
    assertDomain(currentInvite.expiresAt > Date.now(), 'INVITE_EXPIRED', '这个邀请已经过期')
    const sameName = await transaction.collection('family_members')
      .where({ familyId, displayName, status: 'active' }).limit(1).get()
    assertDomain(sameName.data.length === 0, 'DISPLAY_NAME_TAKEN', '这个家庭称谓已经有人使用')
    // 颜色只用于展示，直接从随机成员 ID 稳定派生，避免为此增加一次计数查询。
    const colorIndex = Number.parseInt(memberId.slice(-2), 16) % MEMBER_COLORS.length
    await transaction.collection('family_members').doc(memberId).set({
      data: {
        familyId, userId, displayName, role: 'member', status: 'active',
        color: MEMBER_COLORS[colorIndex], joinedAt: now,
      },
    })
    await transaction.collection('family_invites').doc(inviteId).update({
      data: { status: 'used', usedByUserId: userId, usedAt: now },
    })
    await transaction.collection('users').doc(userId).update({ data: { activeMemberId: memberId, lastSeenAt: now } })
  })
  return bootstrap(userId)
}

export async function listMembers(userId: string) {
  const { member: current } = await getActiveContext(userId)
  const [familyRaw, memberRaw, recipeRaw] = await Promise.all([
    db.collection('families').doc(current.familyId).get(),
    db.collection('family_members').where({ familyId: current.familyId, status: 'active' }).limit(100).get(),
    // 成员贡献只需要归因字段，不把食谱正文和完整修订历史带进成员页。
    db.collection('recipes').where({ familyId: current.familyId })
      .field({ createdById: true, updatedById: true, archivedAt: true }).limit(100).get(),
  ])
  const familyResult = familyRaw as unknown as { data: { _id: string; name: string } }
  const memberResult = memberRaw as unknown as { data: MemberRecord[] }
  const recipeResult = recipeRaw as unknown as {
    data: Array<{ createdById: string; updatedById: string; archivedAt?: string }>
  }
  const family = familyResult.data
  const recipes = recipeResult.data.filter((recipe) => !recipe.archivedAt)
  const members = memberResult.data.map((item) => ({
    ...viewMember(item),
    contributionCount: recipes.filter((recipe) =>
      recipe.createdById === item._id || recipe.updatedById === item._id).length,
  }))
  return {
    family: { id: family._id, name: family.name },
    currentMemberId: current._id,
    members,
  }
}

export async function removeMember(userId: string, payload: Record<string, unknown>) {
  const { member: current } = await getActiveContext(userId)
  requireAdmin(current)
  const targetId = requiredText(payload.memberId, '成员', 80)
  assertDomain(targetId !== current._id, 'FORBIDDEN', '管理员不能移出自己')
  const now = new Date().toISOString()
  await db.runTransaction(async (transaction: any) => {
    const targetResult = await transaction.collection('family_members').doc(targetId).get()
    const target = targetResult.data as MemberRecord
    assertDomain(target.familyId === current.familyId && target.status === 'active', 'VALIDATION_ERROR', '成员不存在')
    assertDomain(target.role !== 'admin', 'FORBIDDEN', '不能移出家庭管理员')
    await transaction.collection('family_members').doc(targetId).update({ data: { status: 'removed', removedAt: now } })
    await transaction.collection('users').doc(target.userId).update({ data: { activeMemberId: null } })
  })
  return { removedMemberId: targetId }
}
