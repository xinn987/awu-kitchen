"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
require("./cloud");
const auth_1 = require("./auth");
const errors_1 = require("./errors");
const family_1 = require("./family");
const recipe_1 = require("./recipe");
const recipe_comment_1 = require("./recipe-comment");
const recipe_attempt_1 = require("./recipe-attempt");
const recipe_options_1 = require("./recipe-options");
const handlers = {
    'session.bootstrap': (userId) => (0, family_1.bootstrap)(userId),
    'family.create': family_1.createFamily,
    'family.createInvite': (userId) => (0, family_1.createInvite)(userId),
    'family.previewInvite': (_userId, payload) => (0, family_1.previewInvite)(payload.token),
    'family.join': family_1.joinFamily,
    'family.listMembers': (userId) => (0, family_1.listMembers)(userId),
    'family.removeMember': family_1.removeMember,
    'recipe.list': recipe_1.listRecipeState,
    'recipe.create': recipe_1.createRecipe,
    'recipe.update': recipe_1.updateRecipe,
    'recipe.archive': recipe_1.archiveRecipe,
    'recipe.duplicate': recipe_1.duplicateRecipe,
    'recipe.listArchived': recipe_1.listArchivedRecipes,
    'recipe.restore': recipe_1.restoreRecipe,
    'recipe.restoreRevision': recipe_1.restoreRevision,
    'recipeComment.list': recipe_comment_1.listRecipeComments,
    'recipeComment.create': recipe_comment_1.createRecipeComment,
    'recipeComment.update': recipe_comment_1.updateRecipeComment,
    'recipeComment.delete': recipe_comment_1.deleteRecipeComment,
    'recipeAttempt.list': recipe_attempt_1.listRecipeAttempts,
    'recipeAttempt.create': recipe_attempt_1.createRecipeAttempt,
    'recipeAttempt.update': recipe_attempt_1.updateRecipeAttempt,
    'recipeAttempt.delete': recipe_attempt_1.deleteRecipeAttempt,
    'recipeOptions.list': recipe_options_1.listRecipeOptions,
    'recipeOptions.add': recipe_options_1.addRecipeOption,
    'recipeOptions.remove': recipe_options_1.removeRecipeOption,
};
/** 单一入口只负责路由和错误翻译，业务逻辑留在对应模块。 */
async function main(event) {
    const action = typeof event.action === 'string' ? event.action : '';
    const handler = handlers[action];
    if (!handler)
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: '未知操作' } };
    try {
        const userId = (0, auth_1.currentUserId)();
        const data = await handler(userId, event.payload || {});
        return { ok: true, data };
    }
    catch (error) {
        if (error instanceof errors_1.DomainError) {
            return { ok: false, error: { code: error.code, message: error.message } };
        }
        // 不打印 event，避免邀请令牌或食谱正文进入日志。
        console.error(`[${action}]`, error);
        return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用，请稍后重试' } };
    }
}
