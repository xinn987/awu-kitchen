/** 小程序入口：首版不主动登录，避免把演示 UI 与账号系统耦合。 */
import { getState } from './services/recipe-store'

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
    // 首次打开时初始化 HTTP demo 的种子数据。
    getState()
    loadSerifFont()
  },
})
