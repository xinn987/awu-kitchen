import { initCloud } from '../config/cloud'
import type { ApiResponse } from '../models/api'

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 统一封装云函数错误，页面只处理稳定业务错误码与中文消息。 */
export async function callApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  initCloud()
  try {
    const result = await wx.cloud.callFunction({ name: 'api', data: { action, payload } })
    const response = result.result as ApiResponse<T> | undefined
    if (!response) throw new ApiError('SERVICE_UNAVAILABLE', '服务没有返回结果，请稍后重试')
    if (!response.ok) {
      // 成员资格失效后立即离开家庭页面；onboarding 会强制刷新会话，不复用旧缓存。
      if (response.error.code === 'NO_MEMBERSHIP' || response.error.code === 'MEMBERSHIP_REMOVED') {
        wx.reLaunch({ url: '/pages/onboarding/index' })
      }
      throw new ApiError(response.error.code, response.error.message)
    }
    return response.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('SERVICE_UNAVAILABLE', '暂时无法连接家庭数据，请稍后重试')
  }
}
