/**
 * 家庭食谱领域模型。
 *
 * 归因一律用成员 id（createdById/updatedById/authorId），展示时再解析成
 * 家庭称谓——这样成员改名、重名都不会破坏数据。成员通过微信登录绑定
 * userId；正式小程序不在客户端保存或伪造微信身份。
 */

/** 辅食类型和适用阶段由家庭共同维护，不再使用客户端固定枚举。 */
export type FoodType = string
export type Stage = string

export interface RecipeOptions {
  foodTypes: FoodType[]
  stages: Stage[]
  version: number
}

export interface Ingredient {
  name: string
  amount?: string
}

/** 云存储中的一张食谱图片；数据库只保存引用和展示尺寸。 */
export interface RecipeImage {
  fileId: string
  width: number
  height: number
}

/** 步骤拥有稳定身份，移动顺序时图片仍跟随这一步。 */
export interface RecipeStep {
  id: string
  text: string
  image?: RecipeImage
}

/** 一次修订保存一份完整快照，恢复时不会破坏旧历史。 */
export interface RecipeContent {
  name: string
  successKeys: string[]
  mainImage?: RecipeImage
  ingredients: Ingredient[]
  steps: RecipeStep[]
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
  /** 云端乐观并发版本；本地旧数据没有时按 1 处理。 */
  version?: number
  state?: 'pending' | 'formal'
  revisions: Revision[]
  /** 软删除标记；存在时不再出现在家庭食谱列表中。 */
  archivedAt?: string
  archivedById?: string
  /** 评论独立存储，这里只保留详情入口所需的轻量计数。 */
  commentCount?: number
}

export interface RecipeComment {
  id: string
  recipeId: string
  authorMemberId: string
  content: string
  createdAt: string
  updatedAt: string
  version: number
}

/** 宝宝对一次实际制作的接受程度；刻意不换算成分数。 */
export type RecipeAcceptance = 'loved' | 'accepted' | 'rejected'

/**
 * 食记中的一次记录。
 * 它保存当时的食谱名称和版本，但不复制食材与步骤，避免形成第二套食谱正文。
 */
export interface RecipeAttempt {
  id: string
  recipeId: string
  recipeName: string
  recipeVersion: number
  occurredOn: string
  acceptance: RecipeAcceptance
  followedOriginal: boolean
  adjustmentNote: string
  authorMemberId: string
  createdAt: string
  updatedAt: string
  version: number
}

/** 家庭内的成员：微信身份 + 家庭称谓 + 角色。 */
export interface Member {
  id: string
  /** 真实微信身份只保留在云端；本地 Demo 兼容字段为可选。 */
  userId?: string
  /** 家庭称谓：妈妈/爸爸/奶奶…… */
  name: string
  role: 'admin' | 'member'
  status?: 'active' | 'removed'
  joinedAt: string
  color?: string
}

/** 家庭实体：食谱和成员的归属范围。 */
export interface Family {
  id: string
  name: string
}

export interface RecipeState {
  family: Family
  recipeOptions: RecipeOptions
  recipes: Recipe[]
  members: Member[]
  currentMemberId?: string
  /** 云端食谱内容结构版本；2 表示支持稳定步骤 ID 和图片引用。 */
  recipeSchemaVersion?: number
}
