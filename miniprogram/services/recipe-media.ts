/**
 * 食谱图片选择、压缩与云存储上传。
 * 图片二进制不经过业务云函数；云函数只接收最终 fileId 和展示尺寸。
 */
import { initCloud } from '../config/cloud'
import type { RecipeImage } from '../models/recipe'

const MAX_LONG_EDGE = 1600
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024
const UPLOAD_CONCURRENCY = 3

export interface LocalRecipeImage {
  localPath: string
  width: number
  height: number
  size: number
}

export interface RecipeImageUploadItem {
  key: string
  image: LocalRecipeImage
}

export type MediaSaveStatus =
  | { phase: 'processing'; current: number; total: number }
  | { phase: 'uploading'; current: number; total: number }

export class RecipeMediaError extends Error {
  constructor(message: string, public readonly cancelled = false) {
    super(message)
    this.name = 'RecipeMediaError'
  }
}

function imageInfo(src: string): Promise<{ width: number; height: number }> {
  return wx.getImageInfo({ src }).then((result) => ({ width: result.width, height: result.height }))
}

function fileSize(path: string): number {
  const stats = wx.getFileSystemManager().statSync(path)
  return Array.isArray(stats) ? 0 : stats.size
}

/** 一次只选一张图，页面可以直接用本地路径预览，但此时尚未保存。 */
export async function chooseRecipeImage(): Promise<LocalRecipeImage> {
  try {
    const result = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    })
    const file = result.tempFiles[0]
    if (!file || file.fileType !== 'image') throw new RecipeMediaError('没有选择图片', true)
    const fallback = file.width > 0 && file.height > 0
      ? { width: file.width, height: file.height }
      : await imageInfo(file.tempFilePath)
    return {
      localPath: file.tempFilePath,
      width: fallback.width,
      height: fallback.height,
      size: file.size || fileSize(file.tempFilePath),
    }
  } catch (error) {
    if (error instanceof RecipeMediaError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel/i.test(message)) throw new RecipeMediaError('已取消选择', true)
    throw new RecipeMediaError('需要相册或相机权限才能添加图片')
  }
}

/** 压缩为适合小程序展示和模型识别的尺寸；正式图片与导入临时图片共用规则。 */
export async function compressRecipeImage(image: LocalRecipeImage): Promise<LocalRecipeImage> {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  // 已达到展示尺寸与体积目标时避免重复转码，减少真机等待和画质损失。
  if (scale === 1 && image.size > 0 && image.size <= TARGET_MAX_BYTES) return image

  const compress = async (quality: number) => {
    const result = await wx.compressImage({
      src: image.localPath,
      quality,
      compressedWidth: width,
      compressedHeight: height,
    })
    const info = await imageInfo(result.tempFilePath)
    return {
      localPath: result.tempFilePath,
      width: info.width,
      height: info.height,
      size: fileSize(result.tempFilePath),
    }
  }

  let compressed = await compress(75)
  if (compressed.size > TARGET_MAX_BYTES) compressed = await compress(55)
  if (compressed.size > TARGET_MAX_BYTES) {
    throw new RecipeMediaError('图片处理后仍超过 1.5MB，请换一张图片')
  }
  return compressed
}

function randomCloudPath(familyId: string): string {
  const random = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `recipe-media/${familyId}/${random}.jpg`
}

/** 尽力删除本次保存产生、但最终未被食谱引用的新文件。 */
export async function cleanupUploadedRecipeImages(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return
  initCloud()
  try {
    await wx.cloud.deleteFile({ fileList: fileIds })
  } catch (error) {
    // 清理失败只会留下无引用文件，不能因此覆盖原本的保存错误。
    console.warn('清理未引用的食谱图片失败', error)
  }
}

/** 先统一压缩，再以最多 3 路并发上传；任何失败都会清理本批已上传文件。 */
export async function prepareAndUploadRecipeImages(
  familyId: string,
  items: RecipeImageUploadItem[],
  onStatus: (status: MediaSaveStatus) => void,
): Promise<{ images: Record<string, RecipeImage>; uploadedFileIds: string[] }> {
  if (items.length === 0) return { images: {}, uploadedFileIds: [] }
  initCloud()

  const processed: Array<{ key: string; image: LocalRecipeImage }> = []
  onStatus({ phase: 'processing', current: 0, total: items.length })
  for (let index = 0; index < items.length; index += 1) {
    processed.push({ key: items[index].key, image: await compressRecipeImage(items[index].image) })
    onStatus({ phase: 'processing', current: index + 1, total: items.length })
  }

  const images: Record<string, RecipeImage> = {}
  const uploadedFileIds: string[] = []
  let cursor = 0
  let started = 0
  let firstError: unknown

  const worker = async () => {
    while (!firstError) {
      const index = cursor
      cursor += 1
      if (index >= processed.length) return
      const item = processed[index]
      started += 1
      onStatus({ phase: 'uploading', current: started, total: processed.length })
      try {
        const result = await wx.cloud.uploadFile({
          cloudPath: randomCloudPath(familyId),
          filePath: item.image.localPath,
        })
        uploadedFileIds.push(result.fileID)
        images[item.key] = {
          fileId: result.fileID,
          width: item.image.width,
          height: item.image.height,
        }
      } catch (error) {
        firstError = error
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, processed.length) }, worker))
  if (firstError) {
    await cleanupUploadedRecipeImages(uploadedFileIds)
    throw new RecipeMediaError('图片上传失败，文字和图片选择已保留，请重试')
  }
  return { images, uploadedFileIds }
}

/** 图片预览使用临时 HTTPS 地址，正文图片仍可直接懒加载 cloud fileId。 */
export async function resolveRecipeImageUrls(fileIds: string[]): Promise<Array<{ fileId: string; url: string }>> {
  if (fileIds.length === 0) return []
  initCloud()
  const result = await wx.cloud.getTempFileURL({ fileList: fileIds })
  return result.fileList
    .filter((item) => item.status === 0 && Boolean(item.tempFileURL))
    .map((item) => ({ fileId: item.fileID, url: item.tempFileURL }))
}
