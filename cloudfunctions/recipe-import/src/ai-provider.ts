/**
 * AI 文本生成适配层。
 *
 * 食谱识别业务只依赖 AiProvider，不感知具体厂商。当前内置的是
 * OpenAI-compatible 协议；以后接入其他协议时，只需新增适配器并在工厂中注册。
 */
import https from 'https'

const REQUEST_TIMEOUT_MS = 50_000

export interface AiImageInput {
  /** 从 1 开始的图片序号，用于让模型的警告能定位原图。 */
  index: number
  url: string
}

export interface AiRecognitionRequest {
  systemPrompt: string
  images: AiImageInput[]
  maxTokens: number
  jsonMode: boolean
}

export interface AiProvider {
  recognize(request: AiRecognitionRequest): Promise<string>
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

interface OpenAiCompatibleConfig {
  endpoint: string
  model: string
  apiKey: string
}

interface OpenAiCompatibleRequest {
  model: string
  messages: Array<{
    role: 'system' | 'user'
    content: string | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >
  }>
  stream: false
  max_tokens: number
  response_format?: { type: 'json_object' }
}

/** 只发送多家兼容接口共有的字段，避免把某个模型的推理参数泄漏到业务层。 */
class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async recognize(request: AiRecognitionRequest): Promise<string> {
    const content: OpenAiCompatibleRequest['messages'][number]['content'] = [
      { type: 'text', text: `下面依次提供 ${request.images.length} 张食谱图片，请严格按编号阅读。` },
      ...request.images.flatMap((image) => [
        { type: 'text' as const, text: `图片 ${image.index}` },
        { type: 'image_url' as const, image_url: { url: image.url } },
      ]),
    ]
    const body: OpenAiCompatibleRequest = {
      model: this.config.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content },
      ],
      stream: false,
      max_tokens: request.maxTokens,
      ...(request.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    }
    const response = await this.postJson(body)
    const raw = response as { choices?: Array<{ message?: { content?: unknown } }> }
    const text = raw.choices && raw.choices[0] && raw.choices[0].message?.content
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('AI provider returned empty content')
    }
    return text.trim()
  }

  private postJson(body: OpenAiCompatibleRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.endpoint)
      if (url.protocol !== 'https:') {
        reject(new AiProviderConfigurationError('AI 接口必须使用 HTTPS'))
        return
      }
      const payload = JSON.stringify(body)
      const request = https.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = response.statusCode || 500
          if (status < 200 || status >= 300) {
            reject(new AiProviderHttpError(status))
            return
          }
          try {
            resolve(JSON.parse(text) as unknown)
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

/**
 * 从云函数环境创建适配器。通用模块不提供厂商默认值，避免部署时静默绑定模型。
 */
export function createAiProvider(environment: NodeJS.ProcessEnv = process.env): AiProvider {
  const provider = (environment.RECIPE_AI_PROVIDER || 'openai-compatible').trim()
  const endpoint = environment.RECIPE_AI_ENDPOINT?.trim()
  const model = environment.RECIPE_AI_MODEL?.trim()
  const apiKey = environment.RECIPE_AI_API_KEY?.trim()
  if (!endpoint || !model || !apiKey) {
    throw new AiProviderConfigurationError('食谱识别服务尚未完整配置')
  }
  if (provider === 'openai-compatible') {
    return new OpenAiCompatibleProvider({ endpoint, model, apiKey })
  }
  throw new AiProviderConfigurationError(`暂不支持 AI Provider：${provider}`)
}
