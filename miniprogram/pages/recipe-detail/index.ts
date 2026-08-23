/** 食谱详情：优先呈现成功关键，其次才是食材和步骤。 */
import type { Recipe } from '../../models/recipe'
import { duplicateRecipe, getMemberById, getState } from '../../services/recipe-store'
import { isFormalRecipe, relativeTime, shortDate } from '../../utils/recipe-utils'

interface DetailView extends Recipe {
  isDraft: boolean
  updatedName: string
  createdName: string
  updatedDate: string
  relativeUpdated: string
  avatarColor: string
}

Page({
  data: {
    id: '',
    recipe: null as DetailView | null,
    found: true,
    duplicating: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || ''
    this.setData({ id })
    if (options.toast) this.showToast(decodeURIComponent(options.toast))
  },

  onShow() { void this.refresh() },

  async refresh() {
    try {
      const state = await getState(true)
      const recipe = state.recipes.find((item) => item.id === this.data.id)
      if (!recipe) {
        this.setData({ found: false, recipe: null })
        return
      }
      const updatedMember = getMemberById(state, recipe.updatedById)
      const createdMember = getMemberById(state, recipe.createdById)
      this.setData({
        found: true,
        recipe: {
          ...recipe,
          isDraft: !isFormalRecipe(recipe),
          updatedName: updatedMember ? updatedMember.name : '家人',
          createdName: createdMember ? createdMember.name : '家人',
          updatedDate: shortDate(recipe.updatedAt),
          relativeUpdated: relativeTime(recipe.updatedAt),
          avatarColor: (updatedMember && updatedMember.color) || '#8A7E74',
        },
      })
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '食谱加载失败')
    }
  },

  backToLibrary() { wx.reLaunch({ url: '/pages/library/index' }) },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const recipe = this.data.recipe
    return {
      title: recipe ? `${recipe.name} · 阿呜厨房` : '阿呜厨房 · 我们的家庭食谱',
      path: `/pages/recipe-detail/index?id=${this.data.id}`,
    }
  },

  editRecipe() {
    wx.navigateTo({ url: `/pages/recipe-edit/index?id=${this.data.id}` })
  },

  openHistory() {
    wx.navigateTo({ url: `/pages/history/index?id=${this.data.id}` })
  },

  async duplicate() {
    if (this.data.duplicating) return
    this.setData({ duplicating: true })
    try {
      const copy = await duplicateRecipe(this.data.id)
      wx.redirectTo({
        url: `/pages/recipe-detail/index?id=${copy.id}&toast=${encodeURIComponent(`已复制为「${copy.name}」`)}`,
      })
    } catch (error) {
      this.setData({ duplicating: false })
      this.showToast(error instanceof Error ? error.message : '复制失败，请重试')
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
