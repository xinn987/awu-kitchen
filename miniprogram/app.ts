/** 小程序入口：只初始化微信云开发；首屏数据接口会同时完成身份校验。 */
import { initCloud } from './config/cloud'

/**
 * 安卓系统没有中文衬线字体，加载内嵌的思源宋体子集保持与设计稿一致的排版。
 * 当前只内置 500 一个字重文件：把它同时注册到 500 和 600 两档，
 * 避免 600 标题在真机上被合成加粗；真正的多字重子集待体积预算允许后再补。
 */
function loadSerifFont() {
  const source = 'url("/assets/fonts/noto-serif-sc-500.woff2")'
  for (const weight of ['500', '600']) {
    wx.loadFontFace({
      global: true,
      family: 'Noto Serif SC',
      source,
      desc: { style: 'normal', weight },
      fail: () => {
        // 加载失败时回退系统衬线字体，iOS 仍是宋体，仅安卓退化为黑体。
      },
    })
  }
}

App<IAppOption>({
  globalData: {},
  onLaunch() {
    initCloud()
    loadSerifFont()
  },
})
