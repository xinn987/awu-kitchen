import { ApiError } from '../../services/cloud-client'
import { createFamily, joinFamily, previewInvite } from '../../services/family-service'
import { bootstrapSession } from '../../services/session-service'

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    saving: false,
    inviteToken: '',
    inviteFamilyName: '',
    familyName: '我们的家庭食谱',
    displayName: '',
    canSubmit: false,
    errorMessage: '',
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight || 20,
      inviteToken: options.invite || '',
    })
    void this.initialize()
  },

  async initialize() {
    try {
      const session = await bootstrapSession(true)
      if (session.status === 'ready') {
        wx.reLaunch({ url: '/pages/library/index' })
        return
      }
      if (this.data.inviteToken) {
        const preview = await previewInvite(this.data.inviteToken)
        this.setData({ inviteFamilyName: preview.familyName })
      }
      this.setData({ loading: false, errorMessage: '' })
    } catch (error) {
      this.setData({ loading: false, errorMessage: this.messageOf(error) })
    }
  },

  onFamilyNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ familyName: event.detail.value }, () => this.recompute())
  },

  onDisplayNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ displayName: event.detail.value }, () => this.recompute())
  },

  recompute() {
    this.setData({
      canSubmit: this.data.displayName.trim().length > 0
        && (Boolean(this.data.inviteToken) || this.data.familyName.trim().length > 0),
    })
  },

  async submit() {
    if (!this.data.canSubmit || this.data.saving) return
    this.setData({ saving: true, errorMessage: '' })
    try {
      const session = this.data.inviteToken
        ? await joinFamily(this.data.inviteToken, this.data.displayName)
        : await createFamily(this.data.familyName, this.data.displayName)
      if (session.status !== 'ready') throw new ApiError('SERVICE_UNAVAILABLE', '家庭初始化没有完成')
      wx.reLaunch({ url: '/pages/library/index' })
    } catch (error) {
      this.setData({ saving: false, errorMessage: this.messageOf(error) })
    }
  },

  retry() {
    this.setData({ loading: true, errorMessage: '' })
    void this.initialize()
  },

  messageOf(error: unknown): string {
    return error instanceof Error ? error.message : '暂时无法连接家庭数据'
  },
})
