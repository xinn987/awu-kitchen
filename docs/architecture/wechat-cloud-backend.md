# 阿呜厨房微信云开发后端设计（简化首版）

## 1. 设计结论

首版使用微信云开发 CloudBase：普通云函数、文档型数据库和传统模式云存储。不使用云托管、SQL 数据库或自建服务器。食谱图片的完整交互与一致性规则见 [食谱图片首版设计](../design/recipe-images.md)，AI 图片导入的异步任务与模型适配规则见 [AI 食谱图片导入](../development/recipe-import-ai.md)。

```text
微信小程序
    ├─ wx.cloud.callFunction → api 云函数           → CloudBase 文档型数据库
    ├─ wx.cloud.callFunction → recipe-import 云函数 → 异步多模态模型 API
    └─ wx.cloud.uploadFile   → CloudBase 云存储
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
- 多家庭、多管理员、管理员交接和离线编辑。

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
| `recipeOptions` | 家庭共用的辅食类型、适用阶段及配置版本 |
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
| 内容 | `name`、`successKeys`、`mainImage`、`ingredients`、`steps`、`stage`、`type`、`tags` |
| 状态 | `state: pending / formal`、`archivedAt`、`archivedById` |
| 归因 | `createdById`、`updatedById`，均为成员 ID |
| 时间 | `createdAt`、`updatedAt` |
| 并发 | `version` |
| 历史 | `revisions[]`，完整内容快照数组 |

首版沿用当前代码的嵌入式修订数组，减少集合和事务复杂度。家庭食谱数量和修订次数都较小时足够；只有接近单文档容量或历史明显变慢时，才拆为独立修订集合。

步骤是带稳定 ID 的有序内容对象，文字必填，可选一张步骤图。主图和步骤图只保存云文件引用；图片本体不进入数据库或云函数请求体。旧字符串步骤在读取时兼容，并在下一次确认保存时升级。

### 3.6 `recipe_comments`

评论独立于食谱正文和修订记录存储：

| 字段 | 说明 |
| --- | --- |
| `_id` | 评论 ID |
| `familyId`、`recipeId` | 家庭隔离与目标食谱 |
| `authorMemberId` | 发布成员 ID |
| `content` | 1–500 字纯文字 |
| `createdAt`、`updatedAt` | 创建与最后编辑时间 |
| `version` | 评论自身的乐观并发版本 |

`recipes` 只增加轻量 `commentCount`，供详情入口显示数量。评论写入不会修改食谱 `version`、`updatedAt` 或修订数组。

### 3.7 `recipe_attempts`

食记记录独立于食谱正文保存，避免实际制作历史持续放大食谱文档：

| 字段组 | 字段 |
| --- | --- |
| 归属 | `_id`、`familyId`、`recipeId` |
| 食谱快照 | `recipeName`、`recipeVersion` |
| 本次反馈 | `occurredOn`、`acceptance`、`followedOriginal`、`adjustmentNote` |
| 归因与并发 | `authorMemberId`、`createdAt`、`updatedAt`、`version` |

记录不复制食材和步骤，也不修改食谱版本或修订历史。详细产品边界见 [食记首版设计](../design/recipe-journal.md)。

### 3.8 `recipe_import_jobs`

异步识别任务独立于共享食谱存储，只允许云函数访问，并按提交用户隔离：

| 字段组 | 字段 |
| --- | --- |
| 归属 | `_id`、`userId`、`familyId` |
| 模型任务 | `providerTaskId`、`status: processing / ready / failed / completed` |
| 临时媒体 | `fileIds`、`coverFileId` |
| 识别上下文 | `options`、`draft`、`message` |
| 生命周期 | `createdAt`、`updatedAt`、`expiresAt` |

模型任务 ID、临时图片引用和识别草稿都不进入家庭共享食谱。只有提交者进入编辑页核对并主动保存后，`recipe.create` 才创建正式食谱。

## 4. 最小云函数接口

首版部署业务 `api` 和模型适配 `recipe-import` 两个云函数。`api` 用 `action` 区分家庭共享业务；`recipe-import` 单独保存异步任务和服务端模型凭证，避免 AI 超时、密钥与临时数据进入主业务函数。

| 模块 | action |
| --- | --- |
| 会话 | `session.bootstrap` |
| 家庭 | `family.create`、`family.createInvite`、`family.previewInvite`、`family.join`、`family.listMembers`、`family.removeMember` |
| 食谱 | `recipe.list`、`recipe.create`、`recipe.update`、`recipe.archive`、`recipe.listArchived`、`recipe.restore`、`recipe.duplicate`、`recipe.restoreRevision` |
| 评论 | `recipeComment.list`、`recipeComment.create`、`recipeComment.update`、`recipeComment.delete` |
| 食记 | `recipeAttempt.list`、`recipeAttempt.create`、`recipeAttempt.update`、`recipeAttempt.delete` |
| 食谱选项 | `recipeOptions.list`、`recipeOptions.add`、`recipeOptions.remove` |

`recipe-import` 支持 `start`、`list`、`status`、`complete` 和 `discard`。单次调用只提交任务或查询一次状态，保证在个人版云函数 3 秒超时限制内尽快返回；页面隐藏后停止轮询，重新进入食谱清单时恢复查询。

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

删除食谱使用软删除：`recipe.archive` 校验家庭归属和 `expectedVersion` 后写入归档标记，正常列表不再返回该食谱，但正文和修订历史仍保留。设置页提供废纸篓列表和恢复，不提供永久删除。

### 5.6 评论读写

评论列表支持 `newest / oldest`，默认最新。所有有效家庭成员都可查看和发布评论；只有作者能编辑自己的评论，作者或家庭管理员可以删除，管理员不能编辑他人评论。客户端的操作入口只改善交互，最终权限始终由云函数重新判断。

创建和删除在事务中同步食谱 `commentCount`；编辑只更新评论自身版本。食谱归档后评论不可访问，复制食谱和恢复旧修订都不会复制或回滚评论。

### 5.7 家庭食谱选项

老家庭没有 `recipeOptions` 时由云函数返回原固定选项作为默认配置；新家庭创建时直接写入默认配置。客户端和食谱写入不再维护固定白名单。

所有有效成员都可以添加和删除。配置使用独立 `version` 做并发校验。删除选项时先从家庭配置移除，再清除当前食谱中的对应值并递增食谱版本；不改变修改人、更新时间和修订数组。食谱列表、复制和历史恢复都会按最新家庭配置过滤，已删除选项不能重新出现。

### 5.8 食记

记录创建时由云函数读取当前食谱名称和版本并保存快照，客户端不能伪造家庭、作者或食谱快照。记录列表既支持家庭范围聚合，也支持按食谱查询详情页的轻量引用。

作者可以编辑自己的记录，作者或管理员可以删除；操作使用记录自身的 `expectedVersion`，不会引发食谱版本冲突。选择“按原食谱”时云端强制清空调整说明，避免产生含义冲突的数据。

### 5.9 AI 图片导入

1. 用户从相册选择按顺序排列的食谱截图，小程序压缩后上传到当前家庭的临时目录。
2. `recipe-import.start` 校验当前用户与家庭，把短期图片地址提交给异步模型 API，并在 `recipe_import_jobs` 保存服务端任务 ID。
3. 小程序立即返回食谱清单，只展示当前用户自己的任务卡；页面可见时通过 `status` 低频查询一次状态。
4. 识别完成后任务进入“待核对”，用户打开现有编辑页修改草稿。
5. 用户主动保存后调用 `recipe.create`，随后以 `complete` 结束任务并清理临时图片；放弃、失败或过期任务也可以清理。

模型 API Key 只存在于 `recipe-import` 云函数环境变量中。小程序不持有密钥、模型任务 ID 或临时 HTTPS 图片地址，也不能直接读写 `recipe_import_jobs`。

## 6. 前端迁移

`recipe-store.ts` 保留原函数名作为异步云端仓库，以缩小页面改造范围。页面统一使用 `Promise` 接口，并处理：

- 首次加载。
- 真实空状态。
- 保存中禁止重复点击。
- 请求失败后保留输入并允许重试。
- 被移出后的会话失效。
- 版本冲突提示。
- 评论发布或编辑失败时保留输入；评论排序默认最新。
- 导入提交后立即返回清单，以个人任务卡呈现识别中、待核对和失败状态。

首版不做持久化本地缓存。云端请求失败就显示错误，避免用户误以为本地内容已经同步。

## 7. 最小安全规则

1. 核心集合禁止小程序端直接写入，全部写操作走云函数。
2. 云函数不相信客户端传入的用户、家庭、角色、作者、状态和时间。
3. 查询食谱和成员时始终带服务端解析出的 `familyId`。
4. 邀请数据库只保存令牌摘要，日志不记录令牌和 OpenID 明文。
5. 正式环境不包含种子家庭和演示食谱。
6. 食谱更新只接受当前家庭媒体路径下的文件引用；云存储权限独立配置和核验。
7. `recipe_import_jobs` 使用 `ADMINONLY`，小程序客户端不能直接读取任务、模型任务 ID 或识别草稿。

## 8. 后续出现信号再增强

| 信号 | 再增加的能力 |
| --- | --- |
| 修订数组接近文档容量或历史变慢 | 拆分 `recipe_revisions` 集合并分页 |
| 家庭食谱明显增多、全量加载变慢 | 列表分页和服务端搜索 |
| 出现重复写入 | 通用 `requestId` 幂等回执 |
| 邀请被滥用 | 更严格的限频、撤销和审计 |
| 需要同时加入多个家庭 | 重做家庭切换和有效成员资格规则 |
| 图片数量或存储成本明显增长 | 增加无引用媒体扫描、缩略图和生命周期清理 |
