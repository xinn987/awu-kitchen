/** 小程序入口：首版不主动登录，避免把演示 UI 与账号系统耦合。 */
import { getState } from './services/recipe-store'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 首次打开时初始化 HTTP demo 的种子数据。
    getState()
  },
})