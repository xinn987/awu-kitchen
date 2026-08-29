# 食谱图片 AI 导入部署指南

## 1. 功能边界

导入页只把图片识别为一份临时草稿，并打开现有食谱编辑页预填。用户逐项核对并点击保存后，才会调用 `recipe.create` 写入家庭食谱。

首版仅支持用户从微信相册选择已经保存的图片或截图，不解析或抓取小红书分享链接。识别原图只进入家庭隔离的临时云存储目录，默认不会成为食谱主图或步骤图。

## 2. AI 服务配置

在微信云开发控制台给 `recipe-import` 云函数配置环境变量：

| 环境变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `RECIPE_AI_PROVIDER` | 否 | `openai-compatible` | AI 协议适配器；当前内置 OpenAI-compatible |
| `RECIPE_AI_API_KEY` | 是 | 无 | 服务端 API Key，只能配置在云函数环境中 |
| `RECIPE_AI_ENDPOINT` | 是 | 无 | 完整的 HTTPS 对话补全接口地址 |
| `RECIPE_AI_MODEL` | 是 | 无 | 支持多图输入的模型代码 |

通用模块故意不提供厂商、接口地址或模型默认值，避免更换环境时静默调用错误的服务。当前使用 GLM-5.3-Flash 时，可配置为：

```text
RECIPE_AI_PROVIDER=openai-compatible
RECIPE_AI_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/chat/completions
RECIPE_AI_MODEL=glm-5.3-flash
RECIPE_AI_API_KEY=<在云函数环境中填写>
```

禁止把 API Key 写入：

- `miniprogram/` 下的任何文件；
- `project.config.json` 或 `project.private.config.json`；
- 云文件 URL、请求参数、错误响应或日志。

小程序客户端只调用自家云函数，只能看到清洗后的成功数据或稳定错误码，无法读取云函数发往 AI 服务的鉴权请求头。

## 3. 模型替换边界

食谱提取、提示词和结果清洗只依赖通用 `AiProvider` 接口：

- 更换为另一款 OpenAI-compatible 多模态模型时，通常只需更新环境变量并重新做回归测试；
- 如果新模型不支持 `response_format: json_object`，云函数会在 400/422 时自动退回普通 JSON 提示模式；
- 更换为 Gemini、Claude 等不同请求协议时，在 `cloudfunctions/recipe-import/src/` 增加新的 Provider 适配器，并在 `createAiProvider` 中注册，不修改小程序页面和食谱清洗逻辑；
- 新适配器必须继续使用 HTTPS、服务端密钥，并最终只返回模型生成的文本内容。

## 4. 构建与部署

在仓库根目录执行：

```powershell
npm install --prefix cloudfunctions/recipe-import
npm run check --prefix cloudfunctions/recipe-import
npm run build --prefix cloudfunctions/recipe-import
npm run check
```

随后在微信开发者工具中：

1. 右键 `cloudfunctions/recipe-import`。
2. 选择上传并部署，使用云端安装依赖。
3. 确认函数超时为 60 秒。
4. 在函数配置中添加上述 `RECIPE_AI_*` 环境变量。
5. 不要把真实密钥复制到开发者工具的前端调试代码或提交到 Git。

`recipe-import` 必须与现有 `api` 云函数部署在同一个 CloudBase 环境，否则无法读取当前家庭成员、家庭选项和临时图片。

## 5. 数据流与清理

```text
微信相册
  -> 小程序本地压缩
  -> recipe-import-temp/{familyId}/{jobId}/
  -> recipe-import 云函数取得短期 HTTPS URL
  -> 已配置的 AI Provider
  -> 云函数清洗为 ImportDraft
  -> 编辑页预填
  -> 用户确认后 recipe.create
```

小程序在识别成功或失败后都会尽力调用 `wx.cloud.deleteFile` 清理临时图片。网络或进程异常仍可能留下无引用临时文件，正式运营前应为 `recipe-import-temp/` 增加定期清理或存储生命周期规则。

## 6. 上线前人工检查

- 使用纯文字配料表、步骤长图、拼图、带水印图片和缺页图片各测试一组。
- 测试非食谱图片和同时包含多份不同食谱的图片，确认不会擅自创建内容。
- 确认图片顺序调整后，步骤顺序与选择顺序一致，警告能定位“图片 N”。
- 确认用量缺失时留空，同名食材用量冲突时不会静默选择其中一个。
- 确认家庭不存在的类型或阶段不会进入编辑表单。
- 确认取消编辑不会创建食谱，最终保存前可以修改所有识别字段。
- 确认服务欠费、限流、超时、无效 Key 时只显示稳定中文错误，不输出密钥或图片 URL。
- 在小程序隐私说明中如实披露当前实际使用的第三方 AI 服务商、处理目的和图片数据范围。

## 7. 当前 GLM 配置参考

- [智谱 API 快速开始](https://docs.bigmodel.cn/cn/api/introduction)：通用端点和 Bearer 鉴权。
- [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)：模型代码和多图 `image_url` 输入。
- [结构化输出](https://docs.bigmodel.cn/cn/guide/capabilities/struct-output)：`json_object` 模式及服务端 JSON 验证建议。
