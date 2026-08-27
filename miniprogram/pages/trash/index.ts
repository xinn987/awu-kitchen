/** 废纸篓：列出已归档食谱并支持恢复，闭合“移入废纸篓”的回流。 */
import { listArchivedRecipes, restoreArchivedRecipe, type ArchivedRecipeView } from '../../services/recipe-store'
import { shortDate } from '../../utils/recipe-utils'

interface TrashItemView extends ArchivedRecipeView {
  dateLabel: string
}

Page({
  data: {
    loading: true,
    items: [] as TrashItemView[],
    confirmId: '',
    restoring: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad() { void this.refresh() },

  async refresh() {
    try {
      const recipes = await listArchivedRecipes()
      this.setData({
        loading: false,
        items: recipes.map((item) => ({ ...item, dateLabel: shortDate(item.archivedAt) })),
      })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '废纸篓加载失败')
    }
  },

  askRestore(event: WechatMiniprogram.BaseEvent) {
    this.setData({ confirmId: String(event.currentTarget.dataset.id) })
  },

  cancelRestore() {
    if (this.data.restoring) return
    this.setData({ confirmId: '' })
  },

  async confirmRestore() {
    const id = this.data.confirmId
    if (!id || this.data.restoring) return
    const target = this.data.items.find((item) => item.id === id)
    this.setData({ restoring: true })
    try {
      await restoreArchivedRecipe(id)
      this.setData({
        items: this.data.items.filter((item) => item.id !== id),
        confirmId: '',
        restoring: false,
      })
      this.showToast(target ? `「${target.name}」已恢复` : '已恢复到食谱库')
    } catch (error) {
      this.setData({ restoring: false })
      this.showToast(error instanceof Error ? error.message : '恢复失败，请重试')
    }
  },

  back() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/settings/index' }),
    })
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
