/**
 * 食谱编辑：成功关键是唯一必填的复用信息，图片只辅助记录结果与过程。
 * 本地选图不会立即上传；确认保存时才统一处理图片并提交食谱版本。
 */
import {
  FOOD_TYPES,
  STAGES,
  type FoodType,
  type Ingredient,
  type RecipeImage,
  type RecipeState,
  type RecipeStep,
  type Stage,
} from '../../models/recipe'
import { ApiError } from '../../services/cloud-client'
import {
  chooseRecipeImage,
  cleanupUploadedRecipeImages,
  prepareAndUploadRecipeImages,
  RecipeMediaError,
  type LocalRecipeImage,
} from '../../services/recipe-media'
import { getIngredientSuggestions, getState, getTagSuggestions, updateRecipe } from '../../services/recipe-store'
import { isFormalRecipe, uid } from '../../utils/recipe-utils'

const MAX_TAGS = 3

interface EditSections {
  ingredients: boolean
  steps: boolean
  classify: boolean
}

interface EditableImage extends LocalRecipeImage {
  /** 已保存图片带 fileId；新选图片只保留本地临时路径。 */
  fileId?: string
  isNew: boolean
}

interface EditableStep {
  id: string
  text: string
  image: EditableImage | null
}

interface CoreSnapshot {
  keys: string[]
  mainImage: string
  ingredients: Array<{ name: string; amount?: string }>
  steps: Array<{ id: string; text: string; image: string }>
}

let originalCore: CoreSnapshot | undefined
let editingState: RecipeState | undefined
let editingVersion = 1

function editableImage(image?: RecipeImage): EditableImage | null {
  return image ? {
    fileId: image.fileId,
    localPath: image.fileId,
    width: image.width,
    height: image.height,
    size: 0,
    isNew: false,
  } : null
}

function pickedImage(image: LocalRecipeImage): EditableImage {
  return { ...image, isNew: true }
}

function imageIdentity(image: EditableImage | null): string {
  return image ? (image.fileId || image.localPath) : ''
}

function coreOf(
  keys: string[],
  mainImage: EditableImage | null,
  ingredients: Array<Ingredient & { amount: string }>,
  steps: EditableStep[],
): CoreSnapshot {
  return {
    keys: keys.map((key) => key.trim()).filter(Boolean),
    mainImage: imageIdentity(mainImage),
    ingredients: ingredients
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() || undefined }))
      .filter((item) => item.name.length > 0),
    steps: steps
      .map((step) => ({ id: step.id, text: step.text.trim(), image: imageIdentity(step.image) }))
      .filter((step) => step.text.length > 0),
  }
}

Page({
  data: {
    id: '',
    found: true,
    name: '',
    keys: [''] as string[],
    mainImage: null as EditableImage | null,
    sections: { ingredients: false, steps: false, classify: false } as EditSections,
    ingredients: [] as Array<Ingredient & { amount: string }>,
    ingredientsCount: 0,
    ingredientSuggestions: [] as string[],
    steps: [] as EditableStep[],
    stepsCount: 0,
    stepDraft: '',
    stepImageDraft: null as EditableImage | null,
    stepEditingIndex: -1,
    type: '' as FoodType | '',
    stage: '' as Stage | '',
    tags: [] as string[],
    tagDraft: '',
    tagSuggestions: [] as string[],
    typeOptions: [] as Array<{ label: FoodType; active: boolean }>,
    stageOptions: [] as Array<{ label: Stage; active: boolean }>,
    classifyCount: 0,
    wasDraft: false,
    formalizing: false,
    canSave: false,
    saving: false,
    saveStatus: '',
    showKeysHint: false,
    maxTags: MAX_TAGS,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || ''
    this.setData({ id })
    void this.loadRecipe(id)
  },

  async loadRecipe(id: string) {
    try {
      // 编辑页复用详情/列表快照；保存时仍由 expectedVersion 防止覆盖家人的新版本。
      let state = await getState()
      // 云函数刚升级时，内存里可能还是旧列表响应；只在缺少结构版本时强制校准一次。
      if (state.recipeSchemaVersion !== 2) state = await getState(true)
      const recipe = state.recipes.find((item) => item.id === id)
      if (!recipe) {
        this.setData({ id, found: false })
        return
      }
      editingState = state
      editingVersion = recipe.version || 1
      const wasDraft = !isFormalRecipe(recipe)
      const ingredients = recipe.ingredients.map((item) => ({ name: item.name, amount: item.amount || '' }))
      const mainImage = editableImage(recipe.mainImage)
      const steps = recipe.steps.map((step) => ({
        id: step.id,
        text: step.text,
        image: editableImage(step.image),
      }))
      originalCore = coreOf(recipe.successKeys, mainImage, ingredients, steps)
      this.setData({
        id,
        found: true,
        name: recipe.name,
        keys: recipe.successKeys.length > 0 ? [...recipe.successKeys] : [''],
        mainImage,
        sections: {
          ingredients: ingredients.length > 0,
          steps: steps.length > 0,
          classify: Boolean(recipe.type || recipe.stage || recipe.tags.length > 0),
        },
        ingredients,
        steps,
        type: recipe.type || '',
        stage: recipe.stage || '',
        tags: [...recipe.tags],
        wasDraft,
      }, () => this.recompute())
    } catch (error) {
      this.setData({ found: false })
      wx.showToast({ title: error instanceof Error ? error.message : '食谱加载失败', icon: 'none' })
    }
  },

  recompute() {
    const state = editingState
    const hasKeys = this.data.keys.some((key) => key.trim().length > 0)
    this.setData({
      canSave: this.data.name.trim().length > 0 && hasKeys,
      formalizing: this.data.wasDraft && hasKeys,
      showKeysHint: this.data.name.trim().length > 0 && !hasKeys,
      typeOptions: FOOD_TYPES.map((label) => ({ label, active: label === this.data.type })),
      stageOptions: STAGES.map((label) => ({ label, active: label === this.data.stage })),
      ingredientsCount: this.data.ingredients.filter((item) => item.name.trim()).length,
      stepsCount: this.data.steps.filter((step) => step.text.trim()).length,
      classifyCount: this.data.tags.length + (this.data.type ? 1 : 0) + (this.data.stage ? 1 : 0),
      ingredientSuggestions: state
        ? getIngredientSuggestions(state, this.data.ingredients.map((item) => item.name.trim()).filter(Boolean)) : [],
      tagSuggestions: state ? getTagSuggestions(state, this.data.tags) : [],
    })
  },

  cancel() {
    if (this.data.saving) {
      wx.showToast({ title: '图片和食谱正在保存，请稍候', icon: 'none' })
      return
    }
    wx.navigateBack({ fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }) })
  },

  toggleSection(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const section = String(event.currentTarget.dataset.section) as keyof EditSections
    this.setData({ [`sections.${section}`]: !this.data.sections[section] } as Record<string, boolean>)
  },

  onNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ name: event.detail.value }, () => this.recompute())
  },

  onKeyInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const keys = [...this.data.keys]
    keys[index] = event.detail.value
    this.setData({ keys }, () => this.recompute())
  },

  addKey() {
    if (!this.data.saving) this.setData({ keys: [...this.data.keys, ''] })
  },

  removeKey(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const keys = this.data.keys.length > 1 ? this.data.keys.filter((_, i) => i !== index) : ['']
    this.setData({ keys }, () => this.recompute())
  },

  async pickImage(): Promise<EditableImage | undefined> {
    if (this.data.saving) return undefined
    try {
      return pickedImage(await chooseRecipeImage())
    } catch (error) {
      if (error instanceof RecipeMediaError && error.cancelled) return undefined
      wx.showModal({
        title: '无法选择图片',
        content: '需要相册或相机权限才能添加图片。可以前往微信系统设置检查权限。',
        confirmText: '去设置',
        cancelText: '取消',
        success: (result) => { if (result.confirm) void wx.openSetting({}) },
        fail: () => wx.showToast({ title: '图片选择失败，请重试', icon: 'none' }),
      })
      return undefined
    }
  },

  async chooseMainImage() {
    const image = await this.pickImage()
    if (image) this.setData({ mainImage: image })
  },

  removeMainImage() {
    if (!this.data.saving) this.setData({ mainImage: null })
  },

  addSuggestedIngredient(event: WechatMiniprogram.BaseEvent) {
    const name = String(event.currentTarget.dataset.name).trim()
    if (!name || this.data.ingredients.some((item) => item.name === name)) return
    this.setData({ ingredients: [...this.data.ingredients, { name, amount: '' }] }, () => this.recompute())
  },

  onIngredientInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field) as 'name' | 'amount'
    const ingredients = this.data.ingredients.map((item, i) =>
      i === index ? { ...item, [field]: event.detail.value } : item)
    this.setData({ ingredients })
  },

  addIngredient() {
    if (!this.data.saving) this.setData({ ingredients: [...this.data.ingredients, { name: '', amount: '' }] })
  },

  removeIngredient(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.filter((_, i) => i !== index)
    this.setData({ ingredients }, () => this.recompute())
  },

  /** —— 步骤：稳定 ID 让文字、图片和移动操作保持同一归属 —— */
  onStepDraftInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ stepDraft: event.detail.value })
  },

  async chooseStepImage() {
    if (!this.data.stepDraft.trim()) {
      wx.showToast({ title: '请先写下这一步', icon: 'none' })
      return
    }
    const image = await this.pickImage()
    if (image) this.setData({ stepImageDraft: image })
  },

  removeStepImage() {
    if (!this.data.saving) this.setData({ stepImageDraft: null })
  },

  commitStepDraft() {
    if (this.data.saving) return
    const text = this.data.stepDraft.trim()
    if (!text) return
    const editing = this.data.stepEditingIndex
    const steps = this.data.steps.map((item, index) => editing === index
      ? { ...item, text, image: this.data.stepImageDraft }
      : item)
    if (editing < 0) steps.push({ id: uid('step-'), text, image: this.data.stepImageDraft })
    this.setData({ steps, stepDraft: '', stepImageDraft: null, stepEditingIndex: -1 }, () => this.recompute())
  },

  editStep(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const step = this.data.steps[index]
    if (!step) return
    this.setData({ stepEditingIndex: index, stepDraft: step.text, stepImageDraft: step.image })
  },

  cancelStepEdit() {
    if (!this.data.saving) this.setData({ stepEditingIndex: -1, stepDraft: '', stepImageDraft: null })
  },

  deleteEditingStep() {
    if (this.data.saving) return
    const index = this.data.stepEditingIndex
    if (index < 0) return
    const steps = this.data.steps.filter((_, i) => i !== index)
    this.setData({ steps, stepDraft: '', stepImageDraft: null, stepEditingIndex: -1 }, () => this.recompute())
  },

  moveEditingStep(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = this.data.stepEditingIndex
    const target = index + Number(event.currentTarget.dataset.offset)
    if (index < 0 || target < 0 || target >= this.data.steps.length) return
    const steps = [...this.data.steps]
    const current = steps[index]
    steps[index] = steps[target]
    steps[target] = current
    this.setData({ steps, stepEditingIndex: target }, () => this.recompute())
  },

  selectType(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value) as FoodType
    this.setData({ type: this.data.type === value ? '' : value }, () => this.recompute())
  },

  selectStage(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value) as Stage
    this.setData({ stage: this.data.stage === value ? '' : value }, () => this.recompute())
  },

  onTagInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ tagDraft: event.detail.value })
  },

  addTag() {
    const tag = this.data.tagDraft.trim().replace(/^#/, '')
    if (!tag || this.data.tags.includes(tag) || this.data.tags.length >= MAX_TAGS) return
    this.setData({ tags: [...this.data.tags, tag], tagDraft: '' }, () => this.recompute())
  },

  addSuggestedTag(event: WechatMiniprogram.BaseEvent) {
    const tag = String(event.currentTarget.dataset.tag)
    if (!tag || this.data.tags.includes(tag) || this.data.tags.length >= MAX_TAGS) return
    this.setData({ tags: [...this.data.tags, tag] }, () => this.recompute())
  },

  removeTag(event: WechatMiniprogram.BaseEvent) {
    const tag = String(event.currentTarget.dataset.tag)
    this.setData({ tags: this.data.tags.filter((item) => item !== tag) }, () => this.recompute())
  },

  save() {
    if (this.data.saving) return
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请填写食谱名称', icon: 'none' })
      return
    }
    if (!this.data.keys.some((key) => key.trim().length > 0)) {
      this.setData({ showKeysHint: true })
      wx.showToast({ title: '请先写一条成功关键', icon: 'none' })
      return
    }

    wx.hideKeyboard()
    const substantiveChanged = originalCore !== undefined
      && JSON.stringify(coreOf(this.data.keys, this.data.mainImage, this.data.ingredients, this.data.steps))
        !== JSON.stringify(originalCore)
    if (!this.data.wasDraft && substantiveChanged) {
      wx.showModal({
        title: '确认做成功了吗？',
        content: '这次修改涉及关键经验、图片、食材或步骤。建议实际做成功后再更新当前食谱。',
        confirmText: '确认保存',
        cancelText: '再看看',
        success: (result) => { if (result.confirm) void this.doSave() },
        fail: (error) => {
          console.error('打开保存确认框失败', error)
          wx.showToast({ title: '无法打开确认框，请重试', icon: 'none' })
        },
      })
      return
    }
    void this.doSave()
  },

  async doSave() {
    if (this.data.saving || !editingState) return
    if (editingState.recipeSchemaVersion !== 2) {
      wx.showModal({
        title: '云端服务尚未更新',
        content: '当前服务还不能保存图片和新版步骤。请更新云函数后重新进入小程序，再保存一次。',
        showCancel: false,
      })
      return
    }
    const uploadItems = [] as Array<{ key: string; image: LocalRecipeImage }>
    if (this.data.mainImage && this.data.mainImage.isNew) {
      uploadItems.push({ key: 'main', image: this.data.mainImage })
    }
    this.data.steps.forEach((step) => {
      if (step.image && step.image.isNew) uploadItems.push({ key: `step:${step.id}`, image: step.image })
    })

    let uploadedFileIds: string[] = []
    this.setData({ saving: true, saveStatus: uploadItems.length > 0 ? '正在处理图片…' : '正在保存…' })
    wx.showLoading({ title: uploadItems.length > 0 ? '处理图片中' : '正在保存', mask: true })

    try {
      const media = await prepareAndUploadRecipeImages(
        editingState.family.id,
        uploadItems,
        (status) => {
          if (status.phase === 'processing') {
            this.setData({ saveStatus: '正在处理图片…' })
          } else {
            this.setData({ saveStatus: `正在上传 ${status.current}/${status.total}…` })
            wx.showLoading({ title: `上传 ${status.current}/${status.total}`, mask: true })
          }
        },
      )
      uploadedFileIds = media.uploadedFileIds

      const savedImage = (image: EditableImage | null, key: string): RecipeImage | undefined => {
        if (!image) return undefined
        if (image.isNew) return media.images[key]
        return image.fileId ? { fileId: image.fileId, width: image.width, height: image.height } : undefined
      }
      const steps: RecipeStep[] = this.data.steps
        .map((step) => ({ id: step.id, text: step.text.trim(), image: savedImage(step.image, `step:${step.id}`) }))
        .filter((step) => step.text.length > 0)
      const content = {
        name: this.data.name.trim(),
        successKeys: this.data.keys.map((key) => key.trim()).filter(Boolean),
        mainImage: savedImage(this.data.mainImage, 'main'),
        ingredients: this.data.ingredients
          .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() || undefined }))
          .filter((item) => item.name.length > 0),
        steps,
        type: this.data.type || undefined,
        stage: this.data.stage || undefined,
        tags: [...this.data.tags],
      }

      this.setData({ saveStatus: '正在保存…' })
      wx.showLoading({ title: '正在保存', mask: true })
      await updateRecipe(
        this.data.id,
        content,
        this.data.wasDraft ? '补充成功关键，转为正式食谱' : '更新食谱内容',
        editingVersion,
      )
      const message = this.data.wasDraft ? '已转为正式食谱' : '已保存'
      wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}&toast=${encodeURIComponent(message)}` })
    } catch (error) {
      await cleanupUploadedRecipeImages(uploadedFileIds)
      this.setData({ saving: false, saveStatus: '' })
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        wx.showModal({ title: '食谱已经更新', content: error.message, showCancel: false })
        return
      }
      wx.showToast({ title: error instanceof Error ? error.message : '保存失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})
