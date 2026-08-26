/** 设置页首版只承担版本识别，后续有真实配置需求时再增加条目。 */
import { DEVELOPMENT_VERSION } from '../../config/version'

function displayVersion(): string {
  const accountInfo = wx.getAccountInfoSync()
  const runtimeVersion = accountInfo.miniProgram.version.trim()
  const version = runtimeVersion || DEVELOPMENT_VERSION
  return version.startsWith('v') ? version : `v${version}`
}

Page({
  data: {
    versionLabel: '',
  },

  onLoad() {
    this.setData({ versionLabel: displayVersion() })
  },

  back() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/family/index' }),
    })
  },

  openRecipeOptions() {
    wx.navigateTo({ url: '/pages/recipe-options/index' })
  },
})
