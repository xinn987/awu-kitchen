/**
 * 家庭食谱本地仓库。
 * 页面只通过这里读写，未来更换云端 API 时无需重写页面状态逻辑。
 */

import { FAMILY_NAME, SEED_MEMBERS, SEED_RECIPES } from '../data/seed'
import type { Member, Recipe, RecipeContent, RecipeState } from '../models/recipe'
import { cloneJson, isFormalRecipe, uid } from '../utils/recipe-utils'

const STORAGE_KEY = 'jiawei-miniprogram-v2'
const CURRENT_USER_ID = 'm-mom'

function seedState(): RecipeState {
  return cloneJson({ recipes: SEED_RECIPES, members: SEED_MEMBERS })
}

function isValidState(value: unknown): value is RecipeState {
  const candidate = value as RecipeState | undefined
  return Boolean(candidate && Array.isArray(candidate.recipes) && Array.isArray(candidate.members))
}

/** 读取快照；首次打开或缓存损坏时恢复演示数据。 */
export function getState(): RecipeState {
  try {
    const cached = wx.getStorageSync(STORAGE_KEY) as unknown
    if (isValidState(cached)) return cloneJson(cached)
  } catch {
    // 存储不可用时退回种子数据，页面仍可浏览。
  }
  const initial = seedState()
  saveState(initial)
  return initial
}

export function saveState(state: RecipeState): void {
  try {
    wx.setStorageSync(STORAGE_KEY, cloneJson(state))
  } catch {
    wx.showToast({ title: '本地保存失败', icon: 'none' })
  }
}

export function getCurrentUser(state = getState()): Member {
  return state.members.find((member) => member.id === CURRENT_USER_ID) || {
    id: CURRENT_USER_ID,
    name: '妈妈',
    role: 'admin',
    joinedAt: new Date().toISOString(),
    color: '#BF5924',
  }
}

export function getRecipe(id: string): Recipe | undefined {
  return getState().recipes.find((recipe) => recipe.id === id)
}

export function getFormalRecipes(state = getState()): Recipe[] {
  return state.recipes
    .filter(isFormalRecipe)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getPendingRecipes(state = getState()): Recipe[] {
  return state.recipes
    .filter((recipe) => !isFormalRecipe(recipe))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** 正式快速收录：名称与成功关键满足最低门槛。 */
export function quickCapture(name: string, successKey: string): Recipe {
  const state = getState()
  const currentUser = getCurrentUser(state)
  const now = new Date().toISOString()
  const content: RecipeContent = {
    name: name.trim(), successKeys: [successKey.trim()], ingredients: [], steps: [], tags: [],
  }
  const recipe: Recipe = {
    ...content,
    id: uid('r-'), family: FAMILY_NAME,
    createdBy: currentUser.name, createdAt: now,
    updatedBy: currentUser.name, updatedAt: now,
    revisions: [{
      id: uid('rev-'), author: currentUser.name, time: now,
      summary: '初次收录', snapshot: cloneJson(content),
    }],
  }
  state.recipes.unshift(recipe)
  saveState(state)
  return recipe
}

/** 只填写名称时明确存为待补条目。 */
export function savePending(name: string): Recipe {
  const state = getState()
  const currentUser = getCurrentUser(state)
  const now = new Date().toISOString()
  const recipe: Recipe = {
    id: uid('r-'), family: FAMILY_NAME, name: name.trim(),
    successKeys: [], ingredients: [], steps: [], tags: [],
    createdBy: currentUser.name, createdAt: now,
    updatedBy: currentUser.name, updatedAt: now, revisions: [],
  }
  state.recipes.unshift(recipe)
  saveState(state)
  return recipe
}

/** 更新食谱并追加修订快照。 */
export function updateRecipe(id: string, content: RecipeContent, summary: string): Recipe | undefined {
  const state = getState()
  const index = state.recipes.findIndex((recipe) => recipe.id === id)
  if (index < 0) return undefined
  const currentUser = getCurrentUser(state)
  const now = new Date().toISOString()
  const target = state.recipes[index]
  const next: Recipe = {
    ...target,
    ...cloneJson(content),
    updatedBy: currentUser.name,
    updatedAt: now,
    revisions: [...target.revisions, {
      id: uid('rev-'), author: currentUser.name, time: now,
      summary, snapshot: cloneJson(content),
    }],
  }
  state.recipes[index] = next
  saveState(state)
  return next
}

/** 复制为新的家庭食谱。 */
export function duplicateRecipe(id: string): Recipe | undefined {
  const state = getState()
  const target = state.recipes.find((recipe) => recipe.id === id)
  if (!target) return undefined
  const currentUser = getCurrentUser(state)
  const now = new Date().toISOString()
  const content: RecipeContent = {
    name: `${target.name}（副本）`,
    successKeys: [...target.successKeys],
    ingredients: target.ingredients.map((item) => ({ ...item })),
    steps: [...target.steps], stage: target.stage, type: target.type, tags: [...target.tags],
  }
  const copy: Recipe = {
    ...content,
    id: uid('r-'), family: FAMILY_NAME,
    createdBy: currentUser.name, createdAt: now,
    updatedBy: currentUser.name, updatedAt: now,
    revisions: [{
      id: uid('rev-'), author: currentUser.name, time: now,
      summary: `复制自「${target.name}」`, snapshot: cloneJson(content),
    }],
  }
  state.recipes.unshift(copy)
  saveState(state)
  return copy
}

/** 恢复会形成一条新修订，不删除后续历史。 */
export function restoreRevision(recipeId: string, revisionId: string): Recipe | undefined {
  const state = getState()
  const index = state.recipes.findIndex((recipe) => recipe.id === recipeId)
  if (index < 0) return undefined
  const target = state.recipes[index]
  const revision = target.revisions.find((item) => item.id === revisionId)
  if (!revision) return undefined
  const currentUser = getCurrentUser(state)
  const now = new Date().toISOString()
  const next: Recipe = {
    ...target,
    ...cloneJson(revision.snapshot),
    updatedBy: currentUser.name,
    updatedAt: now,
    revisions: [...target.revisions, {
      id: uid('rev-'), author: currentUser.name, time: now,
      summary: `恢复 ${revision.author} 的版本`, snapshot: cloneJson(revision.snapshot),
    }],
  }
  state.recipes[index] = next
  saveState(state)
  return next
}

export function inviteMember(name: string): Member {
  const state = getState()
  const colors = ['#8A5A4A', '#5A7A8A', '#8A6A4A', '#4A6A8A']
  const member: Member = {
    id: uid('m-'), name: name.trim(), role: 'member', joinedAt: new Date().toISOString(),
    color: colors[state.members.length % colors.length],
  }
  state.members.push(member)
  saveState(state)
  return member
}

export function removeMember(id: string): void {
  const state = getState()
  state.members = state.members.filter((member) => member.id !== id || member.id === CURRENT_USER_ID)
  saveState(state)
}

/** 仅供开发调试时恢复初始演示数据。 */
export function resetDemoState(): void {
  saveState(seedState())
}
