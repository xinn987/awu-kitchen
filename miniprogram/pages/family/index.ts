/** 家庭成员：云端成员列表、微信分享邀请与管理员移出。 */
import {
  createInvite, listMembers, removeMember, type MemberViewData,
} from '../../services/family-service'
import { ApiError } from '../../services/cloud-client'
import { invalidateState } from '../../services/recipe-store'

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
      // 成员接口本身已经校验微信身份和家庭资格，不再串行等待 session.bootstrap。
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
    } catch (error) {
      if (error instanceof ApiError
        && (error.code === 'NO_MEMBERSHIP' || error.code === 'MEMBERSHIP_REMOVED')) return
      this.showToast(error instanceof Error ? error.message : '家庭成员加载失败')
    }
  },

  /** 邀请码只有在用户主动操作时才创建，避免每次打开家庭页都产生云端写入。 */
  async issueInvite(showMessage: boolean): Promise<string | undefined> {
    if (this.data.renewingInvite) return undefined
    this.setData({ renewingInvite: true })
    try {
      const invite = await createInvite()
      const hoursLeft = Math.max(1, Math.ceil((invite.expiresAt - Date.now()) / 3600000))
      this.setData({ inviteToken: invite.token, inviteExpireLabel: `${hoursLeft} 小时内有效` })
      if (showMessage) this.showToast('已生成新的单次邀请')
      return invite.token
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '邀请生成失败')
      return undefined
    } finally {
      this.setData({ renewingInvite: false })
    }
  },

  async renewInvite() {
    await this.issueInvite(true)
  },

  /** 体验版暂不依赖原生分享能力，复制单次邀请码后通过微信文字发送。 */
  async copyInvite() {
    const token = this.data.inviteToken || await this.issueInvite(false)
    if (!token) return
    wx.setClipboardData({
      data: token,
      success: () => this.showToast('邀请码已复制'),
      fail: () => this.showToast('复制失败，请重试'),
    })
  },

  // 保留邀请链接兼容能力，正式发布后可继续使用微信分享卡片。
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
