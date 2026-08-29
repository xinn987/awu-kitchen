/** 食谱详情：优先呈现成功关键，其次才是食材和步骤。 */
import type { Recipe, RecipeImage, RecipeStep } from '../../models/recipe'
import { resolveRecipeImageUrls } from '../../services/recipe-media'
import { archiveRecipe, duplicateRecipe, getMemberById, getState } from '../../services/recipe-store'
import { isFormalRecipe, relativeTime, shortDate } from '../../utils/recipe-utils'

interface DetailImage extends RecipeImage {
  src: string
  loadError: boolean
}

interface DetailStep extends Omit<RecipeStep, 'image'> {
  image?: DetailImage
}

interface DetailView extends Omit<Recipe, 'mainImage' | 'steps'> {
  mainImage?: DetailImage
  steps: DetailStep[]
  /** 主食材置顶，并携带标记供模板区分圆点与四角星。 */
  ingredientRows: Array<{ name: string; amount: string; primary: boolean }>
  isDraft: boolean
  updatedName: string
  createdName: string
  updatedDate: string
  relativeUpdated: string
  avatarColor: string
  commentCountLabel: string
}

Page({
  data: {
    id: '',
    recipe: null as DetailView | null,
    found: true,
    loading: true,
    duplicating: false,
    archiving: false,
    archiveConfirm: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || ''
    this.setData({ id })
    if (options.toast) this.showToast(decodeURIComponent(options.toast))
  },

  onShow() {
    // 厨房场景下手持查看步骤，屏幕常亮避免中途锁屏。
    wx.setKeepScreenOn({ keepScreenOn: true })
    void this.refresh()
  },

  onHide() { wx.setKeepScreenOn({ keepScreenOn: false }) },

  onUnload() { wx.setKeepScreenOn({ keepScreenOn: false }) },

  async refresh() {
    try {
      // 从食谱库进入时直接复用刚加载的数据；写入成功后仓库会更新或清空缓存。
      const state = await getState()
      const recipe = state.recipes.find((item) => item.id === this.data.id)
      if (!recipe) {
        this.setData({ found: false, recipe: null, loading: false })
        return
      }
      const updatedMember = getMemberById(state, recipe.updatedById)
      const createdMember = getMemberById(state, recipe.createdById)
      const viewImage = (image?: RecipeImage): DetailImage | undefined => image
        ? { ...image, src: image.fileId, loadError: false }
        : undefined
      const ingredientRows = [
        ...recipe.ingredients.filter((item) => recipe.tags.includes(item.name.trim())),
        ...recipe.ingredients.filter((item) => !recipe.tags.includes(item.name.trim())),
      ].map((item) => ({ name: item.name, amount: item.amount || '', primary: recipe.tags.includes(item.name.trim()) }))
      this.setData({
        found: true,
        loading: false,
        recipe: {
          ...recipe,
          mainImage: viewImage(recipe.mainImage),
          steps: recipe.steps.map((step) => ({ ...step, image: viewImage(step.image) })),
          ingredientRows,
          isDraft: !isFormalRecipe(recipe),
          updatedName: updatedMember ? updatedMember.name : '家人',
          createdName: createdMember ? createdMember.name : '家人',
          updatedDate: shortDate(recipe.updatedAt),
          relativeUpdated: relativeTime(recipe.updatedAt),
          avatarColor: (updatedMember && updatedMember.color) || '#8A7E74',
          commentCountLabel: recipe.commentCount
            ? (recipe.commentCount > 99 ? '99+' : String(recipe.commentCount))
            : '',
        },
      })
    } catch (error) {
      this.setData({ loading: false })
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

  openComments() {
    wx.navigateTo({ url: `/pages/recipe-comments/index?id=${this.data.id}` })
  },

  /** 点击任一图片时，按“主图 + 步骤顺序”浏览当前食谱的全部图片。 */
  async previewImage(event: WechatMiniprogram.BaseEvent) {
    const recipe = this.data.recipe
    if (!recipe) return
    const currentFileId = String(event.currentTarget.dataset.fileId)
    const fileIds = [
      recipe.mainImage && recipe.mainImage.fileId,
      ...recipe.steps.map((step) => step.image && step.image.fileId),
    ].filter((fileId): fileId is string => Boolean(fileId))
    try {
      const resolved = await resolveRecipeImageUrls(fileIds)
      const urls = resolved.map((item) => item.url)
      const current = resolved.find((item) => item.fileId === currentFileId)
      if (urls.length === 0) throw new Error('图片暂时无法打开')
      wx.previewImage({ current: current ? current.url : urls[0], urls })
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : '图片暂时无法打开')
    }
  },

  onImageError(event: WechatMiniprogram.BaseEvent) {
    const kind = String(event.currentTarget.dataset.kind)
    if (kind === 'main') {
      this.setData({ 'recipe.mainImage.loadError': true } as Record<string, boolean>)
      return
    }
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`recipe.steps[${index}].image.loadError`]: true } as Record<string, boolean>)
  },

  retryImage(event: WechatMiniprogram.BaseEvent) {
    const recipe = this.data.recipe
    if (!recipe) return
    const kind = String(event.currentTarget.dataset.kind)
    const index = Number(event.currentTarget.dataset.index)
    const image = kind === 'main' ? recipe.mainImage : recipe.steps[index] && recipe.steps[index].image
    if (!image) return
    const srcPath = kind === 'main' ? 'recipe.mainImage' : `recipe.steps[${index}].image`
    // 先清空 src 再恢复，让原生 image 节点真正发起一次新的加载。
    this.setData({ [`${srcPath}.loadError`]: false, [`${srcPath}.src`]: '' } as Record<string, string | boolean>, () => {
      this.setData({ [`${srcPath}.src`]: image.fileId } as Record<string, string>)
    })
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

  askArchive() {
    if (this.data.archiving) return
    this.setData({ archiveConfirm: true })
  },

  cancelArchive() {
    if (!this.data.archiving) this.setData({ archiveConfirm: false })
  },

  confirmArchive() {
    if (!this.data.archiveConfirm) return
    this.setData({ archiveConfirm: false })
    void this.archive()
  },

  async archive() {
    const recipe = this.data.recipe
    if (!recipe || this.data.archiving) return
    this.setData({ archiving: true })
    try {
      await archiveRecipe(recipe.id, recipe.version || 1)
      wx.reLaunch({
        url: '/pages/library/index',
        success: () => wx.showToast({ title: '已移入废纸篓', icon: 'none' }),
      })
    } catch (error) {
      this.setData({ archiving: false })
      this.showToast(error instanceof Error ? error.message : '删除失败，请重试')
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
