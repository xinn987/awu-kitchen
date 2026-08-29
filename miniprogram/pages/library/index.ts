/** 家庭食谱库：首页、搜索、轻量筛选和待补条目入口。 */
import type { Recipe, RecipeState } from '../../models/recipe'
import type { RecipeImportTask, RecipeImportTaskResult } from '../../models/recipe-import'
import {
  getCachedState, getFormalRecipes, getMemberById, getPendingRecipes, getState,
} from '../../services/recipe-store'
import { ApiError } from '../../services/cloud-client'
import {
  discardRecipeImportTask,
  getRecipeImportTask,
  listRecipeImportTasks,
  setPendingRecipeImportDraft,
} from '../../services/recipe-import'
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

interface RecipeImportTaskView extends RecipeImportTask {
  title: string
  statusLabel: string
  help: string
  ready: boolean
  problem: boolean
}

/** 搜索输入防抖，避免每个按键都全量重建列表。 */
let searchTimer: ReturnType<typeof setTimeout> | undefined
let importPollTimer: ReturnType<typeof setTimeout> | undefined
let importPollBusy = false
let libraryVisible = false

/** 模型没有可信百分比，只把真实离散状态翻译为用户可理解的任务卡。 */
function importTaskView(task: RecipeImportTask): RecipeImportTaskView {
  if (task.status === 'ready') {
    return {
      ...task,
      title: task.name || '未命名食谱',
      statusLabel: '待核对',
      help: task.warningsCount > 0
        ? `识别完成，有 ${task.warningsCount} 项内容需要留意`
        : '识别完成，核对后才会保存到家庭食谱',
      ready: true,
      problem: false,
    }
  }
  if (task.status === 'processing') {
    return {
      ...task,
      title: '正在识别食谱',
      statusLabel: '识别中',
      help: '可以退出小程序，稍后回来查看',
      ready: false,
      problem: false,
    }
  }
  return {
    ...task,
    title: task.status === 'expired' ? '导入任务已过期' : '导入没有完成',
    statusLabel: task.status === 'expired' ? '已过期' : '识别失败',
    help: task.message || '请重新选择图片后再试',
    ready: false,
    problem: true,
  }
}

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    query: '',
    filter: '全部',
    formalCount: 0,
    pendingCount: 0,
    chips: [] as FilterChip[],
    formal: [] as RecipeCardView[],
    drafts: [] as RecipeCardView[],
    importTasks: [] as RecipeImportTaskView[],
    captureOpen: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 20 })
    if (options.importSubmitted === '1') {
      setTimeout(() => this.showToast('已提交识别，可稍后回来查看'), 100)
    }
  },

  onHide() {
    libraryVisible = false
    this.stopImportPolling()
  },

  onUnload() {
    libraryVisible = false
    if (searchTimer) clearTimeout(searchTimer)
    this.stopImportPolling()
  },

  onShow() {
    libraryVisible = true
    void this.refresh(true)
    void this.refreshImportTasks()
  },

  stopImportPolling() {
    if (importPollTimer) clearTimeout(importPollTimer)
    importPollTimer = undefined
  },

  scheduleImportPolling(delay = 3000) {
    this.stopImportPolling()
    if (!libraryVisible || !this.data.importTasks.some((task) => task.status === 'processing')) return
    importPollTimer = setTimeout(() => { void this.pollImportTasks() }, delay)
  },

  /** 首次进入读取任务列表；同一用户换设备后也能恢复未完成导入。 */
  async refreshImportTasks() {
    try {
      const tasks = await listRecipeImportTasks()
      this.setData({ importTasks: tasks.map(importTaskView) })
      this.scheduleImportPolling(1000)
    } catch (error) {
      // 食谱主列表仍可正常使用，任务区失败不阻断首屏。
      console.warn('加载食谱导入任务失败', error)
    }
  },

  /** 页面可见时低频查询，每个云函数调用只向模型平台查询一次。 */
  async pollImportTasks() {
    if (importPollBusy || !libraryVisible) return
    const processing = this.data.importTasks.filter((task) => task.status === 'processing')
    if (processing.length === 0) return
    importPollBusy = true
    try {
      const results = await Promise.all(processing.map((task) =>
        getRecipeImportTask(task.id).catch(() => undefined)))
      const updates = new Map<string, RecipeImportTask>()
      results.forEach((result) => {
        if (result) updates.set(result.task.id, result.task)
      })
      const tasks = this.data.importTasks.map((task) => importTaskView(updates.get(task.id) || task))
      this.setData({ importTasks: tasks })
    } finally {
      importPollBusy = false
      this.scheduleImportPolling()
    }
  },

  /** 有缓存时先完成首屏渲染，再在后台校准云端权威数据。 */
  async refresh(force = false) {
    try {
      const cached = force ? getCachedState() : undefined
      if (cached) this.renderState(cached)
      const state = await getState(force)
      if (state !== cached) this.renderState(state)
    } catch (error) {
      this.setData({ loading: false })
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
    const matchesType = (recipe: Recipe) => {
      if (filter === '全部') return true
      // “待补充”筛选只看草稿，正式食谱不再混入结果。
      if (filter === '待补充') return false
      return recipe.type === filter
    }
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
      loading: false,
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

  clearSearch() {
    if (searchTimer) clearTimeout(searchTimer)
    this.setData({ query: '' }, () => { void this.refresh() })
  },

  selectFilter(event: WechatMiniprogram.BaseEvent) {
    const filter = String(event.currentTarget.dataset.label)
    this.setData({ filter }, () => { void this.refresh() })
  },

  openRecipe(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` })
  },

  async openImportTask(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    const task = this.data.importTasks.find((item) => item.id === id)
    if (!task) return
    if (task.status === 'processing') {
      this.showToast('仍在识别，可稍后回来查看')
      return
    }
    if (!task.ready) return
    wx.showLoading({ title: '正在打开' })
    try {
      const result: RecipeImportTaskResult = await getRecipeImportTask(id)
      if (!result.draft) throw new Error('识别结果尚未准备好')
      setPendingRecipeImportDraft(result.draft)
      wx.navigateTo({ url: `/pages/recipe-edit/index?mode=import&jobId=${encodeURIComponent(id)}` })
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '无法打开导入结果')
      void this.refreshImportTasks()
    } finally {
      wx.hideLoading()
    }
  },

  /** 失败任务不自动重试；用户明确重新选择图片时才产生新的模型调用。 */
  async restartImport(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    wx.showLoading({ title: '正在准备' })
    try {
      await discardRecipeImportTask(id)
      this.setData({ importTasks: this.data.importTasks.filter((task) => task.id !== id) })
      wx.navigateTo({ url: '/pages/recipe-import/index' })
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '暂时无法重新导入')
    } finally {
      wx.hideLoading()
    }
  },

  discardImport(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    wx.showModal({
      title: '删除导入任务？',
      content: '任务记录和临时图片将被清理，不会影响已经保存的食谱。',
      confirmText: '删除',
      confirmColor: '#B3402A',
      success: (result) => {
        if (!result.confirm) return
        void discardRecipeImportTask(id).then(() => {
          this.setData({ importTasks: this.data.importTasks.filter((task) => task.id !== id) })
        }).catch((error: unknown) => {
          this.showToast(error instanceof Error ? error.message : '删除任务失败')
        })
      },
    })
  },

  openCapture() { this.setData({ captureOpen: true }) },
  closeCapture() { this.setData({ captureOpen: false }) },

  /** 图片导入与快速记录共用“添加食谱”入口，但进入各自独立流程。 */
  openImport() {
    this.setData({ captureOpen: false }, () => {
      wx.navigateTo({ url: '/pages/recipe-import/index' })
    })
  },

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
