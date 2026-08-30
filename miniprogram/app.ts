/** 小程序入口：只初始化微信云开发；首屏数据接口会同时完成身份校验。 */
import { initCloud } from './config/cloud'

/*
 * 衬线排版策略：iOS 直接用系统宋体（font-family 栈中的 Songti SC），
 * 安卓无中文衬线、按 sans 展示——产品已接受该降级，不再内嵌字体文件。
 */
App<IAppOption>({
  globalData: {},
  onLaunch() {
    initCloud()
  },
})
