/** 食记云端服务：页面只处理交互，权限、版本和食谱快照均由云端负责。 */
import type { RecipeAcceptance, RecipeAttempt } from '../models/recipe'
import { callApi } from './cloud-client'

export interface AttemptInput {
  occurredOn: string
  acceptance: RecipeAcceptance
  followedOriginal: boolean
  adjustmentNote: string
}

export async function listRecipeAttempts(recipeId = ''): Promise<RecipeAttempt[]> {
  const result = await callApi<{ attempts: RecipeAttempt[] }>('recipeAttempt.list', recipeId ? { recipeId } : {})
  return result.attempts
}

export function createRecipeAttempt(recipeId: string, input: AttemptInput): Promise<RecipeAttempt> {
  return callApi<RecipeAttempt>('recipeAttempt.create', { recipeId, ...input })
}

export function updateRecipeAttempt(
  attemptId: string,
  expectedVersion: number,
  input: AttemptInput,
): Promise<RecipeAttempt> {
  return callApi<RecipeAttempt>('recipeAttempt.update', { attemptId, expectedVersion, ...input })
}

export async function deleteRecipeAttempt(attemptId: string): Promise<void> {
  await callApi<{ deletedAttemptId: string }>('recipeAttempt.delete', { attemptId })
}
