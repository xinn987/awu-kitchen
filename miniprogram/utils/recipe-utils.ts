/** 食谱模块使用的无副作用工具函数。 */

/** 生成足够用于本地原型的短 ID。 */
export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** 深拷贝本地 JSON 数据，避免种子数据被页面直接修改。 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 相对时间文案，保持与 HTTP demo 一致。 */
export function relativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const minutes = Math.floor((Date.now() - time) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

/** 食谱详情和修订记录使用的短日期。 */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** 是否已经具备至少一条可复用的成功关键。 */
export function isFormalRecipe(recipe: { successKeys: string[] }): boolean {
  return recipe.successKeys.some((key) => key.trim().length > 0)
}

