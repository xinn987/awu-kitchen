/** 小程序入口：只初始化微信云开发；首屏数据接口会同时完成身份校验。 */
import { initCloud } from './config/cloud'

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
    loadSerifFont()
  },
})
