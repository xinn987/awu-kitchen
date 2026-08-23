"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nullableDb = exports.db = void 0;
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
// 必须在任何模块创建数据库实例前完成初始化，避免 CommonJS import 提升造成冷启动失败。
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
exports.db = wx_server_sdk_1.default.database();
// 身份模块需要区分“文档不存在”和真实服务异常，防止误清空成员关系。
exports.nullableDb = wx_server_sdk_1.default.database({ throwOnNotFound: false });
exports.default = wx_server_sdk_1.default;
