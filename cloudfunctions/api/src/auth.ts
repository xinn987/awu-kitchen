import crypto from 'crypto'
import cloud, { nullableDb as db } from './cloud'
import { DomainError } from './errors'

export interface UserRecord {
  _id: string
  activeMemberId?: string | null
  createdAt: string
  lastSeenAt: string
}

export interface MemberRecord {
  _id: string
  familyId: string
  userId: string
  displayName: string
  role: 'admin' | 'member'
  status: 'active' | 'removed'
  color: string
  joinedAt: string
  removedAt?: string
}

/** OpenID 只在云函数内出现；稳定摘要作为内部用户 ID，数据库不保存 OpenID 明文。 */
export function currentUserId(): string {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new DomainError('SERVICE_UNAVAILABLE', '暂时无法识别微信身份，请稍后重试')
  // 120 位摘要已远超首版碰撞需求，同时把自定义文档 ID 控制在 32 字符内。
  const digest = crypto.createHash('sha256').update(`awu-kitchen:${OPENID}`).digest('hex').slice(0, 30)
  return `u-${digest}`
}

export async function ensureUser(userId: string): Promise<UserRecord> {
  const now = new Date().toISOString()
  const result = await db.collection('users').doc(userId).get() as unknown as { data: UserRecord | null }
  const user = result.data
  if (user) {
    await db.collection('users').doc(userId).update({ data: { lastSeenAt: now } })
    return { ...user, lastSeenAt: now }
  }
  const created: UserRecord = { _id: userId, activeMemberId: null, createdAt: now, lastSeenAt: now }
  // doc(userId) 已经决定了 _id；CloudBase 禁止在 set 的 data 中再次写入 _id。
  await db.collection('users').doc(userId).set({
    data: { activeMemberId: null, createdAt: now, lastSeenAt: now },
  })
  return created
}

export async function getActiveContext(userId: string): Promise<{ user: UserRecord; member: MemberRecord }> {
  const user = await ensureUser(userId)
  if (!user.activeMemberId) throw new DomainError('NO_MEMBERSHIP', '你还没有加入家庭')
  const result = await db.collection('family_members').doc(user.activeMemberId).get() as unknown as {
    data: MemberRecord | null
  }
  const member = result.data
  if (!member || member.status !== 'active') {
    throw new DomainError('MEMBERSHIP_REMOVED', '家庭成员资格已失效')
  }
  return { user, member }
}

export function requireAdmin(member: MemberRecord): void {
  if (member.role !== 'admin') throw new DomainError('FORBIDDEN', '只有家庭管理员可以进行此操作')
}
