export const DEFAULT_FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼']
export const DEFAULT_STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物']

export type RecipeOptionKind = 'foodType' | 'stage'

export interface RecipeOptions {
  foodTypes: string[]
  stages: string[]
  version: number
}

function names(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const unique = new Set<string>()
  value.forEach((item) => {
    if (typeof item !== 'string') return
    const name = item.trim().slice(0, 20)
    if (name) unique.add(name)
  })
  return [...unique]
}

/** 老家庭没有配置时使用初始选项；空数组则表示家庭主动删除了全部选项。 */
export function normalizeRecipeOptions(value: unknown): RecipeOptions {
  const raw = (value || {}) as Record<string, unknown>
  const version = Number(raw.version)
  return {
    foodTypes: names(raw.foodTypes, DEFAULT_FOOD_TYPES),
    stages: names(raw.stages, DEFAULT_STAGES),
    version: Number.isInteger(version) && version > 0 ? version : 1,
  }
}

export function defaultRecipeOptions(): RecipeOptions {
  return normalizeRecipeOptions(undefined)
}

export function optionsFromFamily(family: Record<string, unknown>): RecipeOptions {
  return normalizeRecipeOptions(family.recipeOptions)
}

export function namesForKind(options: RecipeOptions, kind: RecipeOptionKind): string[] {
  return kind === 'foodType' ? options.foodTypes : options.stages
}

export function optionField(kind: RecipeOptionKind): 'type' | 'stage' {
  return kind === 'foodType' ? 'type' : 'stage'
}
