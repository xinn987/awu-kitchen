/** 食谱详情：优先呈现成功关键，其次才是食材和步骤。 */
import type { Recipe } from '../../models/recipe'
import { duplicateRecipe, getRecipe, getState } from '../../services/recipe-store'
import { isFormalRecipe, relativeTime, shortDate } from '../../utils/recipe-utils'

interface DetailView extends Recipe {
  isDraft: boolean
  updatedDate: string
  relativeUpdated: string
  avatarColor: string
}

Page({
  data: {
    id: '',
    recipe: null as DetailView | null,
    found: true,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    this.setData({ id })
    if (options.toast) this.showToast(decodeURIComponent(options.toast))
  },

  onShow() { this.refresh() },

  refresh() {
    const recipe = getRecipe(this.data.id)
    if (!recipe) {
      this.setData({ found: false, recipe: null })
      return
    }
    const state = getState()
    const avatarColor = state.members.find((member) => member.name === recipe.updatedBy)?.color ?? '#8A7E74'
    this.setData({
      found: true,
      recipe: {
        ...recipe,
        isDraft: !isFormalRecipe(recipe),
        updatedDate: shortDate(recipe.updatedAt),
        relativeUpdated: relativeTime(recipe.updatedAt),
        avatarColor,
      },
    })
  },

  backToLibrary() { wx.reLaunch({ url: '/pages/library/index' }) },

  editRecipe() {
    wx.navigateTo({ url: `/pages/recipe-edit/index?id=${this.data.id}` })
  },

  openHistory() {
    wx.navigateTo({ url: `/pages/history/index?id=${this.data.id}` })
  },

  duplicate() {
    const copy = duplicateRecipe(this.data.id)
    if (!copy) return
    wx.redirectTo({
      url: `/pages/recipe-detail/index?id=${copy.id}&toast=${encodeURIComponent(`已复制为「${copy.name}」`)}`,
    })
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
