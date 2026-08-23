/**
 * 食谱编辑：成功关键是唯一必填的复用信息，其余字段允许逐步完善。
 * 可选分区默认折叠；食材常用点选 + 名称/用量两框；步骤以成稿列表
 * 逐条录入，边加边看到最终阅读形态。
 */
import { FOOD_TYPES, STAGES, type FoodType, type Ingredient, type Stage } from '../../models/recipe'
import { getIngredientSuggestions, getRecipe, getState, getTagSuggestions, updateRecipe } from '../../services/recipe-store'
import { isFormalRecipe } from '../../utils/recipe-utils'

const MAX_TAGS = 3

interface EditSections {
  ingredients: boolean
  steps: boolean
  classify: boolean
}

/** 打开时的实质内容快照，用于判断保存是否需要「做成功再更新」的确认。 */
interface CoreSnapshot {
  keys: string[]
  ingredients: Array<{ name: string; amount?: string }>
  steps: string[]
}

let originalCore: CoreSnapshot | undefined

function coreOf(keys: string[], ingredients: Array<Ingredient & { amount: string }>, steps: string[]): CoreSnapshot {
  return {
    keys: keys.map((key) => key.trim()).filter(Boolean),
    ingredients: ingredients
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() || undefined }))
      .filter((item) => item.name.length > 0),
    steps: steps.map((step) => step.trim()).filter(Boolean),
  }
}

Page({
  data: {
    id: '',
    found: true,
    name: '',
    keys: [''] as string[],
    sections: { ingredients: false, steps: false, classify: false } as EditSections,
    ingredients: [] as Array<Ingredient & { amount: string }>,
    ingredientsCount: 0,
    ingredientSuggestions: [] as string[],
    steps: [] as string[],
    stepsCount: 0,
    stepDraft: '',
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
    showKeysHint: false,
    maxTags: MAX_TAGS,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id || ''
    const recipe = getRecipe(id)
    if (!recipe) {
      this.setData({ id, found: false })
      return
    }
    const wasDraft = !isFormalRecipe(recipe)
    const ingredients = recipe.ingredients.map((item) => ({ name: item.name, amount: item.amount || '' }))
    const steps = [...recipe.steps]
    originalCore = coreOf(recipe.successKeys, ingredients, steps)
    this.setData({
      id,
      found: true,
      name: recipe.name,
      keys: recipe.successKeys.length > 0 ? [...recipe.successKeys] : [''],
      // 有内容的分区默认展开，空的折叠成一行入口，避免空表单的压迫感。
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
  },

  recompute() {
    const state = getState()
    const hasKeys = this.data.keys.some((key) => key.trim().length > 0)
    this.setData({
      canSave: this.data.name.trim().length > 0 && hasKeys,
      formalizing: this.data.wasDraft && hasKeys,
      // 只在名称已填而关键为空时提示，避免常驻文案。
      showKeysHint: this.data.name.trim().length > 0 && !hasKeys,
      typeOptions: FOOD_TYPES.map((label) => ({ label, active: label === this.data.type })),
      stageOptions: STAGES.map((label) => ({ label, active: label === this.data.stage })),
      ingredientsCount: this.data.ingredients.filter((item) => item.name.trim()).length,
      stepsCount: this.data.steps.filter((step) => step.trim()).length,
      classifyCount: this.data.tags.length + (this.data.type ? 1 : 0) + (this.data.stage ? 1 : 0),
      ingredientSuggestions: getIngredientSuggestions(state, this.data.ingredients.map((item) => item.name.trim()).filter(Boolean)),
      tagSuggestions: getTagSuggestions(state, this.data.tags),
    })
  },

  cancel() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }),
    })
  },

  toggleSection(event: WechatMiniprogram.BaseEvent) {
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

  addKey() { this.setData({ keys: [...this.data.keys, ''] }) },

  removeKey(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const keys = this.data.keys.length > 1 ? this.data.keys.filter((_, i) => i !== index) : ['']
    this.setData({ keys }, () => this.recompute())
  },

  /** —— 食材：常用点选 + 两框行 —— */
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
    this.setData({ ingredients: [...this.data.ingredients, { name: '', amount: '' }] })
  },

  removeIngredient(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.filter((_, i) => i !== index)
    this.setData({ ingredients }, () => this.recompute())
  },

  /** —— 步骤：纯阅读列表，点行进入编辑，操作集中在输入框下 —— */
  onStepDraftInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ stepDraft: event.detail.value })
  },

  commitStepDraft() {
    const step = this.data.stepDraft.trim()
    if (!step) return
    const editing = this.data.stepEditingIndex
    const steps = this.data.steps.map((item, i) => (i === editing ? step : item))
    if (editing < 0) steps.push(step)
    this.setData({ steps, stepDraft: '', stepEditingIndex: -1 }, () => this.recompute())
  },

  editStep(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ stepEditingIndex: index, stepDraft: this.data.steps[index] || '' })
  },

  cancelStepEdit() {
    this.setData({ stepEditingIndex: -1, stepDraft: '' })
  },

  deleteEditingStep() {
    const index = this.data.stepEditingIndex
    if (index < 0) return
    const steps = this.data.steps.filter((_, i) => i !== index)
    this.setData({ steps, stepDraft: '', stepEditingIndex: -1 }, () => this.recompute())
  },

  moveEditingStep(event: WechatMiniprogram.BaseEvent) {
    const index = this.data.stepEditingIndex
    const offset = Number(event.currentTarget.dataset.offset)
    const target = index + offset
    if (index < 0 || target < 0 || target >= this.data.steps.length) return
    const steps = [...this.data.steps]
    const current = steps[index]
    steps[index] = steps[target]
    steps[target] = current
    this.setData({ steps, stepEditingIndex: target }, () => this.recompute())
  },

  /** —— 分类与标签 —— */
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
    if (!this.data.canSave) return
    // 正式食谱发生实质修改时，在保存这一刻提醒「做成功再更新」，替代常驻警示框。
    const substantiveChanged = originalCore !== undefined
      && JSON.stringify(coreOf(this.data.keys, this.data.ingredients, this.data.steps)) !== JSON.stringify(originalCore)
    if (!this.data.wasDraft && substantiveChanged) {
      wx.showModal({
        title: '确认做成功了吗？',
        content: '这次修改涉及关键经验、食材或步骤。建议实际做成功后再更新当前食谱。',
        confirmText: '已成功，保存',
        cancelText: '再看看',
        success: (result) => { if (result.confirm) this.doSave() },
      })
      return
    }
    this.doSave()
  },

  doSave() {
    const content = {
      name: this.data.name.trim(),
      successKeys: this.data.keys.map((key) => key.trim()).filter(Boolean),
      ingredients: this.data.ingredients
        .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() || undefined }))
        .filter((item) => item.name.length > 0),
      steps: this.data.steps.map((step) => step.trim()).filter(Boolean),
      type: this.data.type || undefined,
      stage: this.data.stage || undefined,
      tags: [...this.data.tags],
    }
    const saved = updateRecipe(
      this.data.id,
      content,
      this.data.wasDraft ? '补充成功关键，转为正式食谱' : '更新食谱内容',
    )
    if (!saved) return
    const message = this.data.wasDraft ? '已转为正式食谱' : '已保存'
    wx.redirectTo({
      url: `/pages/recipe-detail/index?id=${this.data.id}&toast=${encodeURIComponent(message)}`,
    })
  },
})
