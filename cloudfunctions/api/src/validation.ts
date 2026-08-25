import crypto from 'crypto'
import { DomainError } from './errors'

const FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼']
const STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物']

export interface RecipeImage {
  fileId: string
  width: number
  height: number
}

export interface RecipeStep {
  id: string
  text: string
  image?: RecipeImage
}

export interface RecipeContent {
  name: string
  successKeys: string[]
  mainImage?: RecipeImage
  ingredients: Array<{ name: string; amount?: string }>
  steps: RecipeStep[]
  type?: string
  stage?: string
  tags: string[]
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function textList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean)
    : []
}

function stepId(): string {
  return `step-${crypto.randomBytes(12).toString('hex')}`
}

/** 图片必须来自当前家庭自己的媒体目录，不能借客户端传入跨家庭文件。 */
function normalizeRecipeImage(value: unknown, familyId: string): RecipeImage | undefined {
  if (value === undefined || value === null) return undefined
  const raw = value as Record<string, unknown>
  const fileId = text(raw.fileId, 500)
  const width = Math.round(Number(raw.width))
  const height = Math.round(Number(raw.height))
  const familyMarker = `/recipe-media/${familyId}/`
  if (!fileId.startsWith('cloud://') || !fileId.includes(familyMarker)) {
    throw new DomainError('VALIDATION_ERROR', '图片不属于当前家庭')
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || width > 10000 || height > 10000) {
    throw new DomainError('VALIDATION_ERROR', '图片尺寸无效')
  }
  return { fileId, width, height }
}

function normalizeSteps(value: unknown, familyId: string): RecipeStep[] {
  if (!Array.isArray(value)) return []
  const usedIds = new Set<string>()
  return value.slice(0, 30).map((item) => {
    if (typeof item === 'string') {
      return { id: stepId(), text: text(item, 1000) }
    }
    const raw = (item || {}) as Record<string, unknown>
    let id = text(raw.id, 80)
    if (!id || usedIds.has(id)) id = stepId()
    usedIds.add(id)
    const image = normalizeRecipeImage(raw.image, familyId)
    return image
      ? { id, text: text(raw.text, 1000), image }
      : { id, text: text(raw.text, 1000) }
  }).filter((step) => step.text.length > 0)
}

export function requiredText(value: unknown, label: string, max = 80): string {
  const result = text(value, max)
  if (!result) throw new DomainError('VALIDATION_ERROR', `请填写${label}`)
  return result
}

export function normalizeDisplayName(value: unknown): string {
  return requiredText(value, '家庭称谓', 20)
}

/** 云端重新清洗食谱内容，不能直接信任客户端已经做过的校验。 */
export function normalizeRecipeContent(value: unknown, familyId: string): RecipeContent {
  const raw = (value || {}) as Record<string, unknown>
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.slice(0, 30).map((item) => {
        const ingredient = (item || {}) as Record<string, unknown>
        const name = text(ingredient.name, 50)
        const amount = text(ingredient.amount, 50)
        return amount ? { name, amount } : { name }
      }).filter((item) => item.name)
    : []
  const type = text(raw.type, 20)
  const stage = text(raw.stage, 20)
  const mainImage = normalizeRecipeImage(raw.mainImage, familyId)
  return {
    name: requiredText(raw.name, '食谱名称'),
    successKeys: textList(raw.successKeys, 10, 500),
    mainImage,
    ingredients,
    steps: normalizeSteps(raw.steps, familyId),
    type: FOOD_TYPES.includes(type) ? type : undefined,
    stage: STAGES.includes(stage) ? stage : undefined,
    tags: textList(raw.tags, 3, 20),
  }
}
