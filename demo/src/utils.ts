import { notifications } from '@mantine/notifications'

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9)
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** 相对时间显示 */
export function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨天'
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}

export function fullTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()} 年 ${p(d.getMonth() + 1)} 月 ${p(d.getDate())} 日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 深色胶囊 toast（设计稿样式） */
export function notify(message: string) {
  notifications.show({
    message,
    color: 'dark',
    radius: 99,
    autoClose: 2200,
    styles: {
      root: {
        background: '#26211B',
        color: '#F0EBE2',
        border: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        fontSize: 13,
        fontWeight: 500,
      },
      description: { color: '#F0EBE2', fontSize: 13, fontWeight: 500 },
    },
  })
}

/** 成员头像底色（取自设计稿的配色感觉） */
export const MEMBER_COLORS: Record<string, string> = {
  妈妈: '#BF5924',
  爸爸: '#4A7C8A',
  奶奶: '#6B8A4A',
}
