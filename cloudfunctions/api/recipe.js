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
exports.listArchivedRecipes = listArchivedRecipes;
exports.restoreRecipe = restoreRecipe;
exports.restoreRevision = restoreRevision;
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const validation_1 = require("./validation");
const recipe_option_model_1 = require("./recipe-option-model");
function id(prefix) {
    return `${prefix}${crypto_1.default.randomBytes(12).toString('hex')}`;
}
/** CloudBase 的 doc(id).set() 数据体不能包含只读字段 _id。 */
function writableDocument(record) {
    const data = { ...record };
    delete data._id;
    return data;
}
function contentOf(recipe, familyId, recipeOptions) {
    return (0, validation_1.normalizeRecipeContent)(recipe, familyId, recipeOptions);
}
/** 列表读取时也清洗旧步骤和旧修订快照，但不会主动改写数据库。 */
function readableRecipe(recipe, familyId, recipeOptions) {
    const revisions = Array.isArray(recipe.revisions)
        ? recipe.revisions.map((revision) => {
            const raw = revision;
            return { ...raw, snapshot: (0, validation_1.normalizeRecipeContent)(raw.snapshot, familyId, recipeOptions) };
        })
        : [];
    return {
        ...recipe,
        ...contentOf(recipe, familyId, recipeOptions),
        id: String(recipe._id),
        revisions,
    };
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
function supportsRecipeImages(payload) {
    return Number(payload.clientSchemaVersion) >= 2;
}
/** 已发布旧客户端仍接收 string[]，新版才接收稳定步骤对象和图片。 */
function recipeViewForClient(recipe, payload) {
    if (supportsRecipeImages(payload))
        return recipe;
    const result = { ...recipe };
    delete result.mainImage;
    result.steps = Array.isArray(recipe.steps)
        ? recipe.steps.map((step) => typeof step === 'string'
            ? step
            : String((step || {}).text || ''))
            .filter(Boolean)
        : [];
    return result;
}
function hasRecipeImages(recipe) {
    if (recipe.mainImage)
        return true;
    return Array.isArray(recipe.steps) && recipe.steps.some((step) => {
        return typeof step === 'object' && step !== null && Boolean(step.image);
    });
}
async function listRecipeState(userId, payload) {
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
    const recipeOptions = (0, recipe_option_model_1.optionsFromFamily)(family);
    const recipes = recipeResult.data
        .filter((recipe) => !recipe.archivedAt)
        .map((recipe) => readableRecipe(recipe, current.familyId, recipeOptions))
        .map((recipe) => recipeViewForClient(recipe, payload));
    return {
        recipeSchemaVersion: 2,
        family: { id: String(family._id), name: String(family.name) },
        recipeOptions,
        currentMemberId: current._id,
        members: memberResult.data.map(memberView),
        recipes,
    };
}
async function createRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = id('r-');
    const now = new Date().toISOString();
    let recipe = {};
    await cloud_1.db.runTransaction(async (transaction) => {
        const familyResult = await transaction.collection('families').doc(member.familyId).get();
        const recipeOptions = (0, recipe_option_model_1.optionsFromFamily)(familyResult.data);
        const content = (0, validation_1.normalizeRecipeContent)(payload.content, member.familyId, recipeOptions);
        const formal = content.successKeys.length > 0;
        const revisions = formal ? [{
                id: id('rev-'), authorId: member._id, time: now,
                summary: '初次收录', snapshot: content,
            }] : [];
        recipe = {
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
        await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(recipe) });
    });
    return recipeViewForClient(recipe, payload);
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
    const expectedVersion = Number(payload.expectedVersion);
    const summary = (0, validation_1.requiredText)(payload.summary, '修改说明', 100);
    const now = new Date().toISOString();
    let next = {};
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('recipes').doc(recipeId).get();
        const familyResult = await transaction.collection('families').doc(member.familyId).get();
        const current = result.data;
        const recipeOptions = (0, recipe_option_model_1.optionsFromFamily)(familyResult.data);
        const content = (0, validation_1.normalizeRecipeContent)(payload.content, member.familyId, recipeOptions);
        (0, errors_1.assertDomain)(content.successKeys.length > 0, 'VALIDATION_ERROR', '正式食谱至少需要一条关键经验');
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权编辑这份食谱');
        (0, errors_1.assertDomain)(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        (0, errors_1.assertDomain)(supportsRecipeImages(payload) || !hasRecipeImages(current), 'CLIENT_UPDATE_REQUIRED', '这份食谱包含图片，请先更新到最新体验版再修改');
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
    return recipeViewForClient(next, payload);
}
async function duplicateRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const sourceId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const [source, familyResult] = await Promise.all([
        ownedRecipe(member.familyId, sourceId),
        cloud_1.db.collection('families').doc(member.familyId).get(),
    ]);
    const sourceContent = contentOf(source, member.familyId, (0, recipe_option_model_1.optionsFromFamily)(familyResult.data));
    return createRecipe(userId, {
        clientSchemaVersion: payload.clientSchemaVersion,
        content: {
            ...sourceContent,
            name: `${String(source.name)}（副本）`,
            // 副本的步骤是新的内容实体，但同一家庭内可安全复用图片文件。
            steps: sourceContent.steps.map((step) => ({ ...step, id: id('step-') })),
        },
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
/** 废纸篓列表：只返回归档食谱的归因信息，不携带正文和修订历史。 */
async function listArchivedRecipes(userId) {
    const { member: current } = await (0, auth_1.getActiveContext)(userId);
    const [recipeRaw, memberRaw] = await Promise.all([
        cloud_1.db.collection('recipes').where({ familyId: current.familyId })
            .field({
            name: true, state: true, version: true, archivedAt: true, archivedById: true,
        }).limit(1000).get(),
        cloud_1.db.collection('family_members').where({ familyId: current.familyId })
            .field({ displayName: true }).limit(100).get(),
    ]);
    const recipeResult = recipeRaw;
    const memberResult = memberRaw;
    const nameOf = (memberId) => memberResult.data.find((item) => item._id === memberId);
    const recipes = recipeResult.data
        .filter((recipe) => Boolean(recipe.archivedAt))
        .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1))
        .map((recipe) => {
        const archiver = nameOf(recipe.archivedById);
        return {
            id: String(recipe._id),
            name: String(recipe.name),
            isFormal: recipe.state === 'formal',
            version: Number(recipe.version) || 1,
            archivedAt: String(recipe.archivedAt),
            archivedByName: archiver ? archiver.displayName : '家人',
        };
    });
    return { recipes };
}
/** 从废纸篓恢复：只移除归档标记并递增版本，正文和修订历史原样保留。 */
async function restoreRecipe(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('recipes').doc(recipeId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权恢复这份食谱');
        (0, errors_1.assertDomain)(Boolean(current.archivedAt), 'VALIDATION_ERROR', '这份食谱不在废纸篓中');
        const next = { ...current };
        delete next.archivedAt;
        delete next.archivedById;
        next.id = recipeId;
        next.updatedById = member._id;
        next.updatedAt = new Date().toISOString();
        next.version = Number(current.version) + 1;
        await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(next) });
    });
    return { restoredRecipeId: recipeId };
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
        const familyResult = await transaction.collection('families').doc(member.familyId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权恢复这份食谱');
        (0, errors_1.assertDomain)(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓');
        (0, errors_1.assertDomain)(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入');
        const revisions = Array.isArray(current.revisions)
            ? [...current.revisions] : [];
        const target = revisions.find((item) => item.id === revisionId);
        (0, errors_1.assertDomain)(target && target.snapshot, 'VALIDATION_ERROR', '修订记录不存在');
        const recipeOptions = (0, recipe_option_model_1.optionsFromFamily)(familyResult.data);
        const content = (0, validation_1.normalizeRecipeContent)(target.snapshot, member.familyId, recipeOptions);
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
    return recipeViewForClient(next, payload);
}
