/** 记录单次制作反馈：只收集能帮助完善食谱的最小信息。 */
import type { Recipe, RecipeAcceptance, RecipeAttempt } from '../../models/recipe'
import {
  createRecipeAttempt, deleteRecipeAttempt, listRecipeAttempts, updateRecipeAttempt,
} from '../../services/recipe-attempt-service'
import { getState } from '../../services/recipe-store'
import { shortDate } from '../../utils/recipe-utils'

const ACCEPTANCE_OPTIONS: Array<{ value: RecipeAcceptance; label: string; help: string }> = [
  { value: 'loved', label: '很喜欢', help: '主动吃或还想要' },
  { value: 'accepted', label: '能接受', help: '愿意吃，反应一般' },
  { value: 'rejected', label: '不太接受', help: '明显抗拒或剩下较多' },
]

function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    id: '',
    routeRecipeId: '',
    loading: true,
    saving: false,
    deleting: false,
    recipes: [] as Recipe[],
    recipeIndex: -1,
    recipeId: '',
    recipeName: '',
    occurredOn: today(),
    occurredLabel: shortDate(today()),
    recipeSheetVisible: false,
    dateSheetVisible: false,
    wheelYears: [] as number[],
    wheelMonths: [] as number[],
    wheelDays: [] as number[],
    wheelValue: [0, 0, 0] as number[],
    acceptance: 'accepted' as RecipeAcceptance,
    acceptanceHelp: ACCEPTANCE_OPTIONS[1].help,
    acceptanceOptions: ACCEPTANCE_OPTIONS,
    followedOriginal: true,
    adjustmentNote: '',
    version: 0,
    authorName: '',
    canEdit: true,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id || '', routeRecipeId: options.recipeId || '' })
    void this.load()
  },

  async load() {
    try {
      const state = await getState()
      const recipes = state.recipes
      if (this.data.id) {
        const attempts = await listRecipeAttempts()
        const attempt = attempts.find((item) => item.id === this.data.id)
        if (!attempt) throw new Error('没有找到这条记录')
        const author = state.members.find((member) => member.id === attempt.authorMemberId)
        this.applyAttempt(attempt, recipes, author ? author.name : '家人', attempt.authorMemberId === state.currentMemberId)
        return
      }
      const initialId = this.data.routeRecipeId || (recipes[0] && recipes[0].id) || ''
      const recipeIndex = recipes.findIndex((recipe) => recipe.id === initialId)
      this.setData({
        recipes,
        recipeIndex,
        recipeId: recipeIndex >= 0 ? recipes[recipeIndex].id : '',
        recipeName: recipeIndex >= 0 ? recipes[recipeIndex].name : '',
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '记录加载失败')
    }
  },

  /** 编辑旧记录时食谱归属不可改变，避免历史被悄悄挪到另一份食谱。 */
  applyAttempt(attempt: RecipeAttempt, recipes: Recipe[], authorName: string, canEdit: boolean) {
    this.setData({
      recipes,
      recipeId: attempt.recipeId,
      recipeName: attempt.recipeName,
      occurredOn: attempt.occurredOn,
      occurredLabel: shortDate(attempt.occurredOn),
      acceptance: attempt.acceptance,
      acceptanceHelp: ACCEPTANCE_OPTIONS.find((option) => option.value === attempt.acceptance)?.help ?? '',
      followedOriginal: attempt.followedOriginal,
      adjustmentNote: attempt.adjustmentNote,
      version: attempt.version,
      authorName,
      canEdit,
      loading: false,
    })
  },

  back() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/recipe-journal/index' }) })
  },
  openRecipeSheet() {
    if (this.data.id || !this.data.canEdit) return
    this.setData({ recipeSheetVisible: true })
  },
  closeRecipeSheet() {
    this.setData({ recipeSheetVisible: false })
  },
  chooseRecipe(event: WechatMiniprogram.BaseEvent) {
    if (this.data.id || !this.data.canEdit) return
    const recipeId = String(event.currentTarget.dataset.id)
    const recipe = this.data.recipes.find((item) => item.id === recipeId)
    if (!recipe) return
    this.setData({ recipeId: recipe.id, recipeName: recipe.name, recipeSheetVisible: false })
  },
  /** 日期滚轮：年份允许补记一年内，不允许未来日期。先填列数据再定位选中值，避免渲染竞态。 */
  openDateSheet() {
    if (!this.data.canEdit) return
    const currentYear = new Date().getFullYear()
    const [year, month, day] = this.data.occurredOn.split('-').map(Number)
    const wheelYears = [currentYear - 1, currentYear]
    const yearIndex = Math.max(0, wheelYears.indexOf(year))
    const wheelMonths = Array.from({ length: 12 }, (_, i) => i + 1)
    this.setData({
      recipeSheetVisible: false,
      dateSheetVisible: true,
      wheelYears,
      wheelMonths,
    }, () => {
      const daysInMonth = new Date(year, month, 0).getDate()
      this.setData({ wheelDays: Array.from({ length: daysInMonth }, (_, i) => i + 1) }, () => {
        this.setData({ wheelValue: [yearIndex, month - 1, Math.min(day - 1, daysInMonth - 1)] })
      })
    })
  },
  onWheelChange(event: WechatMiniprogram.CustomEvent<{ value: number[] }>) {
    const [yearIndex, monthIndex, dayIndex] = event.detail.value
    this.setData({ wheelValue: [yearIndex, monthIndex, dayIndex] }, () => this.refreshWheelDays())
  },
  refreshWheelDays() {
    const [yearIndex, monthIndex, dayIndex] = this.data.wheelValue
    const year = this.data.wheelYears[yearIndex] ?? new Date().getFullYear()
    const month = this.data.wheelMonths[monthIndex] ?? 1
    const daysInMonth = new Date(year, month, 0).getDate()
    if (this.data.wheelDays.length === daysInMonth) return
    this.setData({ wheelDays: Array.from({ length: daysInMonth }, (_, i) => i + 1) }, () => {
      this.setData({ wheelValue: [yearIndex, monthIndex, Math.min(dayIndex, daysInMonth - 1)] })
    })
  },
  confirmDate() {
    const [yearIndex, monthIndex, dayIndex] = this.data.wheelValue
    const year = this.data.wheelYears[yearIndex]
    const month = this.data.wheelMonths[monthIndex]
    const day = this.data.wheelDays[dayIndex]
    if (!year || !month || !day) return
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (iso > today()) {
      this.showToast('不能记录未来的日期')
      return
    }
    this.setData({ occurredOn: iso, occurredLabel: shortDate(iso), dateSheetVisible: false })
  },
  toggleFollowed() {
    if (!this.data.canEdit) return
    this.setData({ followedOriginal: !this.data.followedOriginal })
  },
  chooseAcceptance(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.canEdit) return
    const acceptance = String(event.currentTarget.dataset.value) as RecipeAcceptance
    const help = ACCEPTANCE_OPTIONS.find((option) => option.value === acceptance)?.help ?? ''
    this.setData({ acceptance, acceptanceHelp: help })
  },


  onAdjustmentInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ adjustmentNote: event.detail.value })
  },

  async save() {
    if (!this.data.canEdit || this.data.saving || !this.data.recipeId) return
    if (!this.data.followedOriginal && !this.data.adjustmentNote.trim()) {
      this.showToast('简单写下这次调整了什么')
      return
    }
    this.setData({ saving: true })
    const input = {
      occurredOn: this.data.occurredOn,
      acceptance: this.data.acceptance,
      followedOriginal: this.data.followedOriginal,
      adjustmentNote: this.data.adjustmentNote.trim(),
    }
    try {
      if (this.data.id) await updateRecipeAttempt(this.data.id, this.data.version, input)
      else await createRecipeAttempt(this.data.recipeId, input)
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/recipe-journal/index' }),
        success: () => wx.showToast({ title: this.data.id ? '记录已更新' : '已经记下', icon: 'none' }),
      })
    } catch (error) {
      this.setData({ saving: false })
      this.showToast(error instanceof Error ? error.message : '保存失败，请重试')
    }
  },

  deleteAttempt() {
    if (!this.data.id || this.data.deleting) return
    wx.showModal({
      title: '删除这次记录？',
      content: '只会删除这次反馈，不会影响食谱本身。',
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: (result) => { if (result.confirm) void this.confirmDelete() },
    })
  },
  async confirmDelete() {
    this.setData({ deleting: true })
    try {
      await deleteRecipeAttempt(this.data.id)
      wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/recipe-journal/index' }) })
    } catch (error) {
      this.setData({ deleting: false })
      this.showToast(error instanceof Error ? error.message : '删除失败，请重试')
    }
  },
  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
