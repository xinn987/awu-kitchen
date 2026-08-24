"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecipeState = listRecipeState;
exports.createRecipe = createRecipe;
exports.updateRecipe = updateRecipe;
exports.duplicateRecipe = duplicateRecipe;
exports.archiveRecipe = archiveRecipe;
exports.restoreRevision = restoreRevision;
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const validation_1 = require("./validation");
function id(prefix) {
    return `${prefix}${crypto_1.default.randomBytes(12).toString('hex')}`;
}
/** CloudBase 的 doc(id).set() 数据体不能包含只读字段 _id。 */
function writableDocument(record) {
    const data = { ...record };
    delete data._id;
    return data;
}
function contentOf(recipe) {
    return (0, validation_1.normalizeRecipeContent)(recipe);
}
function memberView(member) {
    return {
        id: member._id,
        name: member.displayName,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        color: member.color,
    };
}
async function listRecipeState(userId) {
    const { member: current } = await (0, auth_1.getActiveContext)(userId);
    const [familyRaw, memberRaw, recipeRaw] = await Promise.all([
        cloud_1.db.collection('families').doc(current.familyId).get(),
        cloud_1.db.collection('family_members').where({ familyId: current.familyId }).limit(100).get(),
        cloud_1.db.collection('recipes').where({ familyId: current.familyId }).limit(1000).get(),
    ]);
    const familyResult = familyRaw;
    const memberResult = memberRaw;
    const recipeResult = recipeRaw;
    const family = familyResult.data;
    const recipes = recipeResult.data
        .filter((recipe) => !recipe.archivedAt)
        .map((recipe) => ({ ...recipe, id: String(recipe._id) }));
    return {
        family: { id: family._id, name: family.name },
        currentMemberId: current._id,
        members: memberResult.data.map(memberView),
        recipes,
    };
}
async function createRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const content = (0, validation_1.normalizeRecipeContent)(payload.content);
    const recipeId = id('r-');
    const now = new Date().toISOString();
    const formal = content.successKeys.length > 0;
    const revisions = formal ? [{
            id: id('rev-'), authorId: member._id, time: now,
            summary: '初次收录', snapshot: content,
        }] : [];
    const recipe = {
        ...content,
        _id: recipeId,
        id: recipeId,
        familyId: member.familyId,
        state: formal ? 'formal' : 'pending',
        createdById: member._id,
        createdAt: now,
        updatedById: member._id,
        updatedAt: now,
        version: 1,
        revisions,
    };
    await cloud_1.db.collection('recipes').doc(recipeId).set({ data: writableDocument(recipe) });
    return recipe;
}
async function ownedRecipe(familyId, recipeId) {
    try {
        const result = await cloud_1.db.collection('recipes').doc(recipeId).get();
        const recipe = result.data;
        (0, errors_1.assertDomain)(recipe.familyId === familyId, 'FORBIDDEN', '无权访问这份食谱');
        (0, errors_1.assertDomain)(!recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        return recipe;
    }
    catch (error) {
        if (error instanceof errors_1.DomainError)
            throw error;
        throw new errors_1.DomainError('VALIDATION_ERROR', '食谱不存在');
    }
}
async function updateRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const content = (0, validation_1.normalizeRecipeContent)(payload.content);
    (0, errors_1.assertDomain)(content.successKeys.length > 0, 'VALIDATION_ERROR', '正式食谱至少需要一条关键经验');
    const expectedVersion = Number(payload.expectedVersion);
    const summary = (0, validation_1.requiredText)(payload.summary, '修改说明', 100);
    const now = new Date().toISOString();
    let next = {};
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('recipes').doc(recipeId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权编辑这份食谱');
        (0, errors_1.assertDomain)(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        (0, errors_1.assertDomain)(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入');
        const version = expectedVersion + 1;
        const revisions = Array.isArray(current.revisions) ? [...current.revisions] : [];
        revisions.push({ id: id('rev-'), authorId: member._id, time: now, summary, snapshot: content });
        next = {
            ...current,
            ...content,
            id: recipeId,
            state: 'formal',
            updatedById: member._id,
            updatedAt: now,
            version,
            revisions,
        };
        await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(next) });
    });
    return next;
}
async function duplicateRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const sourceId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const source = await ownedRecipe(member.familyId, sourceId);
    return createRecipe(userId, {
        content: { ...contentOf(source), name: `${String(source.name)}（副本）` },
    });
}
/**
 * 将食谱软删除：只增加归档标记并从正常列表隐藏，正文和修订历史全部保留。
 * 使用版本校验，避免在家人刚完成修改后由旧页面误归档新版本。
 */
async function archiveRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const expectedVersion = Number(payload.expectedVersion);
    const now = new Date().toISOString();
    let version = expectedVersion;
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('recipes').doc(recipeId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权删除这份食谱');
        (0, errors_1.assertDomain)(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        (0, errors_1.assertDomain)(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入');
        version = expectedVersion + 1;
        await transaction.collection('recipes').doc(recipeId).update({
            data: {
                archivedAt: now,
                archivedById: member._id,
                updatedById: member._id,
                updatedAt: now,
                version,
            },
        });
    });
    return { archivedRecipeId: recipeId, version };
}
async function restoreRevision(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const revisionId = (0, validation_1.requiredText)(payload.revisionId, '修订记录', 80);
    const expectedVersion = Number(payload.expectedVersion);
    const now = new Date().toISOString();
    let next = {};
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('recipes').doc(recipeId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权恢复这份食谱');
        (0, errors_1.assertDomain)(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        (0, errors_1.assertDomain)(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入');
        const revisions = Array.isArray(current.revisions)
            ? [...current.revisions] : [];
        const target = revisions.find((item) => item.id === revisionId);
        (0, errors_1.assertDomain)(target && target.snapshot, 'VALIDATION_ERROR', '修订记录不存在');
        const content = (0, validation_1.normalizeRecipeContent)(target.snapshot);
        const version = expectedVersion + 1;
        revisions.push({
            id: id('rev-'), authorId: member._id, time: now,
            summary: '恢复旧版本', snapshot: content,
        });
        next = {
            ...current,
            ...content,
            id: recipeId,
            state: content.successKeys.length > 0 ? 'formal' : 'pending',
            updatedById: member._id,
            updatedAt: now,
            version,
            revisions,
        };
        await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(next) });
    });
    return next;
}
