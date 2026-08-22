export const FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼'] as const
export type FoodType = (typeof FOOD_TYPES)[number]

export const STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物'] as const
export type Stage = (typeof STAGES)[number]

export interface Ingredient {
  name: string
  amount?: string
}

/** 一次修订对应的完整内容快照 */
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
}

export type View =
  | { name: 'library' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'history'; id: string }
  | { name: 'family' }
