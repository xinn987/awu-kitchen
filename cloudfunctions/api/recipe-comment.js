"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecipeComments = listRecipeComments;
exports.createRecipeComment = createRecipeComment;
exports.updateRecipeComment = updateRecipeComment;
exports.deleteRecipeComment = deleteRecipeComment;
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const validation_1 = require("./validation");
const COLLECTION = 'recipe_comments';
const MAX_COMMENTS = 100;
let collectionReady;
function id() {
    return `c-${crypto_1.default.randomBytes(12).toString('hex')}`;
}
function isMissingCollection(error) {
    const raw = (error || {});
    const code = String(raw.code || raw.errCode || '');
    const message = error instanceof Error ? error.message : String(error);
    return code.includes('502005') || /collection not exist|collection not found/i.test(message);
}
/** 首次部署无需人工进控制台建集合；并发冷启动时通过二次读取消化“已存在”竞争。 */
async function ensureCollection() {
    if (collectionReady)
        return collectionReady;
    collectionReady = (async () => {
        try {
            await cloud_1.db.collection(COLLECTION).limit(1).get();
            return;
        }
        catch (error) {
            if (!isMissingCollection(error))
                throw error;
        }
        try {
            await cloud_1.db.createCollection(COLLECTION);
        }
        catch (error) {
            // 另一个冷启动可能刚创建成功；只有再次读取也失败时才抛出真实错误。
            try {
                await cloud_1.db.collection(COLLECTION).limit(1).get();
            }
            catch {
                throw error;
            }
        }
    })();
    return collectionReady;
}
function commentView(comment) {
    return {
        id: comment._id,
        recipeId: comment.recipeId,
        authorMemberId: comment.authorMemberId,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        version: comment.version,
    };
}
function writableComment(comment) {
    const { _id: _commentId, ...data } = comment;
    return data;
}
/** 评论不能静默截断；客户端 maxlength 只是交互约束，云端仍需独立拒绝超长请求。 */
function commentContent(value) {
    const content = (0, validation_1.requiredText)(value, '评论', 10000);
    (0, errors_1.assertDomain)(content.length <= 500, 'VALIDATION_ERROR', '评论最多 500 字');
    return content;
}
function compareComments(a, b, newest) {
    const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    const stable = time || a._id.localeCompare(b._id);
    return newest ? -stable : stable;
}
async function activeRecipe(familyId, recipeId) {
    try {
        const result = await cloud_1.db.collection('recipes').doc(recipeId).get();
        const recipe = result.data;
        (0, errors_1.assertDomain)(recipe.familyId === familyId, 'FORBIDDEN', '无权访问这份食谱的评论');
        (0, errors_1.assertDomain)(!recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        return recipe;
    }
    catch (error) {
        if (error instanceof errors_1.DomainError)
            throw error;
        throw new errors_1.DomainError('VALIDATION_ERROR', '食谱不存在');
    }
}
async function listRecipeComments(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const recipe = await activeRecipe(member.familyId, recipeId);
    const result = await cloud_1.db.collection(COLLECTION)
        .where({ familyId: member.familyId, recipeId })
        .limit(MAX_COMMENTS)
        .get();
    const newest = payload.sort !== 'oldest';
    const comments = [...result.data].sort((a, b) => compareComments(a, b, newest)).map(commentView);
    return { comments, commentCount: Math.max(0, Number(recipe.commentCount) || 0) };
}
async function createRecipeComment(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const content = commentContent(payload.content);
    const commentId = id();
    const now = new Date().toISOString();
    const comment = {
        _id: commentId,
        familyId: member.familyId,
        recipeId,
        authorMemberId: member._id,
        content,
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
    let commentCount = 0;
    await cloud_1.db.runTransaction(async (transaction) => {
        const recipeResult = await transaction.collection('recipes').doc(recipeId).get();
        const recipe = recipeResult.data;
        (0, errors_1.assertDomain)(recipe.familyId === member.familyId, 'FORBIDDEN', '无权评论这份食谱');
        (0, errors_1.assertDomain)(!recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        commentCount = Math.max(0, Number(recipe.commentCount) || 0) + 1;
        await transaction.collection(COLLECTION).doc(commentId).set({ data: writableComment(comment) });
        // 评论计数不修改食谱的 version、updatedAt 或修订记录。
        await transaction.collection('recipes').doc(recipeId).update({ data: { commentCount } });
    });
    return { comment: commentView(comment), commentCount };
}
async function updateRecipeComment(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const commentId = (0, validation_1.requiredText)(payload.commentId, '评论', 80);
    const content = commentContent(payload.content);
    const expectedVersion = Number(payload.expectedVersion);
    const now = new Date().toISOString();
    let next;
    await cloud_1.db.runTransaction(async (transaction) => {
        const commentResult = await transaction.collection(COLLECTION).doc(commentId).get();
        const current = commentResult.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权修改这条评论');
        (0, errors_1.assertDomain)(current.authorMemberId === member._id, 'FORBIDDEN', '只能编辑自己的评论');
        (0, errors_1.assertDomain)(current.version === expectedVersion, 'VERSION_CONFLICT', '这条评论已被更新，请重新载入');
        const recipeResult = await transaction.collection('recipes').doc(current.recipeId).get();
        const recipe = recipeResult.data;
        (0, errors_1.assertDomain)(recipe.familyId === member.familyId && !recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        next = { ...current, content, updatedAt: now, version: expectedVersion + 1 };
        await transaction.collection(COLLECTION).doc(commentId).update({
            data: { content, updatedAt: now, version: expectedVersion + 1 },
        });
    });
    (0, errors_1.assertDomain)(next, 'SERVICE_UNAVAILABLE', '评论保存失败');
    return commentView(next);
}
async function deleteRecipeComment(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const commentId = (0, validation_1.requiredText)(payload.commentId, '评论', 80);
    let recipeId = '';
    let commentCount = 0;
    await cloud_1.db.runTransaction(async (transaction) => {
        const commentResult = await transaction.collection(COLLECTION).doc(commentId).get();
        const comment = commentResult.data;
        (0, errors_1.assertDomain)(comment.familyId === member.familyId, 'FORBIDDEN', '无权删除这条评论');
        (0, errors_1.assertDomain)(comment.authorMemberId === member._id || member.role === 'admin', 'FORBIDDEN', '只能删除自己的评论');
        const recipeResult = await transaction.collection('recipes').doc(comment.recipeId).get();
        const recipe = recipeResult.data;
        (0, errors_1.assertDomain)(recipe.familyId === member.familyId && !recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        recipeId = comment.recipeId;
        commentCount = Math.max(0, (Number(recipe.commentCount) || 0) - 1);
        await transaction.collection(COLLECTION).doc(commentId).remove();
        await transaction.collection('recipes').doc(recipeId).update({ data: { commentCount } });
    });
    return { deletedCommentId: commentId, recipeId, commentCount };
}
