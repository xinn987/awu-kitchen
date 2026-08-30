/** 食记云端服务：页面只处理交互，权限、版本和食谱快照均由云端负责。 */
import type { RecipeAcceptance, RecipeAttempt } from '../models/recipe'
import { callApi } from './cloud-client'

/**
 * 食记缓存按“全家列表 + 单食谱列表”分别保存。
 * 写入成功后立即回填，返回食记页和详情页时无需先等待一次网络请求。
 */
let cachedAllAttempts: RecipeAttempt[] | undefined
const cachedRecipeAttempts = new Map<string, RecipeAttempt[]>()

export interface AttemptInput {
  occurredOn: string
  acceptance: RecipeAcceptance
  followedOriginal: boolean
  adjustmentNote: string
}

export function getCachedRecipeAttempts(recipeId = ''): RecipeAttempt[] | undefined {
  if (!recipeId) return cachedAllAttempts
  if (cachedRecipeAttempts.has(recipeId)) return cachedRecipeAttempts.get(recipeId)
  return cachedAllAttempts && cachedAllAttempts.filter((attempt) => attempt.recipeId === recipeId)
}

function sortAttempts(attempts: RecipeAttempt[]): RecipeAttempt[] {
  return [...attempts].sort((a, b) => (
    b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)
  ))
}

/** 写入后同步所有已存在的缓存视图，避免页面返回时短暂显示旧数据。 */
function upsertCachedAttempt(attempt: RecipeAttempt): void {
  if (cachedAllAttempts) {
    cachedAllAttempts = sortAttempts([
      ...cachedAllAttempts.filter((item) => item.id !== attempt.id),
      attempt,
    ])
  }
  const recipeCache = cachedRecipeAttempts.get(attempt.recipeId)
  if (recipeCache) {
    cachedRecipeAttempts.set(attempt.recipeId, sortAttempts([
      ...recipeCache.filter((item) => item.id !== attempt.id),
      attempt,
    ]))
  }
}

export async function listRecipeAttempts(recipeId = '', force = false): Promise<RecipeAttempt[]> {
  const cached = getCachedRecipeAttempts(recipeId)
  if (!force && cached) return cached
  const result = await callApi<{ attempts: RecipeAttempt[] }>('recipeAttempt.list', recipeId ? { recipeId } : {})
  const attempts = sortAttempts(result.attempts)
  if (recipeId) cachedRecipeAttempts.set(recipeId, attempts)
  else cachedAllAttempts = attempts
  return attempts
}

/** 编辑单条记录使用专用接口，不再为了找一条记录拉取全家列表。 */
export async function getRecipeAttempt(attemptId: string, force = false): Promise<RecipeAttempt> {
  if (!force) {
    const cachedAll = cachedAllAttempts && cachedAllAttempts.find((item) => item.id === attemptId)
    if (cachedAll) return cachedAll
    for (const attempts of cachedRecipeAttempts.values()) {
      const cached = attempts.find((item) => item.id === attemptId)
      if (cached) return cached
    }
  }
  const attempt = await callApi<RecipeAttempt>('recipeAttempt.get', { attemptId })
  upsertCachedAttempt(attempt)
  return attempt
}

export async function createRecipeAttempt(recipeId: string, input: AttemptInput): Promise<RecipeAttempt> {
  const attempt = await callApi<RecipeAttempt>('recipeAttempt.create', { recipeId, ...input })
  upsertCachedAttempt(attempt)
  return attempt
}

export async function updateRecipeAttempt(
  attemptId: string,
  expectedVersion: number,
  input: AttemptInput,
): Promise<RecipeAttempt> {
  const attempt = await callApi<RecipeAttempt>('recipeAttempt.update', { attemptId, expectedVersion, ...input })
  upsertCachedAttempt(attempt)
  return attempt
}

export async function deleteRecipeAttempt(attemptId: string): Promise<void> {
  await callApi<{ deletedAttemptId: string }>('recipeAttempt.delete', { attemptId })
  if (cachedAllAttempts) cachedAllAttempts = cachedAllAttempts.filter((item) => item.id !== attemptId)
  cachedRecipeAttempts.forEach((attempts, recipeId) => {
    cachedRecipeAttempts.set(recipeId, attempts.filter((item) => item.id !== attemptId))
  })
}
