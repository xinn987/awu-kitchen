/**
 * 异步 AI 识别适配层。
 *
 * 食谱业务只依赖“提交任务 / 查询任务”能力，不感知具体模型厂商。
 * 当前适配器使用异步 Chat Completions 形态；其他厂商只需实现同一接口。
 */
import https from 'https'

// 云函数只有 3 秒执行时间，网络请求必须主动留出数据库读写和返回响应的余量。
const REQUEST_TIMEOUT_MS = 1_600

export interface AiImageInput {
  /** 从 1 开始的图片序号，用于让模型的警告能定位原图。 */
  index: number
  url: string
}

export interface AiRecognitionRequest {
  requestId: string
  systemPrompt: string
  images: AiImageInput[]
  maxTokens: number
}

export type AiTaskResult =
  | { status: 'processing' }
  | { status: 'succeeded'; content: string }
  | { status: 'failed' }

export interface AiProvider {
  submit(request: AiRecognitionRequest): Promise<{ taskId: string }>
  query(taskId: string): Promise<AiTaskResult>
}

export class AiProviderHttpError extends Error {
  constructor(public readonly status: number) {
    super(`AI provider returned HTTP ${status}`)
    this.name = 'AiProviderHttpError'
  }
}

export class AiProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiProviderConfigurationError'
  }
}

interface AsyncChatCompletionsConfig {
  submitEndpoint: string
  resultEndpoint: string
  model: string
  apiKey: string
}

interface AsyncChatCompletionsRequest {
  model: string
  messages: Array<{
    role: 'system' | 'user'
    content: string | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >
  }>
  max_tokens: number
  request_id: string
}

/**
 * 使用独立提交和查询端点的异步 Chat Completions 适配器。
 * 视觉模型不发送 response_format；结构化约束由提示词和服务端校验共同保证。
 */
class AsyncChatCompletionsProvider implements AiProvider {
  constructor(private readonly config: AsyncChatCompletionsConfig) {}

  async submit(request: AiRecognitionRequest): Promise<{ taskId: string }> {
    const content: AsyncChatCompletionsRequest['messages'][number]['content'] = [
      { type: 'text', text: `下面依次提供 ${request.images.length} 张食谱图片，请严格按编号阅读。` },
      ...request.images.flatMap((image) => [
        { type: 'text' as const, text: `图片 ${image.index}` },
        { type: 'image_url' as const, image_url: { url: image.url } },
      ]),
    ]
    const body: AsyncChatCompletionsRequest = {
      model: this.config.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content },
      ],
      max_tokens: request.maxTokens,
      request_id: request.requestId,
    }
    const response = await this.requestJson('POST', this.config.submitEndpoint, body)
    const taskId = textField(response, 'id')
    if (!taskId) throw new Error('AI provider returned no task id')
    return { taskId }
  }

  async query(taskId: string): Promise<AiTaskResult> {
    const endpoint = this.config.resultEndpoint.replace('{id}', encodeURIComponent(taskId))
    if (endpoint === this.config.resultEndpoint) {
      throw new AiProviderConfigurationError('AI 查询地址缺少 {id} 占位符')
    }
    const response = await this.requestJson('GET', endpoint)
    const taskStatus = textField(response, 'task_status').toUpperCase()
    if (taskStatus === 'PROCESSING' || taskStatus === 'PENDING') return { status: 'processing' }
    if (taskStatus === 'FAIL' || taskStatus === 'FAILED') return { status: 'failed' }

    const raw = response as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = raw.choices && raw.choices[0] && raw.choices[0].message?.content
    if (typeof content === 'string' && content.trim()) {
      return { status: 'succeeded', content: content.trim() }
    }
    // SUCCESS 却没有内容属于不可恢复的模型响应错误，不应让客户端永久轮询。
    if (taskStatus === 'SUCCESS') return { status: 'failed' }
    return { status: 'processing' }
  }

  private requestJson(method: 'GET' | 'POST', endpoint: string, body?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint)
      if (url.protocol !== 'https:') {
        reject(new AiProviderConfigurationError('AI 接口必须使用 HTTPS'))
        return
      }
      const payload = body === undefined ? '' : JSON.stringify(body)
      const request = https.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(payload ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          } : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          const responseText = Buffer.concat(chunks).toString('utf8')
          const status = response.statusCode || 500
          if (status < 200 || status >= 300) {
            reject(new AiProviderHttpError(status))
            return
          }
          try {
            resolve(JSON.parse(responseText) as unknown)
          } catch (_error) {
            reject(new Error('AI provider returned invalid JSON response'))
          }
        })
      })
      request.on('timeout', () => request.destroy(new Error('timeout')))
      request.on('error', (error) => reject(error))
      request.end(payload)
    })
  }
}

function textField(value: unknown, key: string): string {
  const raw = (value || {}) as Record<string, unknown>
  return typeof raw[key] === 'string' ? raw[key].trim() : ''
}

/** 从云函数环境创建适配器；业务命名不绑定任何模型厂商。 */
export function createAiProvider(environment: NodeJS.ProcessEnv = process.env): AiProvider {
  const provider = (environment.RECIPE_AI_PROVIDER || 'async-chat-completions').trim()
  const submitEndpoint = (environment.RECIPE_AI_SUBMIT_ENDPOINT || environment.RECIPE_AI_ENDPOINT)?.trim()
  const resultEndpoint = environment.RECIPE_AI_RESULT_ENDPOINT?.trim()
  const model = environment.RECIPE_AI_MODEL?.trim()
  const apiKey = environment.RECIPE_AI_API_KEY?.trim()
  if (!submitEndpoint || !resultEndpoint || !model || !apiKey) {
    throw new AiProviderConfigurationError('食谱识别服务尚未完整配置')
  }
  if (provider === 'async-chat-completions' || provider === 'openai-compatible') {
    return new AsyncChatCompletionsProvider({ submitEndpoint, resultEndpoint, model, apiKey })
  }
  throw new AiProviderConfigurationError(`暂不支持 AI Provider：${provider}`)
}
