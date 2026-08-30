import './cloud'
import { currentUserId } from './auth'
import { DomainError } from './errors'
import {
  bootstrap, createFamily, createInvite, joinFamily, listMembers, previewInvite, removeMember,
} from './family'
import {
  archiveRecipe, createRecipe, duplicateRecipe, listArchivedRecipes, listRecipeState,
  resolveRecipeMedia, restoreRecipe, restoreRevision, updateRecipe,
} from './recipe'
import {
  createRecipeComment, deleteRecipeComment, listRecipeComments, updateRecipeComment,
} from './recipe-comment'
import {
  createRecipeAttempt, deleteRecipeAttempt, getRecipeAttempt, listRecipeAttempts, updateRecipeAttempt,
} from './recipe-attempt'
import { addRecipeOption, listRecipeOptions, removeRecipeOption } from './recipe-options'

interface ApiEvent {
  action?: string
  payload?: Record<string, unknown>
}

const handlers: Record<string, (userId: string, payload: Record<string, unknown>) => Promise<unknown>> = {
  'session.bootstrap': (userId) => bootstrap(userId),
  'family.create': createFamily,
  'family.createInvite': (userId) => createInvite(userId),
  'family.previewInvite': (_userId, payload) => previewInvite(payload.token),
  'family.join': joinFamily,
  'family.listMembers': (userId) => listMembers(userId),
  'family.removeMember': removeMember,
  'recipe.list': listRecipeState,
  'recipe.resolveMedia': resolveRecipeMedia,
  'recipe.create': createRecipe,
  'recipe.update': updateRecipe,
  'recipe.archive': archiveRecipe,
  'recipe.duplicate': duplicateRecipe,
  'recipe.listArchived': listArchivedRecipes,
  'recipe.restore': restoreRecipe,
  'recipe.restoreRevision': restoreRevision,
  'recipeComment.list': listRecipeComments,
  'recipeComment.create': createRecipeComment,
  'recipeComment.update': updateRecipeComment,
  'recipeComment.delete': deleteRecipeComment,
  'recipeAttempt.list': listRecipeAttempts,
  'recipeAttempt.get': getRecipeAttempt,
  'recipeAttempt.create': createRecipeAttempt,
  'recipeAttempt.update': updateRecipeAttempt,
  'recipeAttempt.delete': deleteRecipeAttempt,
  'recipeOptions.list': listRecipeOptions,
  'recipeOptions.add': addRecipeOption,
  'recipeOptions.remove': removeRecipeOption,
}

/** 单一入口只负责路由和错误翻译，业务逻辑留在对应模块。 */
export async function main(event: ApiEvent) {
  const action = typeof event.action === 'string' ? event.action : ''
  const handler = handlers[action]
  if (!handler) return { ok: false, error: { code: 'VALIDATION_ERROR', message: '未知操作' } }
  try {
    const userId = currentUserId()
    const data = await handler(userId, event.payload || {})
    return { ok: true, data }
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    // 不打印 event，避免邀请令牌或食谱正文进入日志。
    console.error(`[${action}]`, error)
    return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用，请稍后重试' } }
  }
}
