/** 一份食谱的独立评论页：正文稳定，家庭交流单独增长。 */
import type { Member, RecipeComment } from '../../models/recipe'
import {
  createRecipeComment,
  deleteRecipeComment,
  listRecipeComments,
  type CommentSort,
  updateRecipeComment,
} from '../../services/recipe-comment-service'
import { getCurrentUser, getState } from '../../services/recipe-store'
import { relativeTime } from '../../utils/recipe-utils'

interface CommentView extends RecipeComment {
  authorName: string
  avatarColor: string
  timeLabel: string
  edited: boolean
  canEdit: boolean
  canDelete: boolean
}

function toCommentView(
  comment: RecipeComment,
  members: Member[],
  currentMemberId: string,
  currentIsAdmin: boolean,
): CommentView {
  const author = members.find((member) => member.id === comment.authorMemberId)
  const isOwn = comment.authorMemberId === currentMemberId
  return {
    ...comment,
    authorName: author ? author.name : '家人',
    avatarColor: (author && author.color) || '#8A7E74',
    timeLabel: relativeTime(comment.createdAt),
    edited: comment.updatedAt !== comment.createdAt,
    canEdit: isOwn,
    canDelete: isOwn || currentIsAdmin,
  }
}

Page({
  data: {
    id: '',
    recipeName: '',
    found: true,
    loading: true,
    sort: 'newest' as CommentSort,
    comments: [] as CommentView[],
    members: [] as Member[],
    currentMemberId: '',
    currentIsAdmin: false,
    draft: '',
    editingId: '',
    focusInput: false,
    submitting: false,
    menuId: '',
    deleteId: '',
    deletingId: '',
    scrollAnchor: '',
    toastVisible: false,
    toastMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id || '' })
  },

  onShow() { void this.refresh() },

  async refresh() {
    this.setData({ loading: true })
    try {
      const [state, result] = await Promise.all([
        getState(),
        listRecipeComments(this.data.id, this.data.sort),
      ])
      const recipe = state.recipes.find((item) => item.id === this.data.id)
      if (!recipe) {
        this.setData({ found: false, loading: false, comments: [] })
        return
      }
      const current = getCurrentUser(state)
      this.setData({
        found: true,
        loading: false,
        recipeName: recipe.name,
        members: state.members,
        currentMemberId: current.id,
        currentIsAdmin: current.role === 'admin',
        comments: result.comments.map((comment) => toCommentView(
          comment,
          state.members,
          current.id,
          current.role === 'admin',
        )),
      })
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '评论加载失败')
    }
  },

  back() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }),
    })
  },

  async changeSort(event: WechatMiniprogram.BaseEvent) {
    const sort = String(event.currentTarget.dataset.sort) as CommentSort
    if (sort === this.data.sort || this.data.loading) return
    const previousSort = this.data.sort
    this.setData({ sort, loading: true, menuId: '', deleteId: '' })
    try {
      const result = await listRecipeComments(this.data.id, sort)
      this.setData({
        loading: false,
        comments: result.comments.map((comment) => toCommentView(
          comment,
          this.data.members,
          this.data.currentMemberId,
          this.data.currentIsAdmin,
        )),
      })
    } catch (error) {
      this.setData({ loading: false, sort: previousSort })
      this.showToast(error instanceof Error ? error.message : '排序加载失败')
    }
  },

  onDraftInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ draft: event.detail.value })
  },

  toggleMenu(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    this.setData({ menuId: this.data.menuId === id ? '' : id, deleteId: '' })
  },

  startEdit(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    const comment = this.data.comments.find((item) => item.id === id)
    if (!comment || !comment.canEdit) return
    this.setData({ editingId: id, draft: comment.content, menuId: '', deleteId: '', focusInput: true })
  },

  cancelEdit() {
    if (this.data.submitting) return
    this.setData({ editingId: '', draft: '', focusInput: false })
  },

  askDelete(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    this.setData({ deleteId: id, menuId: '' })
  },

  cancelDelete() {
    if (this.data.deletingId) return
    this.setData({ deleteId: '' })
  },

  async confirmDelete(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id)
    if (!id || this.data.deletingId) return
    this.setData({ deletingId: id })
    try {
      await deleteRecipeComment(id)
      const wasEditing = this.data.editingId === id
      this.setData({
        comments: this.data.comments.filter((item) => item.id !== id),
        deleteId: '',
        deletingId: '',
        editingId: wasEditing ? '' : this.data.editingId,
        draft: wasEditing ? '' : this.data.draft,
        focusInput: wasEditing ? false : this.data.focusInput,
      })
      this.showToast('评论已删除')
    } catch (error) {
      this.setData({ deletingId: '' })
      this.showToast(error instanceof Error ? error.message : '删除失败，请重试')
    }
  },

  async submitComment() {
    if (this.data.submitting) return
    const content = this.data.draft.trim()
    if (!content) {
      this.showToast('先写点内容再发送')
      return
    }
    this.setData({ submitting: true })
    try {
      if (this.data.editingId) {
        const current = this.data.comments.find((item) => item.id === this.data.editingId)
        if (!current) throw new Error('这条评论已不存在')
        const updated = await updateRecipeComment(current.id, content, current.version)
        const view = toCommentView(
          updated,
          this.data.members,
          this.data.currentMemberId,
          this.data.currentIsAdmin,
        )
        this.setData({
          comments: this.data.comments.map((item) => item.id === view.id ? view : item),
          editingId: '',
          draft: '',
          focusInput: false,
          submitting: false,
        })
        this.showToast('评论已更新')
        return
      }

      const result = await createRecipeComment(this.data.id, content)
      const view = toCommentView(
        result.comment,
        this.data.members,
        this.data.currentMemberId,
        this.data.currentIsAdmin,
      )
      this.setData({
        comments: this.data.sort === 'newest'
          ? [view, ...this.data.comments]
          : [...this.data.comments, view],
        draft: '',
        focusInput: false,
        submitting: false,
      }, () => {
        // 输入框在页面底部，最新排序时新评论在列表顶部，发送后滚过去让发送者看到结果。
        this.setData({ scrollAnchor: `comment-${view.id}` })
      })
    } catch (error) {
      // 请求失败时保留输入和编辑状态，用户可直接重试。
      this.setData({ submitting: false })
      this.showToast(error instanceof Error ? error.message : '评论保存失败，请重试')
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
