/** 小程序入口：初始化微信云开发，并在后台启动真实身份会话。 */
import { initCloud } from './config/cloud'
import { bootstrapSession } from './services/session-service'

/** 安卓系统没有中文衬线字体，加载内嵌的思源宋体子集保持与设计稿一致的排版。 */
function loadSerifFont() {
  wx.loadFontFace({
    global: true,
    family: 'Noto Serif SC',
    source: 'url("/assets/fonts/noto-serif-sc-500.woff2")',
    desc: { style: 'normal', weight: 'normal' },
    fail: () => {
      // 加载失败时回退系统衬线字体，iOS 仍是宋体，仅安卓退化为黑体。
    },
  })
}

App<IAppOption>({
  globalData: {},
  onLaunch() {
    initCloud()
    // 页面会复用同一个会话 Promise；这里捕获错误，避免启动阶段产生未处理拒绝。
    this.globalData.sessionPromise = bootstrapSession().catch(() => undefined)
    loadSerifFont()
  },
})
