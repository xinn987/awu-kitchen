/**
 * 家庭食谱领域模型。
 *
 * 这里刻意不引入后端字段，首版与 HTTP demo 一样使用本地数据，
 * 后续接入云开发或独立 API 时可在 service 层完成转换。
 */

export const FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼'] as const
export type FoodType = (typeof FOOD_TYPES)[number]

export const STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物'] as const
export type Stage = (typeof STAGES)[number]

export interface Ingredient {
  name: string
  amount?: string
}

/** 一次修订保存一份完整快照，恢复时不会破坏旧历史。 */
export interface RecipeContent {
  name: string
  successKeys: string[]
  ingredients: Ingredient[]
  steps: string[]
  stage?: Stage
  type?: FoodType
  tags: string[]
}

export interface Revision {
  id: string
  author: string
  time: string
  summary: string
  snapshot: RecipeContent
}

export interface Recipe extends RecipeContent {
  id: string
  family: string
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  revisions: Revision[]
}

export interface Member {
  id: string
  name: string
  role: 'admin' | 'member'
  joinedAt: string
  color?: string
}

export interface RecipeState {
  recipes: Recipe[]
  members: Member[]
}

