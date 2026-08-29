/**
 * 食谱图片导入：选择、排序、临时上传并调用可配置的 AI 识别服务。
 * 识别结果通过 EventChannel 交给编辑页，不在此页面写入食谱。
 */
import type { RecipeImportDraft } from '../../models/recipe-import'
import {
  cleanupRecipeImportImages,
  chooseRecipeImportImages,
  MAX_IMPORT_IMAGES,
  recognizeRecipeImport,
  setPendingRecipeImportDraft,
  uploadRecipeImportImages,
} from '../../services/recipe-import'
import { RecipeMediaError, type LocalRecipeImage } from '../../services/recipe-media'
import { getState } from '../../services/recipe-store'

Page({
  data: {
    images: [] as LocalRecipeImage[],
    maxImages: MAX_IMPORT_IMAGES,
    working: false,
    statusText: '',
  },

  back() {
    if (this.data.working) {
      wx.showToast({ title: '正在识别食谱，请稍候', icon: 'none' })
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

  status(phase: 'processing' | 'uploading' | 'recognizing', current: number, total: number) {
    if (phase === 'processing') this.setData({ statusText: `正在处理图片 ${current}/${total}` })
    if (phase === 'uploading') this.setData({ statusText: `正在上传图片 ${current}/${total}` })
    if (phase === 'recognizing') this.setData({ statusText: '正在识别食谱内容' })
  },

  /** 完成识别后立即打开原编辑页，由用户逐字段修改并最终保存。 */
  async recognize() {
    if (this.data.working || this.data.images.length === 0) return
    let fileIds: string[] = []
    this.setData({ working: true, statusText: '正在准备图片' })
    try {
      const state = await getState()
      fileIds = await uploadRecipeImportImages(state.family.id, this.data.images, (status) => {
        this.status(status.phase, status.current, status.total)
      })
      const draft = await recognizeRecipeImport(fileIds, (status) => {
        this.status(status.phase, status.current, status.total)
      })
      this.openEditor(draft)
    } catch (error) {
      this.setData({ working: false, statusText: '' })
      wx.showModal({
        title: '导入没有完成',
        content: error instanceof Error ? error.message : '食谱识别失败，请重试',
        showCancel: false,
        confirmText: '知道了',
      })
    } finally {
      await cleanupRecipeImportImages(fileIds)
    }
  },

  openEditor(draft: RecipeImportDraft) {
    setPendingRecipeImportDraft(draft)
    wx.redirectTo({
      url: '/pages/recipe-edit/index?mode=import',
      fail: () => this.setData({ working: false, statusText: '' }),
    })
  },
})
