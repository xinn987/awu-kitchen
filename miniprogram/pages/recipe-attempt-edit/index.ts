/**
 * 记录单次制作反馈：只收集能帮助家人理解和改进食谱的最小信息。
 * 页面同时支持新建、本人编辑，以及家人只读查看。
 */
import type { Recipe, RecipeAcceptance, RecipeAttempt } from '../../models/recipe'
import {
  createRecipeAttempt, deleteRecipeAttempt, getRecipeAttempt, updateRecipeAttempt,
} from '../../services/recipe-attempt-service'
import { getCurrentUser, getState } from '../../services/recipe-store'
import { formDateLabel } from '../../utils/recipe-utils'

const ACCEPTANCE_OPTIONS: Array<{
  value: RecipeAcceptance
  label: string
  help: string
  icon: string
}> = [
  { value: 'loved', label: '很喜欢', help: '主动吃，或者吃完还想要', icon: 'heart' },
  { value: 'accepted', label: '能接受', help: '愿意吃，但没有特别明显的喜欢', icon: 'check-circle' },
  { value: 'rejected', label: '不太接受', help: '明显抗拒，或者剩下比较多', icon: 'minus-circle' },
]

/** 使用本地日期，与用户看到的“今天”保持一致。 */
function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function filterRecipes(recipes: Recipe[], query: string): Recipe[] {
  const keyword = query.trim().toLocaleLowerCase()
  if (!keyword) return recipes
  return recipes.filter((recipe) => (
    recipe.name.toLocaleLowerCase().includes(keyword)
    || recipe.ingredients.some((ingredient) => ingredient.name.toLocaleLowerCase().includes(keyword))
  ))
}

Page({
  data: {
    id: '',
    routeRecipeId: '',
    pageTitle: '记下这一次',
    loading: true,
    saving: false,
    deleting: false,
    recipes: [] as Recipe[],
    visibleRecipes: [] as Recipe[],
    recipeQuery: '',
    recipeId: '',
    recipeName: '',
    recipeError: '',
    occurredOn: today(),
    occurredLabel: formDateLabel(today(), today()),
    recipeSheetVisible: false,
    dateSheetVisible: false,
    wheelYears: [] as number[],
    wheelMonths: [] as number[],
    wheelDays: [] as number[],
    wheelValue: [0, 0, 0] as number[],
    acceptance: '' as RecipeAcceptance | '',
    acceptanceHelp: '请选择最接近的一项',
    acceptanceError: '',
    acceptanceOptions: ACCEPTANCE_OPTIONS,
    followedOriginal: true,
    adjustmentNote: '',
    adjustmentError: '',
    saveError: '',
    version: 0,
    authorName: '',
    canEdit: true,
    canDelete: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id || '', routeRecipeId: options.recipeId || '' })
    void this.load()
  },

  /** 编辑时并行读取单条记录和家庭快照，避免先拉全量食记再查找。 */
  async load() {
    try {
      if (this.data.id) {
        const [state, attempt] = await Promise.all([getState(), getRecipeAttempt(this.data.id)])
        const currentMember = getCurrentUser(state)
        const author = state.members.find((member) => member.id === attempt.authorMemberId)
        this.applyAttempt(
          attempt,
          state.recipes,
          author ? author.name : '家人',
          attempt.authorMemberId === currentMember.id,
          attempt.authorMemberId === currentMember.id || currentMember.role === 'admin',
        )
        return
      }
      const state = await getState()
      const recipes = state.recipes
      // 从详情页进入时预选当前食谱；从食记首页进入时保持未选。
      const recipe = this.data.routeRecipeId
        ? recipes.find((item) => item.id === this.data.routeRecipeId)
        : undefined
      this.setData({
        recipes,
        visibleRecipes: recipes,
        recipeId: recipe ? recipe.id : '',
        recipeName: recipe ? recipe.name : '',
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '记录加载失败')
    }
  },

  /** 编辑旧记录时食谱归属不可改变，避免历史被悄悄挪到另一份食谱。 */
  applyAttempt(
    attempt: RecipeAttempt,
    recipes: Recipe[],
    authorName: string,
    canEdit: boolean,
    canDelete: boolean,
  ) {
    this.setData({
      pageTitle: canEdit ? '编辑这次记录' : '这次记录',
      recipes,
      visibleRecipes: recipes,
      recipeId: attempt.recipeId,
      recipeName: attempt.recipeName,
      occurredOn: attempt.occurredOn,
      occurredLabel: formDateLabel(attempt.occurredOn, today()),
      acceptance: attempt.acceptance,
      acceptanceHelp: (ACCEPTANCE_OPTIONS.find((option) => option.value === attempt.acceptance) || { help: '' }).help,
      followedOriginal: attempt.followedOriginal,
      adjustmentNote: attempt.adjustmentNote,
      version: attempt.version,
      authorName,
      canEdit,
      canDelete,
      loading: false,
    })
  },

  back() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/recipe-journal/index' }) })
  },

  openRecipeSheet() {
    if (this.data.id || !this.data.canEdit) return
    this.setData({ recipeSheetVisible: true, dateSheetVisible: false })
  },
  closeRecipeSheet() { this.setData({ recipeSheetVisible: false }) },
  onRecipeSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const recipeQuery = event.detail.value
    this.setData({ recipeQuery, visibleRecipes: filterRecipes(this.data.recipes, recipeQuery) })
  },
  clearRecipeSearch() {
    this.setData({ recipeQuery: '', visibleRecipes: this.data.recipes })
  },
  chooseRecipe(event: WechatMiniprogram.BaseEvent) {
    if (this.data.id || !this.data.canEdit) return
    const recipeId = String(event.currentTarget.dataset.id)
    const recipe = this.data.recipes.find((item) => item.id === recipeId)
    if (!recipe) return
    this.setData({
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipeError: '',
      recipeSheetVisible: false,
      recipeQuery: '',
      visibleRecipes: this.data.recipes,
    })
  },

  /** 日期滚轮默认覆盖近五年；编辑更早记录时会自动扩展到原年份。 */
  openDateSheet() {
    if (!this.data.canEdit) return
    const currentYear = new Date().getFullYear()
    const [year, month, day] = this.data.occurredOn.split('-').map(Number)
    const firstYear = Math.min(currentYear - 4, year)
    const wheelYears = Array.from({ length: currentYear - firstYear + 1 }, (_, index) => firstYear + index)
    const yearIndex = Math.max(0, wheelYears.indexOf(year))
    const wheelMonths = Array.from({ length: 12 }, (_, index) => index + 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    this.setData({
      recipeSheetVisible: false,
      dateSheetVisible: true,
      wheelYears,
      wheelMonths,
      wheelDays: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    }, () => {
      // picker-view 必须先拿到三列数据，再设置索引；同一批更新会在部分基础库中落到首项。
      this.setData({ wheelValue: [yearIndex, month - 1, Math.min(day - 1, daysInMonth - 1)] })
    })
  },
  closeDateSheet() { this.setData({ dateSheetVisible: false }) },
  onWheelChange(event: WechatMiniprogram.CustomEvent<{ value: number[] }>) {
    const [yearIndex, monthIndex, dayIndex] = event.detail.value
    this.setData({ wheelValue: [yearIndex, monthIndex, dayIndex] }, () => this.refreshWheelDays())
  },
  refreshWheelDays() {
    const [yearIndex, monthIndex, dayIndex] = this.data.wheelValue
    const year = this.data.wheelYears[yearIndex] || new Date().getFullYear()
    const month = this.data.wheelMonths[monthIndex] || 1
    const daysInMonth = new Date(year, month, 0).getDate()
    if (this.data.wheelDays.length === daysInMonth) return
    this.setData({
      wheelDays: Array.from({ length: daysInMonth }, (_, index) => index + 1),
      wheelValue: [yearIndex, monthIndex, Math.min(dayIndex, daysInMonth - 1)],
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
    this.setData({ occurredOn: iso, occurredLabel: formDateLabel(iso, today()), dateSheetVisible: false })
  },

  chooseAcceptance(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.canEdit) return
    const acceptance = String(event.currentTarget.dataset.value) as RecipeAcceptance
    const help = (ACCEPTANCE_OPTIONS.find((option) => option.value === acceptance) || { help: '' }).help
    this.setData({ acceptance, acceptanceHelp: help, acceptanceError: '', saveError: '' })
  },
  chooseFollowed(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.canEdit) return
    const followedOriginal = String(event.currentTarget.dataset.value) === 'original'
    this.setData({ followedOriginal, adjustmentError: '', saveError: '' })
  },
  onAdjustmentInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ adjustmentNote: event.detail.value, adjustmentError: '', saveError: '' })
  },

  /** 必填项用行内错误指向具体字段，不让用户在 Toast 消失后猜哪里未填。 */
  validate(): boolean {
    const recipeError = this.data.recipeId ? '' : '请先选择一份食谱'
    const acceptanceError = this.data.acceptance ? '' : '请选择宝宝这次的接受程度'
    const adjustmentError = !this.data.followedOriginal && !this.data.adjustmentNote.trim()
      ? '简单写下这次调整了什么'
      : ''
    this.setData({ recipeError, acceptanceError, adjustmentError, saveError: '' })
    return !recipeError && !acceptanceError && !adjustmentError
  },

  async save() {
    if (!this.data.canEdit || this.data.saving || !this.validate()) return
    this.setData({ saving: true })
    const input = {
      occurredOn: this.data.occurredOn,
      acceptance: this.data.acceptance as RecipeAcceptance,
      followedOriginal: this.data.followedOriginal,
      adjustmentNote: this.data.adjustmentNote.trim(),
    }
    try {
      if (this.data.id) await updateRecipeAttempt(this.data.id, this.data.version, input)
      else await createRecipeAttempt(this.data.recipeId, input)
      const message = this.data.id ? '记录已更新' : '已经记下'
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/recipe-journal/index' }),
        success: () => wx.showToast({ title: message, icon: 'none' }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败，请重试'
      this.setData({ saving: false, saveError: message })
      this.showToast(message)
    }
  },

  deleteAttempt() {
    if (!this.data.id || !this.data.canDelete || this.data.deleting) return
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
