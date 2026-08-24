# 阿呜厨房微信云开发后端设计（简化首版）

## 1. 设计结论

首版使用微信云开发 CloudBase：普通云函数、文档型数据库，以及后续需要照片时再启用的传统模式云存储。不使用云托管、SQL 数据库或自建服务器。

```text
微信小程序
    ↓ wx.cloud.callFunction
一个 api 云函数
    ↓
CloudBase 文档型数据库
```

首版追求的是尽快跑通两个真实微信账号共同维护家庭食谱，而不是预先建设完整的平台能力。

## 2. 简化不等于省略的边界

以下能力首版必须正确，否则以后会重写数据：

1. 云函数从微信上下文识别用户，客户端不能指定当前用户。
2. 家庭是数据隔离边界，每次读写都校验当前用户是否为有效成员。
3. 一个微信用户首版只能有一个有效家庭。
4. 食谱属于家庭，作者只是成员归因。
5. 管理员才能邀请和移出成员；被移出后立即不能访问家庭数据。
6. 正式环境不写入 Demo 数据，云端失败不回退到本地假数据。

以下工程能力先不做：

- 通用幂等回执系统。
- 独立修订集合和历史分页。
- 服务端全文搜索、列表分页和持久化客户端缓存。
- 复杂限频、完整自动化集成测试和监控平台。
- 照片、多家庭、多管理员、管理员交接和离线编辑。

## 3. 最小数据模型

### 3.1 `users`

用于把微信身份绑定到当前成员资格。

| 字段 | 说明 |
| --- | --- |
| `_id` | OpenID 在云函数内生成的稳定摘要；不保存 OpenID 明文 |
| `activeMemberId` | 当前有效成员资格；没有家庭时为空 |
| `createdAt`、`lastSeenAt` | 服务端时间 |

### 3.2 `families`

| 字段 | 说明 |
| --- | --- |
| `_id` | 家庭 ID |
| `name` | 家庭名称 |
| `adminMemberId` | 当前管理员成员 ID |
| `createdAt`、`updatedAt` | 服务端时间 |

### 3.3 `family_members`

成员记录不能放在家庭的数组中，否则成员移出和历史归因会互相影响。

| 字段 | 说明 |
| --- | --- |
| `_id` | 成员 ID，食谱作者引用此 ID |
| `familyId`、`userId` | 家庭与微信用户关系 |
| `displayName` | 家庭称谓 |
| `role` | `admin` / `member` |
| `status` | `active` / `removed` |
| `joinedAt`、`removedAt` | 服务端时间 |

移出成员只把状态改为 `removed`，不删除记录，保证旧食谱仍能显示贡献者称谓。

### 3.4 `family_invites`

| 字段 | 说明 |
| --- | --- |
| `_id` | 邀请 ID |
| `familyId` | 目标家庭 |
| `tokenHash` | 分享令牌摘要 |
| `createdByMemberId` | 创建邀请的管理员 |
| `status` | `active` / `used` / `expired` |
| `expiresAt`、`usedAt` | 有效期和使用时间 |

邀请使用同一个高熵随机令牌，单次使用、24 小时有效。体验版阶段由管理员复制邀请码并通过微信文字发送，接收者进入体验版后粘贴加入；正式发布后继续兼容携带令牌的小程序分享卡片。不提供可猜测的家庭 ID 或永久链接。

### 3.5 `recipes`

| 字段组 | 字段 |
| --- | --- |
| 归属 | `_id`、`familyId` |
| 内容 | `name`、`successKeys`、`ingredients`、`steps`、`stage`、`type`、`tags` |
| 状态 | `state: pending / formal` |
| 归因 | `createdById`、`updatedById`，均为成员 ID |
| 时间 | `createdAt`、`updatedAt` |
| 并发 | `version` |
| 历史 | `revisions[]`，完整内容快照数组 |

首版沿用当前代码的嵌入式修订数组，减少集合和事务复杂度。家庭食谱数量和修订次数都较小时足够；只有接近单文档容量或历史明显变慢时，才拆为独立修订集合。

## 4. 最小云函数接口

首版只部署一个 `api` 云函数，用 `action` 区分业务操作，内部按 session、family、recipe 三个模块组织。

| 模块 | action |
| --- | --- |
| 会话 | `session.bootstrap` |
| 家庭 | `family.create`、`family.createInvite`、`family.previewInvite`、`family.join`、`family.listMembers`、`family.removeMember` |
| 食谱 | `recipe.list`、`recipe.create`、`recipe.update`、`recipe.duplicate`、`recipe.restoreRevision` |

所有接口统一返回：

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }
```

首版保留少量稳定错误码：

- `NO_MEMBERSHIP`
- `MEMBERSHIP_REMOVED`
- `FORBIDDEN`
- `INVITE_INVALID`
- `INVITE_EXPIRED`
- `INVITE_USED`
- `ALREADY_IN_FAMILY`
- `DISPLAY_NAME_TAKEN`
- `VERSION_CONFLICT`
- `VALIDATION_ERROR`
- `SERVICE_UNAVAILABLE`

## 5. 核心流程

### 5.1 启动

1. 小程序初始化 CloudBase。
2. 调用 `session.bootstrap`。
3. 云函数从上下文取得 OpenID，幂等创建 `users`。
4. 没有有效成员资格时进入 onboarding；有资格时返回家庭和当前成员。

不要求授权微信头像、昵称或手机号。家庭称谓由用户自己填写。

### 5.2 创建家庭

在一个事务中创建家庭、管理员成员记录，并写入用户的 `activeMemberId`。提交前再次确认用户没有有效家庭，防止重复创建。

### 5.3 传递邀请

1. 管理员调用 `family.createInvite`，云函数生成高熵随机令牌，只保存摘要。
2. 体验版阶段复制令牌并通过微信文字发送；接收者先进入体验版，再在 onboarding 粘贴令牌。
3. 正式发布后可继续分享 `/pages/onboarding/index?invite=<token>`，接收者打开后可预览家庭名称。
4. 接收者填写家庭称谓并确认，云函数在事务中消费邀请、创建成员并写入用户的 `activeMemberId`。

重复使用已消费或过期的邀请码只显示明确错误，不建立成员关系。

### 5.4 移出成员

云函数确认操作者是管理员且目标不是自己，然后把目标成员改为 `removed`，并清空目标用户的 `activeMemberId`。目标用户下一次请求即被拒绝。

### 5.5 食谱读写

每次请求都先通过当前 OpenID 解析有效成员，再从成员取得 `familyId`。客户端不提交或决定家庭、作者、角色和服务端时间。

首版单次最多加载当前家庭的 1000 份食谱，在小程序内完成搜索和类型筛选。家庭数据接近此规模前就应增加分页和服务端搜索。

修改食谱时提交 `expectedVersion`。版本不一致返回 `VERSION_CONFLICT`；首版提示重新载入，不做自动合并。保存与恢复都把完整快照追加进当前食谱的 `revisions[]`。

## 6. 前端迁移

`recipe-store.ts` 保留原函数名作为异步云端仓库，以缩小页面改造范围。页面统一使用 `Promise` 接口，并处理：

- 首次加载。
- 真实空状态。
- 保存中禁止重复点击。
- 请求失败后保留输入并允许重试。
- 被移出后的会话失效。
- 版本冲突提示。

首版不做持久化本地缓存。云端请求失败就显示错误，避免用户误以为本地内容已经同步。

## 7. 最小安全规则

1. 核心集合禁止小程序端直接写入，全部写操作走云函数。
2. 云函数不相信客户端传入的用户、家庭、角色、作者、状态和时间。
3. 查询食谱和成员时始终带服务端解析出的 `familyId`。
4. 邀请数据库只保存令牌摘要，日志不记录令牌和 OpenID 明文。
5. 正式环境不包含种子家庭和演示食谱。

## 8. 后续出现信号再增强

| 信号 | 再增加的能力 |
| --- | --- |
| 修订数组接近文档容量或历史变慢 | 拆分 `recipe_revisions` 集合并分页 |
| 家庭食谱明显增多、全量加载变慢 | 列表分页和服务端搜索 |
| 出现重复写入 | 通用 `requestId` 幂等回执 |
| 邀请被滥用 | 更严格的限频、撤销和审计 |
| 用户明确需要照片 | 启用云存储并设计家庭文件权限 |
| 需要同时加入多个家庭 | 重做家庭切换和有效成员资格规则 |
