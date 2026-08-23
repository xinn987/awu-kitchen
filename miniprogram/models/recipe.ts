/**
 * 家庭食谱领域模型。
 *
 * 归因一律用成员 id（createdById/updatedById/authorId），展示时再解析成
 * 家庭称谓——这样成员改名、重名都不会破坏数据。成员通过微信登录绑定
 * userId，本地演示阶段使用 local- 前缀的伪身份。
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
  authorId: string
  time: string
  summary: string
  snapshot: RecipeContent
}

export interface Recipe extends RecipeContent {
  id: string
  familyId: string
  createdById: string
  createdAt: string
  updatedById: string
  updatedAt: string
  revisions: Revision[]
}

/** 家庭内的成员：微信身份 + 家庭称谓 + 角色。 */
export interface Member {
  id: string
  /** 微信身份标识；本地演示为 local- 前缀，云端为 openid 绑定。 */
  userId: string
  /** 家庭称谓：妈妈/爸爸/奶奶…… */
  name: string
  role: 'admin' | 'member'
  joinedAt: string
  color?: string
}

/** 家庭实体：食谱和成员的归属范围。 */
export interface Family {
  id: string
  name: string
  /** 限时邀请；生成后 24 小时内可凭码加入。 */
  invite?: {
    code: string
    expiresAt: number
    createdById: string
  }
}

export interface RecipeState {
  family: Family
  recipes: Recipe[]
  members: Member[]
}
