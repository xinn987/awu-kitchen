"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecipeOptions = listRecipeOptions;
exports.addRecipeOption = addRecipeOption;
exports.removeRecipeOption = removeRecipeOption;
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const recipe_option_model_1 = require("./recipe-option-model");
const MAX_OPTIONS_PER_KIND = 20;
function optionKind(value) {
    (0, errors_1.assertDomain)(value === 'foodType' || value === 'stage', 'VALIDATION_ERROR', '食谱选项类型无效');
    return value;
}
function optionName(value) {
    (0, errors_1.assertDomain)(typeof value === 'string', 'VALIDATION_ERROR', '请填写选项名称');
    const name = value.trim();
    (0, errors_1.assertDomain)(name.length > 0, 'VALIDATION_ERROR', '请填写选项名称');
    (0, errors_1.assertDomain)(name.length <= 20, 'VALIDATION_ERROR', '选项名称最多 20 个字');
    return name;
}
function withNames(options, kind, nextNames) {
    return {
        ...options,
        ...(kind === 'foodType' ? { foodTypes: nextNames } : { stages: nextNames }),
        version: options.version + 1,
    };
}
async function familyOptions(familyId) {
    const result = await cloud_1.db.collection('families').doc(familyId).get();
    return { familyName: String(result.data.name || ''), options: (0, recipe_option_model_1.optionsFromFamily)(result.data) };
}
/**
 * 查询更新会清除所有匹配文档；循环用于兼容云数据库单次批量更新上限。
 * 只递增并发版本，不改变修改人、更新时间或修订记录。
 */
async function clearRecipeReferences(familyId, kind, name) {
    const field = (0, recipe_option_model_1.optionField)(kind);
    let total = 0;
    for (let round = 0; round < 100; round += 1) {
        const result = await cloud_1.db.collection('recipes').where({ familyId, [field]: name }).update({
            data: {
                [field]: cloud_1.db.command.remove(),
                version: cloud_1.db.command.inc(1),
            },
        });
        const updated = Math.max(0, Number(result.stats && result.stats.updated) || 0);
        total += updated;
        if (updated === 0)
            return total;
    }
    throw new errors_1.DomainError('SERVICE_UNAVAILABLE', '相关食谱仍在清理，请稍后重试');
}
async function listRecipeOptions(userId) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const [{ familyName, options }, recipeRaw] = await Promise.all([
        familyOptions(member.familyId),
        cloud_1.db.collection('recipes').where({ familyId: member.familyId })
            .field({ type: true, stage: true, archivedAt: true }).limit(1000).get(),
    ]);
    const recipes = recipeRaw.data.filter((recipe) => !recipe.archivedAt);
    const usage = (names, field) => names.map((name) => ({
        name,
        usageCount: recipes.filter((recipe) => recipe[field] === name).length,
    }));
    return {
        familyName,
        version: options.version,
        foodTypes: usage(options.foodTypes, 'type'),
        stages: usage(options.stages, 'stage'),
    };
}
async function addRecipeOption(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const kind = optionKind(payload.kind);
    const name = optionName(payload.name);
    const expectedVersion = Number(payload.expectedVersion);
    // 删除动作若曾在网络中断后留下旧引用，重新添加同名项前先确保不会让旧食谱复活。
    const before = (await familyOptions(member.familyId)).options;
    (0, errors_1.assertDomain)(before.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入');
    (0, errors_1.assertDomain)(!(0, recipe_option_model_1.namesForKind)(before, kind).includes(name), 'VALIDATION_ERROR', '这个选项已经存在');
    await clearRecipeReferences(member.familyId, kind, name);
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('families').doc(member.familyId).get();
        const family = result.data;
        const current = (0, recipe_option_model_1.normalizeRecipeOptions)(family.recipeOptions);
        (0, errors_1.assertDomain)(current.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入');
        const currentNames = (0, recipe_option_model_1.namesForKind)(current, kind);
        (0, errors_1.assertDomain)(!currentNames.includes(name), 'VALIDATION_ERROR', '这个选项已经存在');
        (0, errors_1.assertDomain)(currentNames.length < MAX_OPTIONS_PER_KIND, 'VALIDATION_ERROR', '每类最多保留 20 个选项');
        await transaction.collection('families').doc(member.familyId).update({
            data: { recipeOptions: withNames(current, kind, [...currentNames, name]) },
        });
    });
    return listRecipeOptions(userId);
}
async function removeRecipeOption(userId, payload) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    const kind = optionKind(payload.kind);
    const name = optionName(payload.name);
    const expectedVersion = Number(payload.expectedVersion);
    // 先从可选项移除；后续任何新建、编辑或历史恢复都会立即拒绝这个值。
    await cloud_1.db.runTransaction(async (transaction) => {
        const result = await transaction.collection('families').doc(member.familyId).get();
        const family = result.data;
        const current = (0, recipe_option_model_1.normalizeRecipeOptions)(family.recipeOptions);
        (0, errors_1.assertDomain)(current.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入');
        const currentNames = (0, recipe_option_model_1.namesForKind)(current, kind);
        (0, errors_1.assertDomain)(currentNames.includes(name), 'VALIDATION_ERROR', '这个选项已经被删除');
        await transaction.collection('families').doc(member.familyId).update({
            data: { recipeOptions: withNames(current, kind, currentNames.filter((item) => item !== name)) },
        });
    });
    const affectedCount = await clearRecipeReferences(member.familyId, kind, name);
    return { ...(await listRecipeOptions(userId)), affectedCount };
}
