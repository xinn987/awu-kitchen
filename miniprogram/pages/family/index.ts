/** 家庭成员：云端成员列表、微信分享邀请与管理员移出。 */
import {
  createInvite, listMembers, removeMember, type MemberViewData,
} from '../../services/family-service'
import { invalidateState } from '../../services/recipe-store'
import { bootstrapSession } from '../../services/session-service'

interface MemberView extends MemberViewData {
  roleLabel: string
  isAdmin: boolean
  isSelf: boolean
  canRemove: boolean
}

Page({
  data: {
    statusBarHeight: 20,
    familyName: '',
    members: [] as MemberView[],
    memberCount: 0,
    inviteToken: '',
    inviteExpireLabel: '',
    canInvite: false,
    renewingInvite: false,
    removingId: '',
    removing: false,
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
  },

  onShow() { void this.refresh() },

  async refresh() {
    try {
      const session = await bootstrapSession()
      if (session.status !== 'ready') {
        wx.reLaunch({ url: '/pages/onboarding/index' })
        return
      }
      const data = await listMembers()
      const current = data.members.find((member) => member.id === data.currentMemberId)
      const isCurrentAdmin = Boolean(current && current.role === 'admin')
      const members = data.members.map((member): MemberView => ({
        ...member,
        roleLabel: member.role === 'admin' ? '管理员' : '成员',
        isAdmin: member.role === 'admin',
        isSelf: member.id === data.currentMemberId,
        canRemove: Boolean(isCurrentAdmin && member.id !== data.currentMemberId),
      }))
      this.setData({
        familyName: data.family.name,
        members,
        memberCount: members.length,
        canInvite: Boolean(isCurrentAdmin),
      })
      if (isCurrentAdmin && !this.data.inviteToken) await this.renewInvite(false)
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '家庭成员加载失败')
    }
  },

  async renewInvite(showMessage = true) {
    if (this.data.renewingInvite) return
    this.setData({ renewingInvite: true })
    try {
      const invite = await createInvite()
      const hoursLeft = Math.max(1, Math.ceil((invite.expiresAt - Date.now()) / 3600000))
      this.setData({ inviteToken: invite.token, inviteExpireLabel: `${hoursLeft} 小时内有效` })
      if (showMessage) this.showToast('已生成新的单次邀请')
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '邀请生成失败')
    } finally {
      this.setData({ renewingInvite: false })
    }
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return {
      title: `阿呜厨房 · 邀请你加入「${this.data.familyName || '家庭食谱'}」`,
      path: `/pages/onboarding/index?invite=${encodeURIComponent(this.data.inviteToken)}`,
    }
  },

  askRemove(event: WechatMiniprogram.BaseEvent) {
    this.setData({ removingId: String(event.currentTarget.dataset.id) })
  },

  cancelRemove() { this.setData({ removingId: '' }) },

  async confirmRemove() {
    if (!this.data.removingId || this.data.removing) return
    const target = this.data.members.find((member) => member.id === this.data.removingId)
    this.setData({ removing: true })
    try {
      await removeMember(this.data.removingId)
      invalidateState()
      this.setData({ removingId: '', removing: false })
      await this.refresh()
      this.showToast(target ? `已移出「${target.name}」` : '已移出成员')
    } catch (error) {
      this.setData({ removingId: '', removing: false })
      this.showToast(error instanceof Error ? error.message : '移出失败，请重试')
    }
  },

  openCapture() { this.setData({ captureOpen: true }) },
  closeCapture() { this.setData({ captureOpen: false }) },

  onCaptured(event: WechatMiniprogram.CustomEvent<{ id: string; formal: boolean; message: string }>) {
    const { id, formal, message } = event.detail
    this.setData({ captureOpen: false })
    if (formal) {
      wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}&toast=${encodeURIComponent(message)}` })
    } else {
      this.showToast(message)
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
