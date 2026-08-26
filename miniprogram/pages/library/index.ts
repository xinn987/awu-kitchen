/** 家庭食谱库：首页、搜索、轻量筛选和待补条目入口。 */
import type { Recipe, RecipeState } from '../../models/recipe'
import {
  getCachedState, getFormalRecipes, getMemberById, getPendingRecipes, getState,
} from '../../services/recipe-store'
import { ApiError } from '../../services/cloud-client'
import { isFormalRecipe, relativeTime } from '../../utils/recipe-utils'

interface RecipeCardView extends Recipe {
  isDraft: boolean
  firstKey: string
  moreCount: number
  visibleTags: string[]
  updatedName: string
  updatedLabel: string
  avatarColor: string
}

interface FilterChip {
  label: string
  count: number
  active: boolean
}

/** 搜索输入防抖，避免每个按键都全量重建列表。 */
let searchTimer: ReturnType<typeof setTimeout> | undefined

Page({
  data: {
    statusBarHeight: 20,
    query: '',
    filter: '全部',
    formalCount: 0,
    pendingCount: 0,
    chips: [] as FilterChip[],
    formal: [] as RecipeCardView[],
    drafts: [] as RecipeCardView[],
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer)
  },

  onShow() { void this.refresh(true) },

  /** 有缓存时先完成首屏渲染，再在后台校准云端权威数据。 */
  async refresh(force = false) {
    try {
      const cached = force ? getCachedState() : undefined
      if (cached) this.renderState(cached)
      const state = await getState(force)
      if (state !== cached) this.renderState(state)
    } catch (error) {
      // 云客户端已经负责跳转首次使用页，这里不再额外显示一次失败提示。
      if (error instanceof ApiError
        && (error.code === 'NO_MEMBERSHIP' || error.code === 'MEMBERSHIP_REMOVED')) return
      this.showToast(error instanceof Error ? error.message : '家庭食谱加载失败')
    }
  },

  renderState(state: RecipeState) {
    const formalRecipes = getFormalRecipes(state)
    const pendingRecipes = getPendingRecipes(state)
    const query = this.data.query.trim().toLowerCase()
    const activeTypeFilters = state.recipeOptions.foodTypes
    const filter = this.data.filter === '全部' || this.data.filter === '待补充'
      || activeTypeFilters.includes(this.data.filter)
      ? this.data.filter
      : '全部'
    const memberOf = (memberId: string) => getMemberById(state, memberId)
    const nameOf = (memberId: string): string => {
      const member = memberOf(memberId)
      return member ? member.name : '家人'
    }
    const colorOf = (memberId: string) => {
      const member = memberOf(memberId)
      return (member && member.color) || '#8A7E74'
    }
    const matchesQuery = (recipe: Recipe) => {
      if (!query) return true
      return [
        recipe.name, ...recipe.successKeys, recipe.type || '', recipe.stage || '',
        ...recipe.tags, ...recipe.ingredients.map((item) => item.name),
      ].join(' ').toLowerCase().includes(query)
    }
    const matchesType = (recipe: Recipe) =>
      filter === '全部' || filter === '待补充' || recipe.type === filter
    const toCard = (recipe: Recipe): RecipeCardView => ({
      ...recipe,
      isDraft: !isFormalRecipe(recipe),
      firstKey: recipe.successKeys[0] || '',
      moreCount: Math.max(0, recipe.successKeys.length - 1),
      visibleTags: recipe.tags.slice(0, 3),
      updatedName: nameOf(recipe.updatedById),
      updatedLabel: relativeTime(recipe.updatedAt),
      avatarColor: colorOf(recipe.updatedById),
    })
    const typeCounts = new Map<string, number>()
    formalRecipes.forEach((recipe) => {
      if (recipe.type) typeCounts.set(recipe.type, (typeCounts.get(recipe.type) || 0) + 1)
    })
    const baseChips = [
      { label: '全部', count: formalRecipes.length },
      ...activeTypeFilters.filter((type) => (typeCounts.get(type) || 0) > 0)
        .map((type) => ({ label: type, count: typeCounts.get(type) || 0 })),
      ...(pendingRecipes.length > 0 ? [{ label: '待补充', count: pendingRecipes.length }] : []),
    ]
    this.setData({
      formalCount: formalRecipes.length,
      pendingCount: pendingRecipes.length,
      filter,
      chips: baseChips.map((chip) => ({ ...chip, active: chip.label === filter })),
      formal: formalRecipes.filter(matchesQuery).filter(matchesType).map(toCard),
      drafts: filter === '全部' || filter === '待补充'
        ? pendingRecipes.filter(matchesQuery).map(toCard)
        : [],
    })
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ query: event.detail.value })
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { void this.refresh() }, 150)
  },

  selectFilter(event: WechatMiniprogram.BaseEvent) {
    const filter = String(event.currentTarget.dataset.label)
    this.setData({ filter }, () => { void this.refresh() })
  },

  openRecipe(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` })
  },

  openCapture() { this.setData({ captureOpen: true }) },
  closeCapture() { this.setData({ captureOpen: false }) },

  onCaptured(event: WechatMiniprogram.CustomEvent<{ id: string; formal: boolean; message: string }>) {
    const { id, formal, message } = event.detail
    this.setData({ captureOpen: false })
    if (formal) {
      wx.navigateTo({
        url: `/pages/recipe-detail/index?id=${id}&toast=${encodeURIComponent(message)}`,
      })
    } else {
      void this.refresh(true)
      this.showToast(message)
    }
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return { title: '阿呜厨房 · 我们的家庭食谱', path: '/pages/library/index' }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
