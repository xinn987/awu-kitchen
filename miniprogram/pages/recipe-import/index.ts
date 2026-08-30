/**
 * 食谱图片导入：选择、排序、临时上传并提交后台识别任务。
 * 拿到任务 ID 后立即返回清单，不在当前页面等待模型完成。
 */
import {
  cleanupRecipeImportImages,
  chooseRecipeImportImages,
  MAX_IMPORT_IMAGES,
  submitRecipeImport,
  uploadRecipeImportImages,
} from '../../services/recipe-import'
import { RecipeMediaError, type LocalRecipeImage } from '../../services/recipe-media'
import { getState } from '../../services/recipe-store'

Page({
  data: {
    toastVisible: false,
    toastMessage: '',
    images: [] as LocalRecipeImage[],
    maxImages: MAX_IMPORT_IMAGES,
    working: false,
    statusText: '',
  },

  back() {
    if (this.data.working) {
      this.showToast('正在识别食谱，请稍候')
      return
    }
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/library/index' }) })
  },

  async selectImages() {
    if (this.data.working) return
    try {
      const remaining = MAX_IMPORT_IMAGES - this.data.images.length
      const selected = await chooseRecipeImportImages(remaining)
      this.setData({ images: [...this.data.images, ...selected].slice(0, MAX_IMPORT_IMAGES) })
    } catch (error) {
      if (error instanceof RecipeMediaError && error.cancelled) return
      wx.showModal({
        title: '无法选择图片',
        content: '需要相册权限才能导入食谱图片。可以前往微信系统设置检查权限。',
        confirmText: '去设置',
        cancelText: '取消',
        success: (result) => { if (result.confirm) void wx.openSetting({}) },
      })
    }
  },

  previewImage(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const urls = this.data.images.map((image) => image.localPath)
    if (urls[index]) wx.previewImage({ current: urls[index], urls })
  },

  moveImage(event: WechatMiniprogram.BaseEvent) {
    if (this.data.working) return
    const index = Number(event.currentTarget.dataset.index)
    const target = index + Number(event.currentTarget.dataset.offset)
    if (target < 0 || target >= this.data.images.length) return
    const images = [...this.data.images]
    const current = images[index]
    images[index] = images[target]
    images[target] = current
    this.setData({ images })
  },

  removeImage(event: WechatMiniprogram.BaseEvent) {
    if (this.data.working) return
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ images: this.data.images.filter((_image, itemIndex) => itemIndex !== index) })
  },

  clearImages() {
    if (!this.data.working) this.setData({ images: [] })
  },

  status(phase: 'processing' | 'uploading' | 'submitting', current: number, total: number) {
    if (phase === 'processing') this.setData({ statusText: `正在处理图片 ${current}/${total}` })
    if (phase === 'uploading') this.setData({ statusText: `正在上传图片 ${current}/${total}` })
    if (phase === 'submitting') this.setData({ statusText: '正在提交识别任务' })
  },

  /** 提交成功后返回清单；模型任务继续执行，用户无需停留等待。 */
  async recognize() {
    if (this.data.working || this.data.images.length === 0) return
    let fileIds: string[] = []
    this.setData({ working: true, statusText: '正在准备图片' })
    try {
      const state = await getState()
      fileIds = await uploadRecipeImportImages(state.family.id, this.data.images, (status) => {
        this.status(status.phase, status.current, status.total)
      })
      await submitRecipeImport(fileIds, state.family.id, state.currentMemberId || '', (status) => {
        this.status(status.phase, status.current, status.total)
      })
      this.showToast('已提交识别')
      wx.navigateBack({
        fail: () => wx.redirectTo({
          url: '/pages/library/index?importSubmitted=1',
          fail: () => {
            this.setData({ working: false, statusText: '' })
            this.showToast('任务已提交，可返回清单查看')
          },
        }),
      })
    } catch (error) {
      // 只有未取得任务 ID 时才清理；提交成功后的图片由任务终态统一回收。
      await cleanupRecipeImportImages(fileIds)
      this.setData({ working: false, statusText: '' })
      wx.showModal({
        title: '提交没有完成',
        content: error instanceof Error ? error.message : '识别任务提交失败，请重试',
        showCancel: false,
        confirmText: '知道了',
      })
    }
  },
  showToast(message: string) {
    this.setData({ toastVisible: true, toastMessage: message })
    setTimeout(() => this.setData({ toastVisible: false }), 2200)
  },
})
