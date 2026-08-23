/** 家庭成员：管理员只负责邀请和移除，不拥有额外食谱权限。 */
import { FAMILY_NAME } from '../../data/seed'
import { getCurrentUser, getState, inviteMember, removeMember } from '../../services/recipe-store'

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
    familyName: FAMILY_NAME,
    members: [] as MemberView[],
    memberCount: 0,
    inviteOpen: false,
    inviteInput: '',
    canInvite: false,
    removingId: '',
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
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
        recipe.createdBy === member.name || recipe.updatedBy === member.name).length,
    }))
    this.setData({ members, memberCount: members.length })
  },

  openInvite() { this.setData({ inviteOpen: true }) },
  closeInvite() { this.setData({ inviteOpen: false, inviteInput: '', canInvite: false }) },

  onInviteInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const inviteInput = event.detail.value
    this.setData({ inviteInput, canInvite: inviteInput.trim().length > 0 })
  },

  sendInvite() {
    if (!this.data.canInvite) return
    inviteMember(this.data.inviteInput)
    this.closeInvite()
    this.refresh()
    this.showToast('已添加家庭成员')
  },

  askRemove(event: WechatMiniprogram.BaseEvent) {
    this.setData({ removingId: String(event.currentTarget.dataset.id) })
  },
  cancelRemove() { this.setData({ removingId: '' }) },
  confirmRemove() {
    if (!this.data.removingId) return
    removeMember(this.data.removingId)
    this.setData({ removingId: '' })
    this.refresh()
    this.showToast('已移出家庭成员')
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

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return { title: '家味 · 邀请家人一起维护家庭食谱', path: '/pages/family/index' }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
