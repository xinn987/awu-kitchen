"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
exports.createFamily = createFamily;
exports.createInvite = createInvite;
exports.previewInvite = previewInvite;
exports.joinFamily = joinFamily;
exports.listMembers = listMembers;
exports.removeMember = removeMember;
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("./auth");
const cloud_1 = require("./cloud");
const errors_1 = require("./errors");
const validation_1 = require("./validation");
const MEMBER_COLORS = ['#BF5924', '#4A7C8A', '#6B8A4A', '#8A6A4A', '#6A5A8A'];
const INVITE_TTL = 24 * 60 * 60 * 1000;
function id(prefix) {
    return `${prefix}${crypto_1.default.randomBytes(12).toString('hex')}`;
}
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function viewMember(member) {
    return {
        id: member._id,
        name: member.displayName,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        color: member.color,
    };
}
async function bootstrap(userId) {
    const user = await (0, auth_1.ensureUser)(userId);
    if (!user.activeMemberId)
        return { status: 'onboarding' };
    try {
        const { member } = await (0, auth_1.getActiveContext)(userId, user);
        const familyResult = await cloud_1.db.collection('families').doc(member.familyId).get();
        const family = familyResult.data;
        return {
            status: 'ready',
            family: { id: family._id, name: family.name },
            member: viewMember(member),
        };
    }
    catch (error) {
        if (error instanceof errors_1.DomainError && error.code === 'MEMBERSHIP_REMOVED') {
            await cloud_1.db.collection('users').doc(userId).update({ data: { activeMemberId: null } });
            return { status: 'removed' };
        }
        throw error;
    }
}
async function createFamily(userId, payload) {
    const familyName = (0, validation_1.requiredText)(payload.familyName, '家庭名称', 40);
    const displayName = (0, validation_1.normalizeDisplayName)(payload.displayName);
    const familyId = id('f-');
    const memberId = id('m-');
    const now = new Date().toISOString();
    // 正常客户端会先 bootstrap；这里仍确保直接调用创建接口时用户文档存在。
    await (0, auth_1.ensureUser)(userId);
    await cloud_1.db.runTransaction(async (transaction) => {
        const userResult = await transaction.collection('users').doc(userId).get();
        const user = userResult.data;
        (0, errors_1.assertDomain)(!user.activeMemberId, 'ALREADY_IN_FAMILY', '你已经加入了一个家庭');
        await transaction.collection('families').doc(familyId).set({
            data: { name: familyName, adminMemberId: memberId, createdAt: now, updatedAt: now },
        });
        await transaction.collection('family_members').doc(memberId).set({
            data: {
                familyId, userId, displayName, role: 'admin', status: 'active',
                color: MEMBER_COLORS[0], joinedAt: now,
            },
        });
        await transaction.collection('users').doc(userId).update({ data: { activeMemberId: memberId, lastSeenAt: now } });
    });
    return bootstrap(userId);
}
async function createInvite(userId) {
    const { member } = await (0, auth_1.getActiveContext)(userId);
    (0, auth_1.requireAdmin)(member);
    const token = crypto_1.default.randomBytes(32).toString('base64url');
    const inviteId = id('inv-');
    const now = Date.now();
    await cloud_1.db.collection('family_invites').doc(inviteId).set({
        data: {
            familyId: member.familyId,
            tokenHash: hashToken(token),
            createdByMemberId: member._id,
            status: 'active',
            createdAt: new Date(now).toISOString(),
            expiresAt: now + INVITE_TTL,
        },
    });
    return { token, expiresAt: now + INVITE_TTL };
}
async function findInvite(token) {
    const value = (0, validation_1.requiredText)(token, '邀请链接', 200);
    const result = await cloud_1.db.collection('family_invites')
        .where({ tokenHash: hashToken(value) }).limit(1).get();
    const invite = result.data[0];
    if (!invite)
        throw new errors_1.DomainError('INVITE_INVALID', '邀请链接无效');
    if (invite.status === 'used')
        throw new errors_1.DomainError('INVITE_USED', '这个邀请已经被使用');
    if (invite.status !== 'active' || Number(invite.expiresAt) <= Date.now()) {
        throw new errors_1.DomainError('INVITE_EXPIRED', '这个邀请已经过期');
    }
    return invite;
}
async function previewInvite(token) {
    const invite = await findInvite(token);
    const familyResult = await cloud_1.db.collection('families').doc(String(invite.familyId)).get();
    const family = familyResult.data;
    return { familyName: family.name, expiresAt: Number(invite.expiresAt) };
}
async function joinFamily(userId, payload) {
    const token = (0, validation_1.requiredText)(payload.token, '邀请链接', 200);
    const displayName = (0, validation_1.normalizeDisplayName)(payload.displayName);
    const invite = await findInvite(token);
    const inviteId = String(invite._id);
    const familyId = String(invite.familyId);
    const memberId = id('m-');
    const now = new Date().toISOString();
    // 保证没有走过 bootstrap 的受邀用户也能正常加入。
    await (0, auth_1.ensureUser)(userId);
    await cloud_1.db.runTransaction(async (transaction) => {
        const userResult = await transaction.collection('users').doc(userId).get();
        const user = userResult.data;
        (0, errors_1.assertDomain)(!user.activeMemberId, 'ALREADY_IN_FAMILY', '你已经加入了一个家庭');
        const inviteResult = await transaction.collection('family_invites').doc(inviteId).get();
        const currentInvite = inviteResult.data;
        (0, errors_1.assertDomain)(currentInvite.status === 'active', 'INVITE_USED', '这个邀请已经被使用');
        (0, errors_1.assertDomain)(currentInvite.expiresAt > Date.now(), 'INVITE_EXPIRED', '这个邀请已经过期');
        const sameName = await transaction.collection('family_members')
            .where({ familyId, displayName, status: 'active' }).limit(1).get();
        (0, errors_1.assertDomain)(sameName.data.length === 0, 'DISPLAY_NAME_TAKEN', '这个家庭称谓已经有人使用');
        // 颜色只用于展示，直接从随机成员 ID 稳定派生，避免为此增加一次计数查询。
        const colorIndex = Number.parseInt(memberId.slice(-2), 16) % MEMBER_COLORS.length;
        await transaction.collection('family_members').doc(memberId).set({
            data: {
                familyId, userId, displayName, role: 'member', status: 'active',
                color: MEMBER_COLORS[colorIndex], joinedAt: now,
            },
        });
        await transaction.collection('family_invites').doc(inviteId).update({
            data: { status: 'used', usedByUserId: userId, usedAt: now },
        });
        await transaction.collection('users').doc(userId).update({ data: { activeMemberId: memberId, lastSeenAt: now } });
    });
    return bootstrap(userId);
}
async function listMembers(userId) {
    const { member: current } = await (0, auth_1.getActiveContext)(userId);
    const [familyRaw, memberRaw, recipeRaw] = await Promise.all([
        cloud_1.db.collection('families').doc(current.familyId).get(),
        cloud_1.db.collection('family_members').where({ familyId: current.familyId, status: 'active' }).limit(100).get(),
        // 成员贡献只需要归因字段，不把食谱正文和完整修订历史带进成员页。
        cloud_1.db.collection('recipes').where({ familyId: current.familyId })
            .field({ createdById: true, updatedById: true, archivedAt: true }).limit(100).get(),
    ]);
    const familyResult = familyRaw;
    const memberResult = memberRaw;
    const recipeResult = recipeRaw;
    const family = familyResult.data;
    const recipes = recipeResult.data.filter((recipe) => !recipe.archivedAt);
    const members = memberResult.data.map((item) => ({
        ...viewMember(item),
        contributionCount: recipes.filter((recipe) => recipe.createdById === item._id || recipe.updatedById === item._id).length,
    }));
    return {
        family: { id: family._id, name: family.name },
        currentMemberId: current._id,
        members,
    };
}
async function removeMember(userId, payload) {
    const { member: current } = await (0, auth_1.getActiveContext)(userId);
    (0, auth_1.requireAdmin)(current);
    const targetId = (0, validation_1.requiredText)(payload.memberId, '成员', 80);
    (0, errors_1.assertDomain)(targetId !== current._id, 'FORBIDDEN', '管理员不能移出自己');
    const now = new Date().toISOString();
    await cloud_1.db.runTransaction(async (transaction) => {
        const targetResult = await transaction.collection('family_members').doc(targetId).get();
        const target = targetResult.data;
        (0, errors_1.assertDomain)(target.familyId === current.familyId && target.status === 'active', 'VALIDATION_ERROR', '成员不存在');
        (0, errors_1.assertDomain)(target.role !== 'admin', 'FORBIDDEN', '不能移出家庭管理员');
        await transaction.collection('family_members').doc(targetId).update({ data: { status: 'removed', removedAt: now } });
        await transaction.collection('users').doc(target.userId).update({ data: { activeMemberId: null } });
    });
    return { removedMemberId: targetId };
}
