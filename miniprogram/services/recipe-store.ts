/**
 * 家庭食谱本地仓库。
 * 页面只通过这里读写，Phase B 接入微信云开发时仅需替换本文件实现。
 *
 * 归因字段一律存成员 id，展示时用 getMemberById 解析成称谓。
 */

import { FAMILY_ID, FAMILY_NAME, SEED_MEMBERS, SEED_RECIPES } from '../data/seed'
import type { Family, Member, Recipe, RecipeContent, RecipeState } from '../models/recipe'
import { cloneJson, isFormalRecipe, uid } from '../utils/recipe-utils'

const STORAGE_KEY = 'jiawei-miniprogram-v3'
const LEGACY_STORAGE_KEY = 'jiawei-miniprogram-v2'
const DEFAULT_USER_ID = 'local-mom'
const INVITE_TTL = 24 * 60 * 60 * 1000
const MEMBER_COLORS = ['#8A5A4A', '#5A7A8A', '#8A6A4A', '#4A6A8A', '#6A5A8A']

function seedState(): RecipeState {
  return cloneJson({
    family: { id: FAMILY_ID, name: FAMILY_NAME },
    recipes: SEED_RECIPES,
    members: SEED_MEMBERS,
  })
}

/** v2 及更早的数据按名字归因，需要迁移到 id 归因并补上家庭实体。 */
function migrateV2(raw: Record<string, unknown>): RecipeState | null {
  const recipes = raw.recipes
  const members = raw.members
  if (!Array.isArray(recipes) || !Array.isArray(members) || members.length === 0) return null
  const idByName = new Map<string, string>()
  const migratedMembers = members.map((item) => {
    const member = item as Record<string, unknown>
    if (typeof member.name === 'string') idByName.set(member.name, String(member.id))
    return {
      ...member,
      userId: String(member.userId || `local-${member.id}`),
    } as Member
  })
  const fallbackId = migratedMembers[0].id
  const resolveByName = (name: unknown): string =>
    typeof name === 'string' && idByName.has(name) ? (idByName.get(name) as string) : fallbackId
  const migratedRecipes = recipes.map((item) => {
    const recipe = item as Record<string, unknown>
    return {
      ...recipe,
      familyId: String(recipe.familyId || FAMILY_ID),
      createdById: resolveByName(recipe.createdBy),
      updatedById: resolveByName(recipe.updatedBy),
      revisions: Array.isArray(recipe.revisions)
        ? recipe.revisions.map((rev) => {
            const revision = rev as Record<string, unknown>
            return { ...revision, authorId: resolveByName(revision.author) }
          })
        : [],
    }
  }) as Recipe[]
  return {
    family: { id: FAMILY_ID, name: FAMILY_NAME },
    members: migratedMembers,
    recipes: migratedRecipes,
  }
}

function isValidState(value: unknown): value is RecipeState {
  const candidate = value as RecipeState | undefined
  return Boolean(candidate && candidate.family && Array.isArray(candidate.recipes) && Array.isArray(candidate.members))
}

/** 读取快照；首次打开、旧版本数据或缓存损坏时自动迁移/恢复演示数据。 */
export function getState(): RecipeState {
  try {
    const cached = wx.getStorageSync(STORAGE_KEY)
    if (isValidState(cached)) return cloneJson(cached)
    // v2 及更早版本存在旧键名下，按名字归因迁移到 id 归因。
    const legacy = wx.getStorageSync(LEGACY_STORAGE_KEY)
    if (legacy && migrateV2(legacy as Record<string, unknown>)) {
      const migrated = migrateV2(legacy as Record<string, unknown>) as RecipeState
      saveState(migrated)
      return migrated
    }
    if (cached && migrateV2(cached as Record<string, unknown>)) {
      const migrated = migrateV2(cached as Record<string, unknown>) as RecipeState
      saveState(migrated)
      return migrated
    }
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

/** 当前操作者：本地演示固定为妈妈，Phase B 接入微信登录后按 openid 匹配。 */
export function getCurrentUser(state = getState()): Member {
  return (
    state.members.find((member) => member.userId === DEFAULT_USER_ID) ||
    state.members[0] || {
      id: 'm-mom',
      userId: DEFAULT_USER_ID,
      name: '妈妈',
      role: 'admin',
      joinedAt: new Date().toISOString(),
      color: '#BF5924',
    }
  )
}

export function getMemberById(state: RecipeState, id: string): Member | undefined {
  return state.members.find((member) => member.id === id)
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
    id: uid('r-'), familyId: state.family.id,
    createdById: currentUser.id, createdAt: now,
    updatedById: currentUser.id, updatedAt: now,
    revisions: [{
      id: uid('rev-'), authorId: currentUser.id, time: now,
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
    id: uid('r-'), familyId: state.family.id, name: name.trim(),
    successKeys: [], ingredients: [], steps: [], tags: [],
    createdById: currentUser.id, createdAt: now,
    updatedById: currentUser.id, updatedAt: now, revisions: [],
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
    updatedById: currentUser.id,
    updatedAt: now,
    revisions: [...target.revisions, {
      id: uid('rev-'), authorId: currentUser.id, time: now,
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
    id: uid('r-'), familyId: state.family.id,
    createdById: currentUser.id, createdAt: now,
    updatedById: currentUser.id, updatedAt: now,
    revisions: [{
      id: uid('rev-'), authorId: currentUser.id, time: now,
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
  const author = getMemberById(state, revision.authorId)
  const now = new Date().toISOString()
  const next: Recipe = {
    ...target,
    ...cloneJson(revision.snapshot),
    updatedById: currentUser.id,
    updatedAt: now,
    revisions: [...target.revisions, {
      id: uid('rev-'), authorId: currentUser.id, time: now,
      summary: `恢复 ${author ? author.name : '家人'} 的版本`, snapshot: cloneJson(revision.snapshot),
    }],
  }
  state.recipes[index] = next
  saveState(state)
  return next
}

/**
 * —— 家庭邀请 ——
 * 本地演示：生成 6 位限时邀请码，供分享卡片和手输兜底。
 * Phase B 云端版由云函数生成并校验，防止本地伪造。
 */
export function getOrCreateInvite(state = getState()): NonNullable<Family['invite']> {
  const existing = state.family.invite
  if (existing && existing.expiresAt > Date.now()) return existing
  const currentUser = getCurrentUser(state)
  const invite = {
    code: String(Math.floor(100000 + Math.random() * 900000)),
    expiresAt: Date.now() + INVITE_TTL,
    createdById: currentUser.id,
  }
  state.family.invite = invite
  saveState(state)
  return invite
}

/** 手输邀请码加入；本地演示仅做格式与有效期校验。 */
export function joinByInviteCode(code: string, displayName: string): { ok: boolean; message: string } {
  const state = getState()
  const invite = state.family.invite
  if (!invite || invite.expiresAt <= Date.now()) return { ok: false, message: '邀请码已过期，请让家人重新生成' }
  if (invite.code !== code.trim()) return { ok: false, message: '邀请码不正确' }
  const name = displayName.trim()
  if (!name) return { ok: false, message: '请填写你的家庭称谓' }
  if (state.members.some((member) => member.name === name)) return { ok: false, message: '这个称谓已被使用' }
  const member: Member = {
    id: uid('m-'),
    userId: uid('local-'),
    name,
    role: 'member',
    joinedAt: new Date().toISOString(),
    color: MEMBER_COLORS[state.members.length % MEMBER_COLORS.length],
  }
  state.members.push(member)
  saveState(state)
  return { ok: true, message: `欢迎加入，${name}` }
}

export function removeMember(id: string): void {
  const state = getState()
  const current = getCurrentUser(state)
  const target = getMemberById(state, id)
  // 管理员不能移除自己和另一位管理员（首版只有创建者是管理员）。
  if (!target || target.id === current.id) return
  state.members = state.members.filter((member) => member.id !== id)
  saveState(state)
}

/** 汇总全家用过的核心原料标签，按使用频次排序，供编辑时直接点选。 */
export function getTagSuggestions(state = getState(), exclude: string[] = [], limit = 8): string[] {
  return collectNames(
    state.recipes.map((recipe) => recipe.tags),
    exclude,
    limit,
  )
}

/** 汇总全家用过的食材名，按使用频次排序，供编辑时直接点选。 */
export function getIngredientSuggestions(state = getState(), exclude: string[] = [], limit = 8): string[] {
  return collectNames(
    state.recipes.map((recipe) => recipe.ingredients.map((item) => item.name)),
    exclude,
    limit,
  )
}

function collectNames(groups: string[][], exclude: string[], limit: number): string[] {
  const counts = new Map<string, number>()
  groups.forEach((names) => {
    names.forEach((name) => {
      const key = name.trim()
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    })
  })
  return [...counts.entries()]
    .filter(([name]) => !exclude.includes(name))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, limit)
    .map(([name]) => name)
}

/** 仅供开发调试时恢复初始演示数据。 */
export function resetDemoState(): void {
  saveState(seedState())
}
