/**
 * 家庭食谱云端仓库。
 *
 * 保留原有函数名以缩小页面迁移范围，但所有读写均为异步 CloudBase 调用。
 * 内存缓存只用于页面间复用，云端始终是权威数据源。
 */

import type { Member, Recipe, RecipeContent, RecipeState } from '../models/recipe'
import { isFormalRecipe } from '../utils/recipe-utils'
import { callApi } from './cloud-client'

let cachedState: RecipeState | undefined
let pendingState: Promise<RecipeState> | undefined

function normalizeState(state: RecipeState): RecipeState {
  return {
    ...state,
    recipes: state.recipes.map((recipe) => ({
      ...recipe,
      version: recipe.version || 1,
      revisions: Array.isArray(recipe.revisions) ? recipe.revisions : [],
    })),
  }
}

export async function getState(force = false): Promise<RecipeState> {
  if (!force && cachedState) return cachedState
  // 页面生命周期可能在短时间内重复触发，复用正在进行的请求，避免并发拉取同一份家庭数据。
  if (pendingState) return pendingState
  pendingState = callApi<RecipeState>('recipe.list')
    .then((state) => {
      cachedState = normalizeState(state)
      return cachedState
    })
    .finally(() => { pendingState = undefined })
  return pendingState
}

/** 只读取当前内存快照，不触发网络请求；用于页面先显示旧数据再后台校准。 */
export function getCachedState(): RecipeState | undefined {
  return cachedState
}

export function invalidateState(): void {
  cachedState = undefined
}

/** 写入成功后直接接入服务端返回值，避免跳转后的页面再次空等整库刷新。 */
function upsertCachedRecipe(recipe: Recipe): void {
  if (!cachedState) return
  const exists = cachedState.recipes.some((item) => item.id === recipe.id)
  cachedState = {
    ...cachedState,
    recipes: exists
      ? cachedState.recipes.map((item) => item.id === recipe.id ? recipe : item)
      : [...cachedState.recipes, recipe],
  }
}

export function getCurrentUser(state: RecipeState): Member {
  return state.members.find((member) => member.id === state.currentMemberId)
    || state.members[0]
    || { id: '', name: '家人', role: 'member', joinedAt: '' }
}

export function getMemberById(state: RecipeState, id: string): Member | undefined {
  return state.members.find((member) => member.id === id)
}

export async function getRecipe(id: string, force = false): Promise<Recipe | undefined> {
  return (await getState(force)).recipes.find((recipe) => recipe.id === id)
}

export function getFormalRecipes(state: RecipeState): Recipe[] {
  return state.recipes
    .filter(isFormalRecipe)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getPendingRecipes(state: RecipeState): Recipe[] {
  return state.recipes
    .filter((recipe) => !isFormalRecipe(recipe))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

async function createRecipe(content: RecipeContent): Promise<Recipe> {
  const recipe = await callApi<Recipe>('recipe.create', { content })
  upsertCachedRecipe(recipe)
  return recipe
}

/** 正式快速收录：名称与成功关键满足最低门槛。 */
export function quickCapture(name: string, successKey: string): Promise<Recipe> {
  return createRecipe({
    name: name.trim(), successKeys: [successKey.trim()], ingredients: [], steps: [], tags: [],
  })
}

/** 只填写名称时明确存为待补条目。 */
export function savePending(name: string): Promise<Recipe> {
  return createRecipe({ name: name.trim(), successKeys: [], ingredients: [], steps: [], tags: [] })
}

export async function updateRecipe(
  recipeId: string,
  content: RecipeContent,
  summary: string,
  expectedVersion?: number,
): Promise<Recipe> {
  const current = expectedVersion ? undefined : await getRecipe(recipeId)
  const version = expectedVersion || (current && current.version) || 1
  const recipe = await callApi<Recipe>('recipe.update', {
    recipeId, content, summary, expectedVersion: version,
  })
  upsertCachedRecipe(recipe)
  return recipe
}

export async function duplicateRecipe(recipeId: string): Promise<Recipe> {
  const recipe = await callApi<Recipe>('recipe.duplicate', { recipeId })
  upsertCachedRecipe(recipe)
  return recipe
}

export async function archiveRecipe(
  recipeId: string,
  expectedVersion: number,
): Promise<{ archivedRecipeId: string; version: number }> {
  const result = await callApi<{ archivedRecipeId: string; version: number }>('recipe.archive', {
    recipeId,
    expectedVersion,
  })
  if (cachedState) {
    cachedState = {
      ...cachedState,
      recipes: cachedState.recipes.filter((recipe) => recipe.id !== result.archivedRecipeId),
    }
  }
  return result
}

export async function restoreRevision(
  recipeId: string,
  revisionId: string,
  expectedVersion?: number,
): Promise<Recipe> {
  const current = expectedVersion ? undefined : await getRecipe(recipeId)
  const version = expectedVersion || (current && current.version) || 1
  const recipe = await callApi<Recipe>('recipe.restoreRevision', {
    recipeId, revisionId, expectedVersion: version,
  })
  upsertCachedRecipe(recipe)
  return recipe
}

/** 汇总全家用过的核心原料标签，按使用频次排序。 */
export function getTagSuggestions(state: RecipeState, exclude: string[] = [], limit = 8): string[] {
  return collectNames(state.recipes.map((recipe) => recipe.tags), exclude, limit)
}

/** 汇总全家用过的食材名，按使用频次排序。 */
export function getIngredientSuggestions(state: RecipeState, exclude: string[] = [], limit = 8): string[] {
  return collectNames(
    state.recipes.map((recipe) => recipe.ingredients.map((item) => item.name)), exclude, limit,
  )
}

function collectNames(groups: string[][], exclude: string[], limit: number): string[] {
  const counts = new Map<string, number>()
  groups.forEach((names) => names.forEach((name) => {
    const key = name.trim()
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }))
  return [...counts.entries()]
    .filter(([name]) => !exclude.includes(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, limit)
    .map(([name]) => name)
}
