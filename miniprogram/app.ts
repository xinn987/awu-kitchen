/** 小程序入口：只初始化微信云开发；首屏数据接口会同时完成身份校验。 */
import { initCloud } from './config/cloud'

/* 字体统一继承系统无衬线字体，避免 iOS 与不同 Android 厂商匹配到不同宋体。 */
App<IAppOption>({
  globalData: {},
  onLaunch() {
    initCloud()
  },
})
