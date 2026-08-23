/** 当前首版使用的微信云开发环境；后续拆分生产环境时再按 envVersion 映射。 */
export const CLOUD_ENV_ID = 'cloud1-d6glyq022609430e7'

let initialized = false

export function initCloud(): void {
  if (initialized) return
  if (!wx.cloud) throw new Error('当前基础库不支持微信云开发')
  const options = CLOUD_ENV_ID ? { env: CLOUD_ENV_ID, traceUser: true } : { traceUser: true }
  wx.cloud.init(options)
  initialized = true
}
