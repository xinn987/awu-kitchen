/** 简单修订时间线：查看成功关键快照并恢复旧版本。 */
import type { Revision } from '../../models/recipe'
import { getMemberById, getRecipe, getState, restoreRevision } from '../../services/recipe-store'
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
    confirmId: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id || '' })
  },

  onShow() { this.refresh() },

  refresh() {
    const recipe = getRecipe(this.data.id)
    if (!recipe) {
      this.setData({ found: false, recipeName: '', revisions: [] })
      return
    }
    const state = getState()
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
    this.setData({ found: true, recipeName: recipe.name, revisions })
  },

  back() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }),
    })
  },

  startRestore(event: WechatMiniprogram.BaseEvent) {
    this.setData({ confirmId: String(event.currentTarget.dataset.id) }, () => this.refresh())
  },

  cancelRestore() {
    this.setData({ confirmId: '' }, () => this.refresh())
  },

  confirmRestore(event: WechatMiniprogram.BaseEvent) {
    const revisionId = String(event.currentTarget.dataset.id)
    const restored = restoreRevision(this.data.id, revisionId)
    if (!restored) return
    wx.redirectTo({
      url: `/pages/recipe-detail/index?id=${this.data.id}&toast=${encodeURIComponent('已恢复旧版本')}`,
    })
  },
})
