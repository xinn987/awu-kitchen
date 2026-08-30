"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecipeAttempts = listRecipeAttempts;
exports.getRecipeAttempt = getRecipeAttempt;
exports.createRecipeAttempt = createRecipeAttempt;
exports.updateRecipeAttempt = updateRecipeAttempt;
exports.deleteRecipeAttempt = deleteRecipeAttempt;
/** 食记记录：独立保存每次制作反馈，不让无界历史膨胀食谱正文。 */
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const validation_1 = require("./validation");
const COLLECTION = 'recipe_attempts';
const MAX_ATTEMPTS = 200;
const ACCEPTANCE_VALUES = ['loved', 'accepted', 'rejected'];
let collectionReady;
function id() {
    return `a-${crypto_1.default.randomBytes(12).toString('hex')}`;
}
function isMissingCollection(error) {
    const raw = (error || {});
    const code = String(raw.code || raw.errCode || '');
    const message = error instanceof Error ? error.message : String(error);
    return code.includes('502005') || /collection not exist|collection not found/i.test(message);
}
/** 首次使用时自动建集合，减少体验版部署后的人工配置。 */
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
function attemptView(attempt) {
    return {
        id: attempt._id,
        recipeId: attempt.recipeId,
        recipeName: attempt.recipeName,
        recipeVersion: attempt.recipeVersion,
        occurredOn: attempt.occurredOn,
        acceptance: attempt.acceptance,
        followedOriginal: attempt.followedOriginal,
        adjustmentNote: attempt.adjustmentNote,
        authorMemberId: attempt.authorMemberId,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
        version: attempt.version,
    };
}
function writableAttempt(attempt) {
    const { _id: _attemptId, ...data } = attempt;
    return data;
}
/** 只接受真实日历日期，防止字符串排序和展示发生歧义。 */
function occurredOn(value) {
    const date = (0, validation_1.requiredText)(value, '日期', 10);
    (0, errors_1.assertDomain)(/^\d{4}-\d{2}-\d{2}$/.test(date), 'VALIDATION_ERROR', '请选择有效日期');
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    (0, errors_1.assertDomain)(parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day, 'VALIDATION_ERROR', '请选择有效日期');
    // 食记的“今天”以中国家庭所在的业务时区为准，避免北京时间凌晨被 UTC 误判为未来。
    const todayParts = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type) => todayParts.find((item) => item.type === type)?.value || '';
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    (0, errors_1.assertDomain)(date <= today, 'VALIDATION_ERROR', '不能记录未来的日期');
    return date;
}
function acceptance(value) {
    const next = String(value);
    (0, errors_1.assertDomain)(ACCEPTANCE_VALUES.includes(next), 'VALIDATION_ERROR', '请选择宝宝的接受程度');
    return next;
}
/** 有调整时才允许保存简短说明；按原食谱时强制清空，保持数据语义干净。 */
function adjustment(payload) {
    const followedOriginal = payload.followedOriginal !== false;
    if (followedOriginal)
        return { followedOriginal: true, adjustmentNote: '' };
    const adjustmentNote = (0, validation_1.requiredText)(payload.adjustmentNote, '调整说明', 120);
    return { followedOriginal: false, adjustmentNote };
}
async function activeRecipe(familyId, recipeId) {
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
async function listRecipeAttempts(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = typeof payload.recipeId === 'string' ? payload.recipeId.trim() : '';
    if (recipeId)
        await activeRecipe(member.familyId, recipeId);
    const filter = recipeId ? { familyId: member.familyId, recipeId } : { familyId: member.familyId };
    const result = await cloud_1.db.collection(COLLECTION).where(filter).limit(MAX_ATTEMPTS).get();
    const attempts = [...result.data]
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
        .map(attemptView);
    return { attempts };
}
/** 单条读取只校验家庭归属，已归档食谱的历史记录仍可回看。 */
async function getRecipeAttempt(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const attemptId = (0, validation_1.requiredText)(payload.attemptId, '记录', 80);
    const result = await cloud_1.db.collection(COLLECTION).doc(attemptId).get();
    const attempt = result.data;
    (0, errors_1.assertDomain)(attempt && attempt.familyId === member.familyId, 'FORBIDDEN', '无权查看这条记录');
    return attemptView(attempt);
}
async function createRecipeAttempt(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const recipeId = (0, validation_1.requiredText)(payload.recipeId, '食谱', 80);
    const recipe = await activeRecipe(member.familyId, recipeId);
    const change = adjustment(payload);
    const now = new Date().toISOString();
    const attempt = {
        _id: id(),
        familyId: member.familyId,
        recipeId,
        recipeName: (0, validation_1.requiredText)(recipe.name, '食谱名称', 80),
        recipeVersion: Math.max(1, Number(recipe.version) || 1),
        occurredOn: occurredOn(payload.occurredOn),
        acceptance: acceptance(payload.acceptance),
        ...change,
        authorMemberId: member._id,
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
    await cloud_1.db.collection(COLLECTION).doc(attempt._id).set({ data: writableAttempt(attempt) });
    return attemptView(attempt);
}
async function updateRecipeAttempt(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const attemptId = (0, validation_1.requiredText)(payload.attemptId, '记录', 80);
    const expectedVersion = Number(payload.expectedVersion);
    const change = adjustment(payload);
    let next;
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection(COLLECTION).doc(attemptId).get();
        const current = result.data;
        (0, errors_1.assertDomain)(current.familyId === member.familyId, 'FORBIDDEN', '无权修改这条记录');
        (0, errors_1.assertDomain)(current.authorMemberId === member._id, 'FORBIDDEN', '只能编辑自己的记录');
        (0, errors_1.assertDomain)(current.version === expectedVersion, 'VERSION_CONFLICT', '这条记录已被更新，请重新载入');
        const version = expectedVersion + 1;
        next = {
            ...current,
            occurredOn: occurredOn(payload.occurredOn),
            acceptance: acceptance(payload.acceptance),
            ...change,
            updatedAt: new Date().toISOString(),
            version,
        };
        await transaction.collection(COLLECTION).doc(attemptId).update({
            data: {
                occurredOn: next.occurredOn,
                acceptance: next.acceptance,
                followedOriginal: next.followedOriginal,
                adjustmentNote: next.adjustmentNote,
                updatedAt: next.updatedAt,
                version,
            },
        });
    });
    (0, errors_1.assertDomain)(next, 'SERVICE_UNAVAILABLE', '记录保存失败');
    return attemptView(next);
}
async function deleteRecipeAttempt(userId, payload) {
    await ensureCollection();
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const attemptId = (0, validation_1.requiredText)(payload.attemptId, '记录', 80);
    const result = await cloud_1.db.collection(COLLECTION).doc(attemptId).get();
    const attempt = result.data;
    (0, errors_1.assertDomain)(attempt.familyId === member.familyId, 'FORBIDDEN', '无权删除这条记录');
    (0, errors_1.assertDomain)(attempt.authorMemberId === member._id || member.role === 'admin', 'FORBIDDEN', '只能删除自己的记录');
    await cloud_1.db.collection(COLLECTION).doc(attemptId).remove();
    return { deletedAttemptId: attemptId };
}
