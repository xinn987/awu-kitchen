import cloud from 'wx-server-sdk'

// 必须在任何模块创建数据库实例前完成初始化，避免 CommonJS import 提升造成冷启动失败。
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string })

export const db = cloud.database()

// 身份模块需要区分“文档不存在”和真实服务异常，防止误清空成员关系。
export const nullableDb = cloud.database({ throwOnNotFound: false } as unknown as { env?: string })

export default cloud
