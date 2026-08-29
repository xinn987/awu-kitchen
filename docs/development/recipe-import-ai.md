# 食谱图片 AI 导入部署指南

## 1. 功能边界

导入页只负责上传图片和提交异步任务。提交成功后用户立即返回食谱清单，任务卡只对提交者显示；识别完成后，用户进入现有编辑页逐项核对并点击保存，才会调用 `recipe.create` 写入家庭食谱。

首版仅支持用户从微信相册选择已经保存的图片或截图，不解析或抓取小红书分享链接。识别原图只进入家庭隔离的临时云存储目录，默认不会成为食谱主图或步骤图。

## 2. AI 服务配置

在微信云开发控制台给 `recipe-import` 云函数配置环境变量：

| 环境变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `RECIPE_AI_PROVIDER` | 否 | `async-chat-completions` | AI 协议适配器；当前内置异步 Chat Completions |
| `RECIPE_AI_API_KEY` | 是 | 无 | 服务端 API Key，只能配置在云函数环境中 |
| `RECIPE_AI_SUBMIT_ENDPOINT` | 是 | 无 | 完整的 HTTPS 异步任务提交地址 |
| `RECIPE_AI_RESULT_ENDPOINT` | 是 | 无 | 查询地址，必须包含 `{id}` 任务占位符 |
| `RECIPE_AI_MODEL` | 是 | 无 | 支持多图输入的模型代码 |

通用模块故意不提供厂商、接口地址或模型默认值，避免更换环境时静默调用错误的服务。当前使用 GLM-5.3-Flash 时，可配置为：

```text
RECIPE_AI_PROVIDER=async-chat-completions
RECIPE_AI_SUBMIT_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/async/chat/completions
RECIPE_AI_RESULT_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/async-result/{id}
RECIPE_AI_MODEL=glm-5.3-flash
RECIPE_AI_API_KEY=<在云函数环境中填写>
```

禁止把 API Key 写入：

- `miniprogram/` 下的任何文件；
- `project.config.json` 或 `project.private.config.json`；
- 云文件 URL、请求参数、错误响应或日志。

小程序客户端只调用自家云函数，只能看到清洗后的成功数据或稳定错误码，无法读取云函数发往 AI 服务的鉴权请求头。

## 3. 模型替换边界

食谱提取、提示词和结果清洗只依赖通用 `AiProvider` 的 `submit/query` 接口：

- 更换为另一款支持异步任务的多模态模型时，通常只需更新环境变量并重新做回归测试；
- 视觉异步请求不发送仅文本模型支持的 `response_format`，结构化结果由提示词和服务端严格校验共同保证；
- 更换为 Gemini、Claude 等不同请求协议时，在 `cloudfunctions/recipe-import/src/` 增加新的 Provider 适配器，并在 `createAiProvider` 中注册，不修改小程序页面和食谱清洗逻辑；
- 新适配器必须继续使用 HTTPS、服务端密钥，并提供快速提交和单次状态查询能力。

## 4. 构建与部署

在仓库根目录执行：

```powershell
npm install --prefix cloudfunctions/recipe-import
npm run check --prefix cloudfunctions/recipe-import
npm run build --prefix cloudfunctions/recipe-import
npm run check
```

随后在微信开发者工具中：

1. 在云开发数据库创建 `recipe_import_jobs` 集合，并禁止小程序客户端直接读写。
2. 右键 `cloudfunctions/recipe-import`。
3. 选择上传并部署，使用云端安装依赖。
4. 确认函数超时为 3 秒。
5. 在函数配置中添加上述 `RECIPE_AI_*` 环境变量。
6. 不要把真实密钥复制到开发者工具的前端调试代码或提交到 Git。

`recipe-import` 必须与现有 `api` 云函数部署在同一个 CloudBase 环境，否则无法读取当前家庭成员、家庭选项和临时图片。

上传小程序时，CLI 的 `--version` 必须与 `miniprogram/config/version.ts` 中的 `DEVELOPMENT_VERSION` 保持一致。开发者工具或部分体验版运行环境拿不到微信后台版本号时会显示这个回退值；修改后需要重新上传对应版本。

## 5. 数据流与清理

```text
微信相册
  -> 小程序本地压缩
  -> recipe-import-temp/{familyId}/{jobId}/
  -> recipe-import 云函数提交异步任务并返回应用 jobId
  -> 食谱清单展示仅提交者可见的任务卡
  -> 客户端可见时低频查询一次任务状态
  -> 云函数清洗为 ImportDraft 并标记“待核对”
  -> 用户打开编辑页预填
  -> 用户确认后 recipe.create
```

异步提交后不能立即删除图片。任务保存、失败后由用户删除、或过期移除时，云函数会先隐藏任务，再尽力清理临时图片。网络或进程异常仍可能留下无引用文件，正式运营前应为 `recipe-import-temp/` 增加定期清理或存储生命周期规则。

## 6. 上线前人工检查

- 使用纯文字配料表、步骤长图、拼图、带水印图片和缺页图片各测试一组。
- 测试非食谱图片和同时包含多份不同食谱的图片，确认不会擅自创建内容。
- 确认图片顺序调整后，步骤顺序与选择顺序一致，警告能定位“图片 N”。
- 确认用量缺失时留空，同名食材用量冲突时不会静默选择其中一个。
- 确认家庭不存在的类型或阶段不会进入编辑表单。
- 确认取消编辑不会创建食谱，最终保存前可以修改所有识别字段。
- 确认提交后可以退出页面，重新进入或换设备后仍能恢复本人未完成任务。
- 确认任务卡不会对其他家庭成员显示，保存后才进入共享食谱清单。
- 确认服务欠费、限流、超时、无效 Key 时只显示稳定中文错误，不输出密钥或图片 URL。
- 在小程序隐私说明中如实披露当前实际使用的第三方 AI 服务商、处理目的和图片数据范围。

## 7. 当前 GLM 配置参考

- [智谱 API 快速开始](https://docs.bigmodel.cn/cn/api/introduction)：通用端点和 Bearer 鉴权。
- [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)：模型代码和多图 `image_url` 输入。
- [对话补全（异步）](https://docs.bigmodel.cn/api-reference/模型-api/对话补全异步)：提交多模态任务并取得任务 ID。
- [查询异步结果](https://docs.bigmodel.cn/api-reference/模型-api/查询异步结果)：按任务 ID 查询一次处理状态和结果。
