import { DomainError } from './errors'

const FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼']
const STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物']

export interface RecipeContent {
  name: string
  successKeys: string[]
  ingredients: Array<{ name: string; amount?: string }>
  steps: string[]
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

export function requiredText(value: unknown, label: string, max = 80): string {
  const result = text(value, max)
  if (!result) throw new DomainError('VALIDATION_ERROR', `请填写${label}`)
  return result
}

export function normalizeDisplayName(value: unknown): string {
  return requiredText(value, '家庭称谓', 20)
}

/** 云端重新清洗食谱内容，不能直接信任客户端已经做过的校验。 */
export function normalizeRecipeContent(value: unknown): RecipeContent {
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
  return {
    name: requiredText(raw.name, '食谱名称'),
    successKeys: textList(raw.successKeys, 10, 500),
    ingredients,
    steps: textList(raw.steps, 30, 1000),
    type: FOOD_TYPES.includes(type) ? type : undefined,
    stage: STAGES.includes(stage) ? stage : undefined,
    tags: textList(raw.tags, 3, 20),
  }
}
