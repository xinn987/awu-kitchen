import { getActiveContext } from './auth'
import { db } from './cloud'
import { DomainError, assertDomain } from './errors'
import {
  namesForKind,
  normalizeRecipeOptions,
  optionField,
  optionsFromFamily,
  type RecipeOptionKind,
  type RecipeOptions,
} from './recipe-option-model'

const MAX_OPTIONS_PER_KIND = 20

interface OptionUsage {
  name: string
  usageCount: number
}

function optionKind(value: unknown): RecipeOptionKind {
  assertDomain(value === 'foodType' || value === 'stage', 'VALIDATION_ERROR', '食谱选项类型无效')
  return value
}

function optionName(value: unknown): string {
  assertDomain(typeof value === 'string', 'VALIDATION_ERROR', '请填写选项名称')
  const name = value.trim()
  assertDomain(name.length > 0, 'VALIDATION_ERROR', '请填写选项名称')
  assertDomain(name.length <= 20, 'VALIDATION_ERROR', '选项名称最多 20 个字')
  return name
}

function withNames(options: RecipeOptions, kind: RecipeOptionKind, nextNames: string[]): RecipeOptions {
  return {
    ...options,
    ...(kind === 'foodType' ? { foodTypes: nextNames } : { stages: nextNames }),
    version: options.version + 1,
  }
}

async function familyOptions(familyId: string): Promise<{ familyName: string; options: RecipeOptions }> {
  const result = await db.collection('families').doc(familyId).get() as unknown as {
    data: Record<string, unknown>
  }
  return { familyName: String(result.data.name || ''), options: optionsFromFamily(result.data) }
}

/**
 * 查询更新会清除所有匹配文档；循环用于兼容云数据库单次批量更新上限。
 * 只递增并发版本，不改变修改人、更新时间或修订记录。
 */
async function clearRecipeReferences(
  familyId: string,
  kind: RecipeOptionKind,
  name: string,
): Promise<number> {
  const field = optionField(kind)
  let total = 0
  for (let round = 0; round < 100; round += 1) {
    const result = await db.collection('recipes').where({ familyId, [field]: name }).update({
      data: {
        [field]: db.command.remove(),
        version: db.command.inc(1),
      },
    }) as unknown as { stats?: { updated?: number } }
    const updated = Math.max(0, Number(result.stats && result.stats.updated) || 0)
    total += updated
    if (updated === 0) return total
  }
  throw new DomainError('SERVICE_UNAVAILABLE', '相关食谱仍在清理，请稍后重试')
}

export async function listRecipeOptions(userId: string) {
  const { member } = await getActiveContext(userId)
  const [{ familyName, options }, recipeRaw] = await Promise.all([
    familyOptions(member.familyId),
    db.collection('recipes').where({ familyId: member.familyId })
      .field({ type: true, stage: true, archivedAt: true }).limit(1000).get(),
  ])
  const recipes = (recipeRaw as unknown as {
    data: Array<{ type?: string; stage?: string; archivedAt?: string }>
  }).data.filter((recipe) => !recipe.archivedAt)
  const usage = (names: string[], field: 'type' | 'stage'): OptionUsage[] => names.map((name) => ({
    name,
    usageCount: recipes.filter((recipe) => recipe[field] === name).length,
  }))
  return {
    familyName,
    version: options.version,
    foodTypes: usage(options.foodTypes, 'type'),
    stages: usage(options.stages, 'stage'),
  }
}

export async function addRecipeOption(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const kind = optionKind(payload.kind)
  const name = optionName(payload.name)
  const expectedVersion = Number(payload.expectedVersion)

  // 删除动作若曾在网络中断后留下旧引用，重新添加同名项前先确保不会让旧食谱复活。
  const before = (await familyOptions(member.familyId)).options
  assertDomain(before.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入')
  assertDomain(!namesForKind(before, kind).includes(name), 'VALIDATION_ERROR', '这个选项已经存在')
  await clearRecipeReferences(member.familyId, kind, name)
  await db.runTransaction(async (transaction: any) => {
    const result = await transaction.collection('families').doc(member.familyId).get()
    const family = result.data as Record<string, unknown>
    const current = normalizeRecipeOptions(family.recipeOptions)
    assertDomain(current.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入')
    const currentNames = namesForKind(current, kind)
    assertDomain(!currentNames.includes(name), 'VALIDATION_ERROR', '这个选项已经存在')
    assertDomain(currentNames.length < MAX_OPTIONS_PER_KIND, 'VALIDATION_ERROR', '每类最多保留 20 个选项')
    await transaction.collection('families').doc(member.familyId).update({
      data: { recipeOptions: withNames(current, kind, [...currentNames, name]) },
    })
  })
  return listRecipeOptions(userId)
}

export async function removeRecipeOption(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const kind = optionKind(payload.kind)
  const name = optionName(payload.name)
  const expectedVersion = Number(payload.expectedVersion)

  // 先从可选项移除；后续任何新建、编辑或历史恢复都会立即拒绝这个值。
  await db.runTransaction(async (transaction: any) => {
    const result = await transaction.collection('families').doc(member.familyId).get()
    const family = result.data as Record<string, unknown>
    const current = normalizeRecipeOptions(family.recipeOptions)
    assertDomain(current.version === expectedVersion, 'VERSION_CONFLICT', '食谱选项已被家人修改，请重新载入')
    const currentNames = namesForKind(current, kind)
    assertDomain(currentNames.includes(name), 'VALIDATION_ERROR', '这个选项已经被删除')
    await transaction.collection('families').doc(member.familyId).update({
      data: { recipeOptions: withNames(current, kind, currentNames.filter((item) => item !== name)) },
    })
  })
  const affectedCount = await clearRecipeReferences(member.familyId, kind, name)
  return { ...(await listRecipeOptions(userId)), affectedCount }
}
