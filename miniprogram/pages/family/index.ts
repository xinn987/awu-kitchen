/** 家庭成员：邀请码 + 微信分享邀请；管理员只负责邀请和移除。 */
import {
  getCurrentUser,
  getMemberById,
  getOrCreateInvite,
  getState,
  joinByInviteCode,
  removeMember,
  saveState,
} from '../../services/recipe-store'

interface MemberView {
  id: string
  name: string
  color: string
  roleLabel: string
  isAdmin: boolean
  isSelf: boolean
  canRemove: boolean
  contributionCount: number
}

Page({
  data: {
    statusBarHeight: 20,
    familyName: '',
    members: [] as MemberView[],
    memberCount: 0,
    inviteCode: '',
    inviteExpireLabel: '',
    joinOpen: false,
    joinCode: '',
    joinName: '',
    canJoin: false,
    removingId: '',
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
    // 通过家人分享卡片打开：预填邀请码，进入加入流程（Phase B 会拦截「已是成员」）。
    if (options.invite) {
      this.setData({ joinOpen: true, joinCode: options.invite }, () => this.updateCanJoin())
    }
  },

  onShow() { this.refresh() },

  refresh() {
    const state = getState()
    const currentUser = getCurrentUser(state)
    const members = state.members.map((member): MemberView => ({
      id: member.id,
      name: member.name,
      color: member.color || '#8A7E74',
      roleLabel: member.role === 'admin' ? '管理员' : '成员',
      isAdmin: member.role === 'admin',
      isSelf: member.id === currentUser.id,
      canRemove: currentUser.role === 'admin' && member.id !== currentUser.id,
      contributionCount: state.recipes.filter((recipe) =>
        recipe.createdById === member.id || recipe.updatedById === member.id).length,
    }))
    const invite = getOrCreateInvite(state)
    const hoursLeft = Math.max(1, Math.ceil((invite.expiresAt - Date.now()) / 3_600_000))
    this.setData({
      familyName: state.family.name,
      members,
      memberCount: members.length,
      inviteCode: invite.code,
      inviteExpireLabel: `${hoursLeft} 小时内有效`,
    })
  },

  /** —— 邀请 —— */
  copyInviteCode() {
    wx.setClipboardData({ data: this.data.inviteCode })
  },

  renewInvite() {
    const state = getState()
    state.family.invite = undefined
    saveState(state)
    this.refresh()
    this.showToast('已生成新邀请码')
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return {
      title: `邀请你加入「${this.data.familyName || '家庭食谱'}」`,
      path: `/pages/family/index?invite=${this.data.inviteCode}`,
    }
  },

  /** —— 手输邀请码加入（兜底） —— */
  openJoin() {
    this.setData({ joinOpen: true, joinCode: '', joinName: '', canJoin: false })
  },

  closeJoin() { this.setData({ joinOpen: false }) },

  onJoinCodeInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ joinCode: event.detail.value }, () => this.updateCanJoin())
  },

  onJoinNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ joinName: event.detail.value }, () => this.updateCanJoin())
  },

  updateCanJoin() {
    this.setData({ canJoin: this.data.joinCode.length === 6 && this.data.joinName.trim().length > 0 })
  },

  submitJoin() {
    if (!this.data.canJoin) return
    const result = joinByInviteCode(this.data.joinCode, this.data.joinName)
    this.showToast(result.message)
    if (result.ok) {
      this.setData({ joinOpen: false, joinCode: '', joinName: '' })
      this.refresh()
    }
  },

  /** —— 移出成员 —— */
  askRemove(event: WechatMiniprogram.BaseEvent) {
    this.setData({ removingId: String(event.currentTarget.dataset.id) })
  },

  cancelRemove() { this.setData({ removingId: '' }) },

  confirmRemove() {
    if (!this.data.removingId) return
    const state = getState()
    const target = getMemberById(state, this.data.removingId)
    removeMember(this.data.removingId)
    this.setData({ removingId: '' })
    this.refresh()
    this.showToast(target ? `已移出「${target.name}」` : '已移出成员')
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
