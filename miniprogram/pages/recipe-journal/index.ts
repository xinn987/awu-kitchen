/** 食记首页：按食谱聚合真实制作记录，用轻量竖条展示接受程度的变化。 */
import type { RecipeAcceptance, RecipeAttempt } from '../../models/recipe'
import { listRecipeAttempts } from '../../services/recipe-attempt-service'

const ACCEPTANCE_LABELS: Record<RecipeAcceptance, string> = {
  loved: '很喜欢',
  accepted: '能接受',
  rejected: '不太接受',
}

interface AttemptBar extends RecipeAttempt {
  acceptanceLabel: string
  dateLabel: string
}

interface JournalCard {
  recipeId: string
  recipeName: string
  count: number
  latestDate: string
  latestValue: string
  attempts: AttemptBar[]
}

function dateLabel(value: string): string {
  const parts = value.split('-')
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : value
}

/** 卡片按最近一次排序；竖条本身从旧到新排列，让变化自然向右推进。 */
function groupAttempts(attempts: RecipeAttempt[]): JournalCard[] {
  const groups = new Map<string, RecipeAttempt[]>()
  attempts.forEach((attempt) => {
    const list = groups.get(attempt.recipeId) || []
    list.push(attempt)
    groups.set(attempt.recipeId, list)
  })
  return [...groups.values()].map((items) => {
    const newestFirst = [...items].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    const visible = newestFirst.slice(0, 18).reverse().map((item): AttemptBar => ({
      ...item,
      acceptanceLabel: ACCEPTANCE_LABELS[item.acceptance],
      dateLabel: dateLabel(item.occurredOn),
    }))
    return {
      recipeId: newestFirst[0].recipeId,
      recipeName: newestFirst[0].recipeName,
      count: items.length,
      latestDate: dateLabel(newestFirst[0].occurredOn),
      latestValue: newestFirst[0].occurredOn,
      attempts: visible,
    }
  }).sort((a, b) => b.latestValue.localeCompare(a.latestValue))
}

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    cards: [] as JournalCard[],
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
  },
  onShow() { void this.refresh() },

  async refresh() {
    this.setData({ loading: true })
    try {
      const attempts = await listRecipeAttempts()
      this.setData({ cards: groupAttempts(attempts), loading: false })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '食谱记录加载失败')
    }
  },

  /** 新记录先进入表单选食谱，不把中央“+”改造成混合用途入口。 */
  addAttempt() { wx.navigateTo({ url: '/pages/recipe-attempt-edit/index' }) },
  openAttempt(event: WechatMiniprogram.BaseEvent) {
    wx.navigateTo({ url: `/pages/recipe-attempt-edit/index?id=${String(event.currentTarget.dataset.id)}` })
  },
  openRecipe(event: WechatMiniprogram.BaseEvent) {
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${String(event.currentTarget.dataset.id)}` })
  },
  openCapture() { this.setData({ captureOpen: true }) },
  closeCapture() { this.setData({ captureOpen: false }) },
  openImport() {
    this.setData({ captureOpen: false })
    wx.navigateTo({ url: '/pages/recipe-import/index' })
  },
  onCaptured(event: WechatMiniprogram.CustomEvent<{ id: string; formal: boolean; message: string }>) {
    const { id, formal, message } = event.detail
    this.setData({ captureOpen: false })
    if (formal) wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}&toast=${encodeURIComponent(message)}` })
    else this.showToast(message)
  },
  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
