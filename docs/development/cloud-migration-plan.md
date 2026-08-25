# 微信云开发简化实施方案

## 1. 实施原则

- 先跑通真实用户与共享数据闭环，再补工程增强。
- 每一阶段都能单独验收，不同时重写全部页面。
- 身份、家庭隔离和权限不能用 Demo 替代。
- 正式环境失败时不回退到本地数据。

## 2. 最小代码结构

```text
cloudfunctions/api/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts               # action 路由
    ├── cloud.ts               # CloudBase 初始化与数据库实例
    ├── auth.ts                # 微信身份与成员资格
    ├── family.ts              # 家庭、邀请、成员
    ├── recipe.ts              # 食谱与嵌入式修订
    ├── errors.ts              # 错误码
    └── validation.ts          # 输入校验

miniprogram/
├── config/cloud.ts
├── services/cloud-client.ts
├── services/session-service.ts
├── services/family-service.ts
├── services/recipe-store.ts      # 保留原名，内部已改为异步云端仓库
└── pages/onboarding/
```

暂不建设通用 Repository、事件系统、缓存层、命令回执框架或独立后台。

## 3. 开发阶段

### 阶段 1：云环境与真实身份（代码已完成，待环境配置和真机验收）

开发内容：

- 创建一个开发 CloudBase 环境；生产环境在发布前再创建。
- 配置 `cloudfunctionRoot` 和一个 `api` 云函数。
- 创建 `users`、`families`、`family_members`、`family_invites`、`recipes` 五个集合。
- 实现统一返回结构、错误码和 OpenID 解析。
- `App.onLaunch` 初始化云环境并调用 `session.bootstrap`。
- 新增 onboarding：创建家庭或等待邀请。

验收：两个微信账号首次进入都看到真实空状态；任一账号创建家庭后成为管理员；重新打开不会重复创建用户或家庭。

### 阶段 2：邀请和成员闭环（代码已完成，待双账号验收）

开发内容：

- 管理员生成单次、24 小时邀请令牌。
- 体验版复制邀请码并通过微信文字传递；正式发布后兼容分享卡片携带邀请令牌。
- 接收者粘贴邀请码或打开邀请卡片，填写家庭称谓并加入。
- 家庭页读取云端成员列表。
- 管理员软移出成员。
- 删除当前六位邀请码和本地成员管理逻辑。

验收：账号 B 能使用账号 A 复制的邀请码加入；双方看到相同成员列表；邀请不能重复使用；B 被移出后不能继续访问家庭数据。

### 阶段 3：食谱上云（代码已完成，待云端联调）

开发内容：

- 将 `recipe-store.ts` 的读写迁移为异步云函数调用。
- 迁移食谱库、详情、快速收录、待补条目、编辑和复制。
- 服务端生成家庭、作者、时间、状态和版本。
- 一次加载家庭全部食谱，继续使用当前前端搜索和类型筛选。
- 每个页面补 loading、empty、saving 和 error 状态。
- 开发环境按需手动生成 Demo 数据；正式环境永不自动生成。

验收：A 新增或修改食谱后 B 刷新可见；贡献者称谓正确；待补和正式食谱区分不变；伪造其他家庭 ID 无效。

### 阶段 4：历史、冲突与发布（代码已完成，生产配置未完成）

开发内容：

- 沿用当前食谱内嵌 `revisions[]`。
- 更新和恢复时校验 `expectedVersion`。
- 迁移历史页和恢复操作。
- 创建生产 CloudBase 环境，部署空集合和必要索引。
- 正式构建只使用生产环境，删除 Demo 回退。

验收：两人同时编辑不会静默覆盖；恢复旧版本形成新修订；双账号、双设备完整流程通过；生产首次进入为空状态。

## 4. 当前文件改造范围

| 位置 | 改造 |
| --- | --- |
| `project.config.json` | 增加云函数目录 |
| `miniprogram/app.ts` | 初始化 CloudBase 和会话 |
| `miniprogram/app.json` | 注册 onboarding 页面 |
| `miniprogram/models/recipe.ts` | 增加服务端版本；移除本地伪身份语义 |
| `miniprogram/services/recipe-store.ts` | 迁移期间保留，随后退出正式调用链 |
| `pages/family` | 复制邀请码、兼容分享链接、云端成员和移出 |
| `pages/library` | 云端食谱和真实空状态 |
| `pages/recipe-detail` | 异步详情与复制 |
| `pages/recipe-edit` | 异步保存与冲突提示 |
| `pages/history` | 云端内嵌修订和恢复 |
| `components/quick-capture` | 异步保存与失败保留输入 |

当前小程序没有照片字段、选图和展示控件。照片不是本轮迁移内容，后续有明确需要时再整体增加。

## 5. 最小测试范围

自动检查：

- 输入校验和 `pending / formal` 判定。
- 非管理员不能邀请或移出成员。
- 邀请有效、已使用和过期状态。
- 版本冲突判断。
- TypeScript 编译和现有页面基本自动化冒烟。

必须手工完成的双账号真机测试：

1. A 创建家庭并分享。
2. B 通过卡片加入。
3. B 收录食谱，A 能看到并编辑。
4. A、B 同时编辑，验证冲突提示。
5. A 移出 B，B 的读取和写入都被拒绝。

## 6. 上线条件

- 开发环境双账号流程通过。
- 跨家庭数据访问被服务端拒绝。
- 正式环境无 Demo 数据和本地回退。
- 云函数日志不包含邀请令牌或 OpenID 明文。
- 云端失败时页面明确报错，用户输入不会因保存失败被清空。

## 7. 云环境部署清单

1. 在微信开发者工具中选择开发用云环境，并创建 `users`、`families`、`family_members`、`family_invites`、`recipes`、`recipe_comments` 六个空集合；评论接口也会在首次使用时兼容性地检查并创建缺失集合。
2. 五个集合的客户端安全规则都设为 `read: false`、`write: false`；小程序只通过云函数读写。
3. 至少创建以下索引：`family_invites.tokenHash`，`family_members(familyId, status)`，`family_members(familyId, displayName, status)`，`recipes.familyId`。
4. 在 `cloudfunctions/api` 执行 `pnpm install` 和 `pnpm run build`。构建会把运行用 JavaScript 平铺到云函数根目录；确认根目录 `index.js` 存在后，在开发者工具中上传并部署 `api`，选择云端安装依赖。
5. 开发联调可让 `CLOUD_ENV_ID` 保持空字符串并使用开发者工具当前环境；发布前必须在 `miniprogram/config/cloud.ts` 填入明确的生产环境 ID。
6. 生产环境重新创建空集合、规则和索引，不复制开发环境里的测试家庭或食谱。

## 8. 明确后置

- 照片和云存储。
- 独立修订集合和分页。
- 服务端全文搜索。
- 通用幂等框架和高级限频。
- 多家庭、多管理员、管理员交接和主动退出。
- 实时同步、离线编辑和自动冲突合并。
- 独立 Web 管理后台。
