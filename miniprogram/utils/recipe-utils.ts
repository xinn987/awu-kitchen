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
  const minutes = Math.floor((Date.now() - time) / 60000)
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

/** 辅食类型到手绘图标的映射：按关键词匹配常见类型，自定义类型回落到餐盘。 */
export function typeIconName(type: string | undefined): string {
  if (!type) return ''
  if (type.includes('汤')) return 'type-soup'
  if (type.includes('粥')) return 'type-congee'
  if (type.includes('面') || type.includes('粉')) return 'type-noodle'
  if (type.includes('蛋') || type.includes('羹')) return 'type-egg'
  if (type.includes('泥') || type.includes('糊') || type.includes('酱')) return 'type-puree'
  if (type.includes('饼') || type.includes('酥') || type.includes('球') || type.includes('块')) return 'type-biscuit'
  return 'type-plate'
}
