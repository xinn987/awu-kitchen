"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredText = requiredText;
exports.normalizeDisplayName = normalizeDisplayName;
exports.normalizeRecipeContent = normalizeRecipeContent;
const errors_1 = require("./errors");
const FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼'];
const STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物'];
function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function textList(value, maxItems, maxLength) {
    return Array.isArray(value)
        ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean)
        : [];
}
function requiredText(value, label, max = 80) {
    const result = text(value, max);
    if (!result)
        throw new errors_1.DomainError('VALIDATION_ERROR', `请填写${label}`);
    return result;
}
function normalizeDisplayName(value) {
    return requiredText(value, '家庭称谓', 20);
}
/** 云端重新清洗食谱内容，不能直接信任客户端已经做过的校验。 */
function normalizeRecipeContent(value) {
    const raw = (value || {});
    const ingredients = Array.isArray(raw.ingredients)
        ? raw.ingredients.slice(0, 30).map((item) => {
            const ingredient = (item || {});
            const name = text(ingredient.name, 50);
            const amount = text(ingredient.amount, 50);
            return amount ? { name, amount } : { name };
        }).filter((item) => item.name)
        : [];
    const type = text(raw.type, 20);
    const stage = text(raw.stage, 20);
    return {
        name: requiredText(raw.name, '食谱名称'),
        successKeys: textList(raw.successKeys, 10, 500),
        ingredients,
        steps: textList(raw.steps, 30, 1000),
        type: FOOD_TYPES.includes(type) ? type : undefined,
        stage: STAGES.includes(stage) ? stage : undefined,
        tags: textList(raw.tags, 3, 20),
    };
}
