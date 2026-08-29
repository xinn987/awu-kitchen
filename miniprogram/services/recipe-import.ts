/**
 * 食谱图片导入客户端：负责多选、临时上传、调用识别云函数和尽力清理。
 * API 密钥不在客户端出现；客户端只调用自有 CloudBase 云函数。
 */
import { initCloud } from '../config/cloud'
import type { ApiResponse } from '../models/api'
import type {
  RecipeImportDraft,
  RecipeImportTask,
  RecipeImportTaskResult,
} from '../models/recipe-import'
import { ApiError } from './cloud-client'
import {
  compressRecipeImage,
  type LocalRecipeImage,
  RecipeMediaError,
} from './recipe-media'

export const MAX_IMPORT_IMAGES = 9
const IMPORT_UPLOAD_CONCURRENCY = 3
let pendingDraft: RecipeImportDraft | undefined

export type RecipeImportStatus =
  | { phase: 'processing'; current: number; total: number }
  | { phase: 'uploading'; current: number; total: number }
  | { phase: 'submitting'; current: number; total: number }

/** 仅跨一次页面跳转传递识别草稿，读取后立即清空，避免残留到下一次导入。 */
export function setPendingRecipeImportDraft(draft: RecipeImportDraft): void {
  pendingDraft = draft
}

export function takePendingRecipeImportDraft(): RecipeImportDraft | undefined {
  const draft = pendingDraft
  pendingDraft = undefined
  return draft
}

function fileSize(path: string): number {
  const stats = wx.getFileSystemManager().statSync(path)
  return Array.isArray(stats) ? 0 : stats.size
}

async function localImage(path: string, width?: number, height?: number, size?: number): Promise<LocalRecipeImage> {
  const info = width && height ? { width, height } : await wx.getImageInfo({ src: path })
  return {
    localPath: path,
    width: info.width,
    height: info.height,
    size: size || fileSize(path),
  }
}

/** 从相册一次选择多张食谱截图，返回顺序与微信选择器保持一致。 */
export async function chooseRecipeImportImages(count: number): Promise<LocalRecipeImage[]> {
  try {
    const result = await wx.chooseMedia({
      count: Math.max(1, Math.min(MAX_IMPORT_IMAGES, count)),
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
    })
    return Promise.all(result.tempFiles
      .filter((file) => file.fileType === 'image')
      .map((file) => localImage(file.tempFilePath, file.width, file.height, file.size)))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel/i.test(message)) throw new RecipeMediaError('已取消选择', true)
    throw new RecipeMediaError('需要相册权限才能导入食谱图片')
  }
}

function importCloudPath(familyId: string, jobId: string, index: number): string {
  return `recipe-import-temp/${familyId}/${jobId}/${index + 1}.jpg`
}

/** 上传模型识别用的临时副本；任何失败都会清理本批已经上传的文件。 */
export async function uploadRecipeImportImages(
  familyId: string,
  images: LocalRecipeImage[],
  onStatus: (status: RecipeImportStatus) => void,
): Promise<string[]> {
  initCloud()
  const processed: LocalRecipeImage[] = []
  onStatus({ phase: 'processing', current: 0, total: images.length })
  for (let index = 0; index < images.length; index += 1) {
    processed.push(await compressRecipeImage(images[index]))
    onStatus({ phase: 'processing', current: index + 1, total: images.length })
  }

  const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const fileIds = new Array<string>(processed.length)
  const uploaded: string[] = []
  let cursor = 0
  let completed = 0
  let firstError: unknown

  const worker = async () => {
    while (!firstError) {
      const index = cursor
      cursor += 1
      if (index >= processed.length) return
      try {
        const result = await wx.cloud.uploadFile({
          cloudPath: importCloudPath(familyId, jobId, index),
          filePath: processed[index].localPath,
        })
        fileIds[index] = result.fileID
        uploaded.push(result.fileID)
        completed += 1
        onStatus({ phase: 'uploading', current: completed, total: processed.length })
      } catch (error) {
        firstError = error
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(IMPORT_UPLOAD_CONCURRENCY, processed.length) }, worker))
  if (firstError || fileIds.some((fileId) => !fileId)) {
    await cleanupRecipeImportImages(uploaded)
    throw new RecipeMediaError('导入图片上传失败，请重试')
  }
  return fileIds
}

/** 临时图片只用于本次识别，无论成功或失败都尽力删除。 */
export async function cleanupRecipeImportImages(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return
  initCloud()
  try {
    await wx.cloud.deleteFile({ fileList: fileIds })
  } catch (error) {
    console.warn('清理食谱导入临时图片失败', error)
  }
}

/** 所有任务操作都只携带应用任务 ID；模型密钥和模型任务 ID 不进入客户端。 */
async function callRecipeImport<T>(data: Record<string, unknown>): Promise<T> {
  initCloud()
  try {
    const result = await wx.cloud.callFunction({ name: 'recipe-import', data })
    const response = result.result as ApiResponse<T> | undefined
    if (!response) throw new ApiError('SERVICE_UNAVAILABLE', '识别服务没有返回结果，请稍后重试')
    if (!response.ok) throw new ApiError(response.error.code, response.error.message)
    return response.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('SERVICE_UNAVAILABLE', '食谱识别服务暂时不可用，请稍后重试')
  }
}

/** 提交后立即返回应用任务；耗时识别由模型平台在后台继续执行。 */
export async function submitRecipeImport(
  fileIds: string[],
  familyId: string,
  memberId: string,
  onStatus: (status: RecipeImportStatus) => void,
): Promise<RecipeImportTask> {
  onStatus({ phase: 'submitting', current: 0, total: fileIds.length })
  const result = await callRecipeImport<{ task: RecipeImportTask }>({
    action: 'start', fileIds, familyId, memberId,
  })
  return result.task
}

/** 清单页只读取当前用户自己的未完成任务。 */
export async function listRecipeImportTasks(): Promise<RecipeImportTask[]> {
  const result = await callRecipeImport<{ tasks: RecipeImportTask[] }>({ action: 'list' })
  return result.tasks
}

/** 每次调用只查询模型状态一次，不在 3 秒云函数内循环等待。 */
export function getRecipeImportTask(jobId: string): Promise<RecipeImportTaskResult> {
  return callRecipeImport<RecipeImportTaskResult>({ action: 'status', jobId })
}

/** 用户保存正式食谱后，服务端隐藏任务并清理识别临时图。 */
export function completeRecipeImportTask(jobId: string): Promise<void> {
  return callRecipeImport<{ completedJobId: string }>({ action: 'complete', jobId }).then(() => undefined)
}

/** 失败或过期任务由用户主动移除，避免自动重试产生额外模型费用。 */
export function discardRecipeImportTask(jobId: string): Promise<void> {
  return callRecipeImport<{ completedJobId: string }>({ action: 'discard', jobId }).then(() => undefined)
}
