"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredText = requiredText;
exports.normalizeDisplayName = normalizeDisplayName;
exports.normalizeRecipeContent = normalizeRecipeContent;
const crypto_1 = __importDefault(require("crypto"));
const errors_1 = require("./errors");
function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function textList(value, maxItems, maxLength) {
    return Array.isArray(value)
        ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter(Boolean)
        : [];
}
function stepId() {
    return `step-${crypto_1.default.randomBytes(12).toString('hex')}`;
}
/** 图片必须来自当前家庭自己的媒体目录，不能借客户端传入跨家庭文件。 */
function normalizeRecipeImage(value, familyId) {
    if (value === undefined || value === null)
        return undefined;
    const raw = value;
    const fileId = text(raw.fileId, 500);
    const width = Math.round(Number(raw.width));
    const height = Math.round(Number(raw.height));
    const familyMarker = `/recipe-media/${familyId}/`;
    if (!fileId.startsWith('cloud://') || !fileId.includes(familyMarker)) {
        throw new errors_1.DomainError('VALIDATION_ERROR', '图片不属于当前家庭');
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
        || width > 10000 || height > 10000) {
        throw new errors_1.DomainError('VALIDATION_ERROR', '图片尺寸无效');
    }
    return { fileId, width, height };
}
function normalizeSteps(value, familyId) {
    if (!Array.isArray(value))
        return [];
    const usedIds = new Set();
    return value.slice(0, 30).map((item) => {
        if (typeof item === 'string') {
            return { id: stepId(), text: text(item, 1000) };
        }
        const raw = (item || {});
        let id = text(raw.id, 80);
        if (!id || usedIds.has(id))
            id = stepId();
        usedIds.add(id);
        const image = normalizeRecipeImage(raw.image, familyId);
        return image
            ? { id, text: text(raw.text, 1000), image }
            : { id, text: text(raw.text, 1000) };
    }).filter((step) => step.text.length > 0);
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
function normalizeRecipeContent(value, familyId, recipeOptions) {
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
    const mainImage = normalizeRecipeImage(raw.mainImage, familyId);
    return {
        name: requiredText(raw.name, '食谱名称'),
        successKeys: textList(raw.successKeys, 10, 500),
        mainImage,
        ingredients,
        steps: normalizeSteps(raw.steps, familyId),
        type: recipeOptions.foodTypes.includes(type) ? type : undefined,
        stage: recipeOptions.stages.includes(stage) ? stage : undefined,
        tags: textList(raw.tags, 3, 20),
    };
}
