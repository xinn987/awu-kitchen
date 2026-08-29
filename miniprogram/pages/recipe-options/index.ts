/** 家庭共用食谱选项：所有有效成员都可以增删。 */
import { ApiError } from '../../services/cloud-client'
import {
  addRecipeOption,
  listRecipeOptions,
  removeRecipeOption,
  type ManagedRecipeOption,
  type RecipeOptionKind,
  type RecipeOptionsData,
} from '../../services/recipe-option-service'

Page({
  data: {
    familyName: '',
    version: 0,
    foodTypes: [] as ManagedRecipeOption[],
    loading: true,
    saving: false,
    addingKind: '' as RecipeOptionKind | '',
    addingLabel: '',
    draft: '',
    confirmKind: '' as RecipeOptionKind | '',
    confirmName: '',
    confirmUsageCount: 0,
    confirmCopy: '',
    confirmNote: '食谱的其他内容不会改变。',
    toastVisible: false,
    toastMessage: '',
  },

  onShow() { void this.refresh() },

  applyData(data: RecipeOptionsData) {
    this.setData({
      familyName: data.familyName,
      version: data.version,
      foodTypes: data.foodTypes,
      loading: false,
    })
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      this.applyData(await listRecipeOptions())
    } catch (error) {
      this.setData({ loading: false })
      this.showToast(error instanceof Error ? error.message : '食谱选项加载失败')
    }
  },

  back() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/settings/index' }) })
  },

  startAdd(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const kind = String(event.currentTarget.dataset.kind) as RecipeOptionKind
    this.setData({
      addingKind: kind,
      addingLabel: '辅食类型',
      draft: '',
      confirmKind: '',
    })
  },

  onDraftInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ draft: event.detail.value })
  },

  cancelAdd() {
    if (!this.data.saving) this.setData({ addingKind: '', addingLabel: '', draft: '' })
  },

  async confirmAdd() {
    const name = this.data.draft.trim()
    const kind = this.data.addingKind
    if (!kind || !name || this.data.saving) return
    this.setData({ saving: true })
    try {
      const data = await addRecipeOption(kind, name, this.data.version)
      this.setData({ saving: false, addingKind: '', addingLabel: '', draft: '' })
      this.applyData(data)
      this.showToast(`已添加“${name}”`)
    } catch (error) {
      this.setData({ saving: false })
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') void this.refresh()
      this.showToast(error instanceof Error ? error.message : '添加失败，请重试')
    }
  },

  askRemove(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const kind = String(event.currentTarget.dataset.kind) as RecipeOptionKind
    const usageCount = Number(event.currentTarget.dataset.count) || 0
    this.setData({
      confirmKind: kind,
      confirmName: String(event.currentTarget.dataset.name),
      confirmUsageCount: usageCount,
      confirmCopy: usageCount > 0
        ? `有 ${usageCount} 份食谱正在使用。删除后，这些食谱会变为“未选择辅食类型”。`
        : '删除后，新食谱将不能再选择这一项。',
      addingKind: '',
      draft: '',
    })
  },

  cancelRemove() {
    if (!this.data.saving) this.setData({ confirmKind: '', confirmName: '', confirmUsageCount: 0 })
  },

  async confirmRemove() {
    const { confirmKind: kind, confirmName: name } = this.data
    if (!kind || !name || this.data.saving) return
    this.setData({ saving: true })
    try {
      const data = await removeRecipeOption(kind, name, this.data.version)
      this.setData({ saving: false, confirmKind: '', confirmName: '', confirmUsageCount: 0 })
      this.applyData(data)
      this.showToast(data.affectedCount > 0
        ? `已删除，${data.affectedCount} 份食谱变为未选择`
        : `已删除“${name}”`)
    } catch (error) {
      this.setData({ saving: false, confirmKind: '', confirmName: '', confirmUsageCount: 0 })
      // 删除配置可能已经成功、但食谱清理响应中断；重新加载云端状态，不保留错误快照。
      void this.refresh()
      this.showToast(error instanceof Error ? error.message : '删除失败，请重试')
    }
  },

  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2400)
  },
})
