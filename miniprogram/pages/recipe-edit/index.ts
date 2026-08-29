/**
 * 食谱编辑：成功关键是唯一必填的复用信息，图片只辅助记录结果与过程。
 * 本地选图不会立即上传；确认保存时才统一处理图片并提交食谱版本。
 */
import {
  type FoodType,
  type RecipeImage,
  type RecipeState,
  type RecipeStep,
  type Stage,
} from '../../models/recipe'
import type { RecipeImportDraft } from '../../models/recipe-import'
import { ApiError } from '../../services/cloud-client'
import { takePendingRecipeImportDraft } from '../../services/recipe-import'
import {
  chooseRecipeImage,
  cleanupUploadedRecipeImages,
  prepareAndUploadRecipeImages,
  RecipeMediaError,
  type LocalRecipeImage,
} from '../../services/recipe-media'
import { createRecipe, getIngredientSuggestions, getState, updateRecipe } from '../../services/recipe-store'
import { isFormalRecipe, uid } from '../../utils/recipe-utils'

/** 点亮为主食材的数量上限；主食材会作为家庭可搜索的原料标签保存。 */
const MAX_PRIMARY = 3

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

interface EditableIngredient {
  name: string
  amount: string
  /** 点亮的主食材；保存时映射为食谱标签。 */
  primary: boolean
}

interface CoreSnapshot {
  keys: string[]
  mainImage: string
  ingredients: Array<{ name: string; amount?: string; primary: boolean }>
  steps: Array<{ id: string; text: string; image: string }>
}

let originalCore: CoreSnapshot | undefined
let editingState: RecipeState | undefined
let editingVersion = 1

/** 全字段的脏检查快照，用于离开保护；只在载入成功后赋值。 */
let originalFull: FullSnapshot | undefined
let dirtyGuardOn = false

interface FullSnapshot {
  name: string
  keys: string[]
  mainImage: string
  ingredients: Array<{ name: string; amount: string; primary: boolean }>
  steps: Array<{ id: string; text: string; image: string }>
  type: string
  stage: string
}

type ConfirmAction = '' | 'save' | 'schema' | 'conflict'

interface ConfirmOptions {
  action: ConfirmAction
  title: string
  copy: string
  note?: string
  confirmText: string
  cancelText?: string
  danger?: boolean
  cancelable?: boolean
}

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
  ingredients: EditableIngredient[],
  steps: EditableStep[],
): CoreSnapshot {
  return {
    keys: keys.map((key) => key.trim()).filter(Boolean),
    mainImage: imageIdentity(mainImage),
    ingredients: ingredients
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() || undefined, primary: item.primary }))
      .filter((item) => item.name.length > 0),
    steps: steps
      .map((step) => ({ id: step.id, text: step.text.trim(), image: imageIdentity(step.image) }))
      .filter((step) => step.text.length > 0),
  }
}

Page({
  data: {
    id: '',
    importMode: false,
    pageTitle: '编辑食谱',
    importWarnings: [] as string[],
    found: true,
    loading: true,
    name: '',
    keys: [''] as string[],
    mainImage: null as EditableImage | null,
    sections: { ingredients: false, steps: false, classify: false } as EditSections,
    ingredients: [] as EditableIngredient[],
    ingredientsCount: 0,
    ingredientSuggestions: [] as string[],
    steps: [] as EditableStep[],
    stepsCount: 0,
    type: '' as FoodType | '',
    stage: '' as Stage | '',
    typeOptions: [] as Array<{ label: FoodType; active: boolean }>,
    stageOptions: [] as Array<{ label: Stage; active: boolean }>,
    classifySummary: '',
    wasDraft: false,
    formalizing: false,
    canSave: false,
    saving: false,
    saveStatus: '',
    showKeysHint: false,
    confirmVisible: false,
    confirmTitle: '',
    confirmCopy: '',
    confirmNote: '',
    confirmText: '确认',
    confirmCancelText: '取消',
    confirmDanger: false,
    confirmCancelable: true,
    confirmAction: '' as ConfirmAction,
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.mode === 'import') {
      const draft = takePendingRecipeImportDraft()
      if (!draft) {
        this.setData({ importMode: true, pageTitle: '导入食谱', found: false, loading: false })
        return
      }
      this.setData({ importMode: true, pageTitle: '核对导入内容' })
      void this.loadImportDraft(draft)
      return
    }
    const id = options.id || ''
    this.setData({ id })
    void this.loadRecipe(id)
  },

  /** 导入草稿只初始化表单；真正的 recipe.create 仍发生在用户点击保存之后。 */
  async loadImportDraft(draft: RecipeImportDraft) {
    try {
      let state = await getState()
      if (state.recipeSchemaVersion !== 2 || state.recipeOptions.version === 0) state = await getState(true)
      editingState = state
      editingVersion = 1
      originalCore = undefined
      let primaryCount = 0
      const ingredients = draft.ingredients.slice(0, 30).map((item) => {
        const primary = item.primary && primaryCount < MAX_PRIMARY
        if (primary) primaryCount += 1
        return { name: item.name, amount: item.amount || '', primary }
      })
      const steps = draft.steps.slice(0, 30).map((step) => ({
        id: uid('step-'),
        text: step.text,
        image: null,
      }))
      // 与空表单比较，让导入预填本身也被视为尚未保存的修改。
      originalFull = {
        name: '', keys: [], mainImage: '', ingredients: [], steps: [], type: '', stage: '',
      }
      this.setData({
        id: '',
        found: true,
        loading: false,
        name: draft.name,
        keys: draft.successKeys.length > 0 ? draft.successKeys.slice(0, 10) : [''],
        mainImage: null,
        sections: {
          ingredients: ingredients.length > 0,
          steps: steps.length > 0,
          classify: Boolean(draft.type || draft.stage),
        },
        ingredients,
        steps,
        type: state.recipeOptions.foodTypes.includes(draft.type) ? draft.type : '',
        stage: state.recipeOptions.stages.includes(draft.stage) ? draft.stage : '',
        wasDraft: false,
        importWarnings: draft.warnings.slice(0, 10),
      }, () => this.recompute())
    } catch (error) {
      this.setData({ found: false, loading: false })
      wx.showToast({ title: error instanceof Error ? error.message : '导入草稿加载失败', icon: 'none' })
    }
  },

  async loadRecipe(id: string) {
    try {
      // 编辑页复用详情/列表快照；保存时仍由 expectedVersion 防止覆盖家人的新版本。
      let state = await getState()
      // 云函数刚升级时，内存里可能还是旧列表响应；只在缺少结构版本时强制校准一次。
      if (state.recipeSchemaVersion !== 2 || state.recipeOptions.version === 0) state = await getState(true)
      const recipe = state.recipes.find((item) => item.id === id)
      if (!recipe) {
        this.setData({ id, found: false, loading: false })
        return
      }
      editingState = state
      editingVersion = recipe.version || 1
      const wasDraft = !isFormalRecipe(recipe)
      // 主食材标记与旧版自由标签兼容：标签里出现过的食材名直接点亮。
      const ingredients = recipe.ingredients.map((item) => ({
        name: item.name,
        amount: item.amount || '',
        primary: recipe.tags.includes(item.name.trim()),
      }))
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
        loading: false,
        name: recipe.name,
        keys: recipe.successKeys.length > 0 ? [...recipe.successKeys] : [''],
        mainImage,
        sections: {
          ingredients: ingredients.length > 0,
          steps: steps.length > 0,
          classify: Boolean(recipe.type || recipe.stage),
        },
        ingredients,
        steps,
        type: recipe.type || '',
        stage: recipe.stage || '',
        wasDraft,
      }, () => {
        originalFull = this.snapshotOf()
        this.recompute()
      })
    } catch (error) {
      this.setData({ found: false, loading: false })
      wx.showToast({ title: error instanceof Error ? error.message : '食谱加载失败', icon: 'none' })
    }
  },

  /** 全字段快照：离开保护以此判断“有没有未保存的修改”。 */
  snapshotOf(): FullSnapshot {
    return {
      name: this.data.name.trim(),
      keys: this.data.keys.map((key) => key.trim()).filter(Boolean),
      mainImage: imageIdentity(this.data.mainImage),
      ingredients: this.data.ingredients
        .map((item) => ({ name: item.name.trim(), amount: item.amount.trim(), primary: item.primary }))
        .filter((item) => item.name.length > 0),
      steps: this.data.steps
        .map((step) => ({ id: step.id, text: step.text.trim(), image: imageIdentity(step.image) }))
        .filter((step) => step.text.length > 0),
      type: this.data.type || '',
      stage: this.data.stage || '',
    }
  },

  /** 有未保存修改时挂上系统级离开确认；干净时摘掉，避免保存跳转被打断。 */
  syncDirtyGuard() {
    if (!originalFull || typeof wx.enableAlertBeforeUnload !== 'function') return
    const dirty = JSON.stringify(this.snapshotOf()) !== JSON.stringify(originalFull)
    if (dirty && !dirtyGuardOn) {
      wx.enableAlertBeforeUnload({ message: '修改还没有保存，确定要离开吗？' })
      dirtyGuardOn = true
    } else if (!dirty && dirtyGuardOn && typeof wx.disableAlertBeforeUnload === 'function') {
      wx.disableAlertBeforeUnload()
      dirtyGuardOn = false
    }
  },

  openConfirm(options: ConfirmOptions) {
    this.setData({
      confirmVisible: true,
      confirmAction: options.action,
      confirmTitle: options.title,
      confirmCopy: options.copy,
      confirmNote: options.note || '',
      confirmText: options.confirmText,
      confirmCancelText: options.cancelText || '取消',
      confirmDanger: Boolean(options.danger),
      confirmCancelable: options.cancelable !== false,
    })
  },

  onConfirm() {
    const action = this.data.confirmAction
    this.setData({ confirmVisible: false, confirmAction: '' })
    if (action === 'save') void this.doSave()
  },

  onCancelConfirm() {
    this.setData({ confirmVisible: false, confirmAction: '' })
  },

  recompute() {
    const state = editingState
    const hasKeys = this.data.keys.some((key) => key.trim().length > 0)
    this.setData({
      canSave: this.data.name.trim().length > 0 && hasKeys,
      formalizing: this.data.wasDraft && hasKeys,
      showKeysHint: this.data.name.trim().length > 0 && !hasKeys,
      typeOptions: (state ? state.recipeOptions.foodTypes : [])
        .map((label) => ({ label, active: label === this.data.type })),
      stageOptions: (state ? state.recipeOptions.stages : [])
        .map((label) => ({ label, active: label === this.data.stage })),
      ingredientsCount: this.data.ingredients.filter((item) => item.name.trim()).length,
      stepsCount: this.data.steps.filter((step) => step.text.trim()).length,
      classifySummary: [this.data.type, this.data.stage].filter(Boolean).join(' · '),
      ingredientSuggestions: state
        ? getIngredientSuggestions(state, this.data.ingredients.map((item) => item.name.trim()).filter(Boolean)) : [],
    }, () => this.syncDirtyGuard())
  },

  cancel() {
    if (this.data.saving) {
      wx.showToast({ title: '图片和食谱正在保存，请稍候', icon: 'none' })
      return
    }
    wx.navigateBack({
      fail: () => wx.redirectTo({
        url: this.data.importMode ? '/pages/library/index' : `/pages/recipe-detail/index?id=${this.data.id}`,
      }),
    })
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
    this.setData(
      { ingredients: [...this.data.ingredients, { name, amount: '', primary: false }] },
      () => this.recompute(),
    )
  },

  onIngredientInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const field = String(event.currentTarget.dataset.field) as 'name' | 'amount'
    const ingredients = this.data.ingredients.map((item, i) =>
      i === index ? { ...item, [field]: event.detail.value } : item)
    this.setData({ ingredients }, () => this.syncDirtyGuard())
  },

  addIngredient() {
    if (!this.data.saving) {
      this.setData({ ingredients: [...this.data.ingredients, { name: '', amount: '', primary: false }] })
    }
  },

  /** 点亮/取消主食材；主食材保存后成为家庭可搜索的原料标签。 */
  togglePrimary(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.ingredients[index]
    if (!target) return
    if (!target.primary && !target.name.trim()) {
      wx.showToast({ title: '先填写食材名', icon: 'none' })
      return
    }
    const primaryCount = this.data.ingredients.filter((item) => item.primary).length
    if (!target.primary && primaryCount >= MAX_PRIMARY) {
      wx.showToast({ title: `主食材最多 ${MAX_PRIMARY} 个`, icon: 'none' })
      return
    }
    const ingredients = this.data.ingredients.map((item, i) =>
      i === index ? { ...item, primary: !item.primary } : item)
    this.setData({ ingredients }, () => this.recompute())
  },

  removeIngredient(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.filter((_, i) => i !== index)
    this.setData({ ingredients }, () => this.recompute())
  },

  /** —— 步骤：每步直接编辑文字，图片与排序归属同一行 —— */
  onStepTextInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.steps.map((step, i) =>
      i === index ? { ...step, text: event.detail.value } : step)
    this.setData({ steps }, () => this.recompute())
  },

  addStep() {
    if (!this.data.saving) {
      this.setData({ steps: [...this.data.steps, { id: uid('step-'), text: '', image: null }] })
    }
  },

  async chooseStepImage(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    if (!this.data.steps[index]) return
    const image = await this.pickImage()
    if (!image) return
    const steps = this.data.steps.map((step, i) => (i === index ? { ...step, image } : step))
    this.setData({ steps }, () => this.syncDirtyGuard())
  },

  removeStepImage(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.steps.map((step, i) => (i === index ? { ...step, image: null } : step))
    this.setData({ steps }, () => this.syncDirtyGuard())
  },

  removeStep(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.steps.filter((_, i) => i !== index)
    this.setData({ steps }, () => this.recompute())
  },

  moveStep(event: WechatMiniprogram.BaseEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const target = index + Number(event.currentTarget.dataset.offset)
    if (target < 0 || target >= this.data.steps.length) return
    const steps = [...this.data.steps]
    const current = steps[index]
    steps[index] = steps[target]
    steps[target] = current
    this.setData({ steps }, () => this.recompute())
  },

  selectType(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value) as FoodType
    this.setData({ type: this.data.type === value ? '' : value }, () => this.recompute())
  },

  selectStage(event: WechatMiniprogram.BaseEvent) {
    const value = String(event.currentTarget.dataset.value) as Stage
    this.setData({ stage: this.data.stage === value ? '' : value }, () => this.recompute())
  },

  /** 点亮的主食材就是原料标签；这里统一 trim 并过滤空行。 */
  primaryTags(): string[] {
    return this.data.ingredients
      .filter((item) => item.primary && item.name.trim())
      .map((item) => item.name.trim())
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
    // 只有成功关键被改动时才打断确认——食材、步骤和标签的修订不值得一次弹窗。
    const keysChanged = originalCore !== undefined
      && JSON.stringify(this.data.keys.map((key) => key.trim()).filter(Boolean)) !== JSON.stringify(originalCore.keys)
    if (!this.data.wasDraft && keysChanged) {
      this.openConfirm({
        action: 'save',
        title: '确认做成功了吗？',
        copy: '这次修改会更新成功关键。建议实际做成功后，再更新这条家庭经验。',
        confirmText: '确认保存',
        cancelText: '再看看',
      })
      return
    }
    void this.doSave()
  },

  async doSave() {
    if (this.data.saving || !editingState) return
    if (editingState.recipeSchemaVersion !== 2) {
      this.openConfirm({
        action: 'schema',
        title: '云端服务尚未更新',
        copy: '当前服务还不能保存图片和新版步骤。请更新云函数后重新进入小程序，再保存一次。',
        confirmText: '知道了',
        cancelable: false,
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
        tags: this.primaryTags(),
      }

      this.setData({ saveStatus: '正在保存…' })
      wx.showLoading({ title: '正在保存', mask: true })
      let savedId = this.data.id
      if (this.data.importMode) {
        const recipe = await createRecipe(content)
        savedId = recipe.id
      } else {
        await updateRecipe(
          this.data.id,
          content,
          this.data.wasDraft ? '补充成功关键，转为正式食谱' : '更新食谱内容',
          editingVersion,
        )
      }
      const message = this.data.importMode
        ? '导入食谱已保存'
        : (this.data.wasDraft ? '已转为正式食谱' : '已保存')
      // 保存即将跳转，先摘掉离开保护，避免被自己的成功路径拦下。
      if (dirtyGuardOn && typeof wx.disableAlertBeforeUnload === 'function') {
        wx.disableAlertBeforeUnload()
        dirtyGuardOn = false
      }
      wx.redirectTo({ url: `/pages/recipe-detail/index?id=${savedId}&toast=${encodeURIComponent(message)}` })
    } catch (error) {
      await cleanupUploadedRecipeImages(uploadedFileIds)
      this.setData({ saving: false, saveStatus: '' })
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        this.openConfirm({
          action: 'conflict',
          title: '食谱已经更新',
          copy: error.message,
          confirmText: '知道了',
          cancelable: false,
        })
        return
      }
      wx.showToast({ title: error instanceof Error ? error.message : '保存失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})
