/** 简单修订时间线：查看成功关键快照并恢复旧版本。 */
import type { Revision } from '../../models/recipe'
import { getMemberById, getState, restoreRevision } from '../../services/recipe-store'
import { relativeTime, shortDate } from '../../utils/recipe-utils'

interface RevisionView extends Revision {
  isCurrent: boolean
  confirming: boolean
  authorName: string
  dateLabel: string
  relativeLabel: string
  avatarColor: string
  visibleKeys: string[]
}

Page({
  data: {
    id: '',
    recipeName: '',
    revisions: [] as RevisionView[],
    found: true,
    loading: true,
    confirmId: '',
    recipeVersion: 1,
    restoring: false,
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id || '' })
  },

  onShow() { void this.refresh() },

  async refresh() {
    try {
      // 历史页通常紧接详情页打开，无需再次拉取整个家庭食谱状态。
      const state = await getState()
      const recipe = state.recipes.find((item) => item.id === this.data.id)
      if (!recipe) {
        this.setData({ found: false, recipeName: '', revisions: [], loading: false })
        return
      }
      const latestRevision = recipe.revisions[recipe.revisions.length - 1]
      const latestId = latestRevision ? latestRevision.id : ''
      const revisions = [...recipe.revisions].reverse().map((revision) => {
        const author = getMemberById(state, revision.authorId)
        return {
          ...revision,
          isCurrent: revision.id === latestId,
          confirming: revision.id === this.data.confirmId,
          authorName: author ? author.name : '家人',
          dateLabel: shortDate(revision.time),
          relativeLabel: relativeTime(revision.time),
          avatarColor: (author && author.color) || '#8A7E74',
          visibleKeys: revision.snapshot.successKeys.filter((key) => key.trim().length > 0),
        }
      })
      this.setData({
        found: true,
        loading: false,
        recipeName: recipe.name,
        recipeVersion: recipe.version || 1,
        revisions,
      })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '历史记录加载失败')
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },

  back() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }),
    })
  },

  startRestore(event: WechatMiniprogram.BaseEvent) {
    this.setData({ confirmId: String(event.currentTarget.dataset.id) }, () => { void this.refresh() })
  },

  cancelRestore() {
    this.setData({ confirmId: '' }, () => { void this.refresh() })
  },

  async confirmRestore(event: WechatMiniprogram.BaseEvent) {
    if (this.data.restoring) return
    const revisionId = String(event.currentTarget.dataset.id)
    this.setData({ restoring: true })
    try {
      await restoreRevision(this.data.id, revisionId, this.data.recipeVersion)
      wx.redirectTo({
        url: `/pages/recipe-detail/index?id=${this.data.id}&toast=${encodeURIComponent('已恢复旧版本')}`,
      })
    } catch (error) {
      this.setData({ restoring: false })
      this.showToast(error instanceof Error ? error.message : '恢复失败，请重试')
    }
  },
})
