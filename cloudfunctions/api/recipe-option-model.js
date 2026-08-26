"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STAGES = exports.DEFAULT_FOOD_TYPES = void 0;
exports.normalizeRecipeOptions = normalizeRecipeOptions;
exports.defaultRecipeOptions = defaultRecipeOptions;
exports.optionsFromFamily = optionsFromFamily;
exports.namesForKind = namesForKind;
exports.optionField = optionField;
exports.DEFAULT_FOOD_TYPES = ['粥类', '面食', '蛋羹', '泥糊', '汤羹', '小饼'];
exports.DEFAULT_STAGES = ['细腻泥糊', '带小颗粒', '软烂块状', '手指食物'];
function names(value, fallback) {
    if (!Array.isArray(value))
        return [...fallback];
    const unique = new Set();
    value.forEach((item) => {
        if (typeof item !== 'string')
            return;
        const name = item.trim().slice(0, 20);
        if (name)
            unique.add(name);
    });
    return [...unique];
}
/** 老家庭没有配置时使用初始选项；空数组则表示家庭主动删除了全部选项。 */
function normalizeRecipeOptions(value) {
    const raw = (value || {});
    const version = Number(raw.version);
    return {
        foodTypes: names(raw.foodTypes, exports.DEFAULT_FOOD_TYPES),
        stages: names(raw.stages, exports.DEFAULT_STAGES),
        version: Number.isInteger(version) && version > 0 ? version : 1,
    };
}
function defaultRecipeOptions() {
    return normalizeRecipeOptions(undefined);
}
function optionsFromFamily(family) {
    return normalizeRecipeOptions(family.recipeOptions);
}
function namesForKind(options, kind) {
    return kind === 'foodType' ? options.foodTypes : options.stages;
}
function optionField(kind) {
    return kind === 'foodType' ? 'type' : 'stage';
}
