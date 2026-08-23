"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentUserId = currentUserId;
exports.ensureUser = ensureUser;
exports.getActiveContext = getActiveContext;
exports.requireAdmin = requireAdmin;
const crypto_1 = __importDefault(require("crypto"));
const cloud_1 = __importStar(require("./cloud"));
const errors_1 = require("./errors");
/** OpenID 只在云函数内出现；稳定摘要作为内部用户 ID，数据库不保存 OpenID 明文。 */
function currentUserId() {
    const { OPENID } = cloud_1.default.getWXContext();
    if (!OPENID)
        throw new errors_1.DomainError('SERVICE_UNAVAILABLE', '暂时无法识别微信身份，请稍后重试');
    // 120 位摘要已远超首版碰撞需求，同时把自定义文档 ID 控制在 32 字符内。
    const digest = crypto_1.default.createHash('sha256').update(`awu-kitchen:${OPENID}`).digest('hex').slice(0, 30);
    return `u-${digest}`;
}
async function ensureUser(userId) {
    const now = new Date().toISOString();
    const result = await cloud_1.nullableDb.collection('users').doc(userId).get();
    const user = result.data;
    if (user) {
        await cloud_1.nullableDb.collection('users').doc(userId).update({ data: { lastSeenAt: now } });
        return { ...user, lastSeenAt: now };
    }
    const created = { _id: userId, activeMemberId: null, createdAt: now, lastSeenAt: now };
    // doc(userId) 已经决定了 _id；CloudBase 禁止在 set 的 data 中再次写入 _id。
    await cloud_1.nullableDb.collection('users').doc(userId).set({
        data: { activeMemberId: null, createdAt: now, lastSeenAt: now },
    });
    return created;
}
async function getActiveContext(userId) {
    const user = await ensureUser(userId);
    if (!user.activeMemberId)
        throw new errors_1.DomainError('NO_MEMBERSHIP', '你还没有加入家庭');
    const result = await cloud_1.nullableDb.collection('family_members').doc(user.activeMemberId).get();
    const member = result.data;
    if (!member || member.status !== 'active') {
        throw new errors_1.DomainError('MEMBERSHIP_REMOVED', '家庭成员资格已失效');
    }
    return { user, member };
}
function requireAdmin(member) {
    if (member.role !== 'admin')
        throw new errors_1.DomainError('FORBIDDEN', '只有家庭管理员可以进行此操作');
}
