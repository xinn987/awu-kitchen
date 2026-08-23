/** 食谱编辑：成功关键是唯一必填的复用信息，其余字段允许逐步完善。 */
import { FOOD_TYPES, STAGES, type FoodType, type Ingredient, type Stage } from '../../models/recipe'
import { getRecipe, updateRecipe } from '../../services/recipe-store'
import { isFormalRecipe } from '../../utils/recipe-utils'

const MAX_TAGS = 3

Page({
  data: {
    id: '',
    found: true,
    name: '',
    keys: [''] as string[],
    ingredients: [{ name: '', amount: '' }] as Array<Ingredient & { amount: string }>,
    steps: [''] as string[],
    type: '' as FoodType | '',
    stage: '' as Stage | '',
    tags: [] as string[],
    tagDraft: '',
    typeOptions: [] as Array<{ label: FoodType; active: boolean }>,
    stageOptions: [] as Array<{ label: Stage; active: boolean }>,
    wasDraft: false,
    formalizing: false,
    canSave: false,
    maxTags: MAX_TAGS,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    const recipe = getRecipe(id)
    if (!recipe) {
      this.setData({ id, found: false })
      return
    }
    const wasDraft = !isFormalRecipe(recipe)
    this.setData({
      id,
      found: true,
      name: recipe.name,
      keys: recipe.successKeys.length > 0 ? [...recipe.successKeys] : [''],
      ingredients: recipe.ingredients.length > 0
        ? recipe.ingredients.map((item) => ({ name: item.name, amount: item.amount ?? '' }))
        : [{ name: '', amount: '' }],
      steps: recipe.steps.length > 0 ? [...recipe.steps] : [''],
      type: recipe.type ?? '',
      stage: recipe.stage ?? '',
      tags: [...recipe.tags],
      wasDraft,
    }, () => this.recompute())
  },

  recompute() {
    const formal = this.data.keys.some((key) => key.trim().length > 0)
    this.setData({
      canSave: this.data.name.trim().length > 0 && formal,
      formalizing: this.data.wasDraft && formal,
      typeOptions: FOOD_TYPES.map((label) => ({ label, active: label === this.data.type })),
      stageOptions: STAGES.map((label) => ({ label, active: label === this.data.stage })),
    })
  },

  cancel() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/recipe-detail/index?id=${this.data.id}` }),
    })
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
    const ingredients = this.data.ingredients.length > 1
      ? this.data.ingredients.filter((_, i) => i !== index)
      : [{ name: '', amount: '' }]
    this.setData({ ingredients })
  },

  onStepInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const index = Number(event.currentTarget.dataset.index)
    const steps = [...this.data.steps]
    steps[index] = event.detail.value
    this.setData({ steps })
  },

  addStep() { this.setData({ steps: [...this.data.steps, ''] }) },

  removeStep(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.steps.length > 1 ? this.data.steps.filter((_, i) => i !== index) : ['']
    this.setData({ steps })
  },

  moveStep(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const offset = Number(event.currentTarget.dataset.offset)
    const target = index + offset
    if (target < 0 || target >= this.data.steps.length) return
    const steps = [...this.data.steps]
    const current = steps[index]
    steps[index] = steps[target]
    steps[target] = current
    this.setData({ steps })
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
    this.setData({ tags: [...this.data.tags, tag], tagDraft: '' })
  },

  removeTag(event: WechatMiniprogram.BaseEvent) {
    const tag = String(event.currentTarget.dataset.tag)
    this.setData({ tags: this.data.tags.filter((item) => item !== tag) })
  },

  save() {
    if (!this.data.canSave) return
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
