/** 独立设置栏目：承载食谱维护入口和版本信息，不再寄生在家庭页。 */
import { DEVELOPMENT_VERSION } from '../../config/version'

function displayVersion(): string {
  const accountInfo = wx.getAccountInfoSync()
  const runtimeVersion = accountInfo.miniProgram.version.trim()
  const version = runtimeVersion || DEVELOPMENT_VERSION
  return version.startsWith('v') ? version : `v${version}`
}

Page({
  data: {
    statusBarHeight: 20,
    versionLabel: '',
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() {
    this.setData({
      statusBarHeight: wx.getWindowInfo().statusBarHeight || 20,
      versionLabel: displayVersion(),
    })
  },

  openRecipeOptions() {
    wx.navigateTo({ url: '/pages/recipe-options/index' })
  },

  openTrash() {
    wx.navigateTo({ url: '/pages/trash/index' })
  },

  openCapture() { this.setData({ captureOpen: true }) },
  closeCapture() { this.setData({ captureOpen: false }) },
  openImport() {
    this.setData({ captureOpen: false })
    wx.navigateTo({ url: '/pages/recipe-import/index' })
  },
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
