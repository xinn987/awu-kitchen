import crypto from 'crypto'
import { getActiveContext, type MemberRecord } from './auth'
import { db } from './cloud'
import { DomainError, assertDomain } from './errors'
import { normalizeRecipeContent, requiredText, type RecipeContent } from './validation'

function id(prefix: string): string {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`
}

/** CloudBase 的 doc(id).set() 数据体不能包含只读字段 _id。 */
function writableDocument(record: Record<string, unknown>): Record<string, unknown> {
  const data = { ...record }
  delete data._id
  return data
}

function contentOf(recipe: Record<string, unknown>, familyId: string): RecipeContent {
  return normalizeRecipeContent(recipe, familyId)
}

/** 列表读取时也清洗旧步骤和旧修订快照，但不会主动改写数据库。 */
function readableRecipe(recipe: Record<string, unknown>, familyId: string) {
  const revisions = Array.isArray(recipe.revisions)
    ? recipe.revisions.map((revision) => {
        const raw = revision as Record<string, unknown>
        return { ...raw, snapshot: normalizeRecipeContent(raw.snapshot, familyId) }
      })
    : []
  return {
    ...recipe,
    ...contentOf(recipe, familyId),
    id: String(recipe._id),
    revisions,
  }
}

function memberView(member: MemberRecord) {
  return {
    id: member._id,
    name: member.displayName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    color: member.color,
  }
}

function supportsRecipeImages(payload: Record<string, unknown>): boolean {
  return Number(payload.clientSchemaVersion) >= 2
}

/** 已发布旧客户端仍接收 string[]，新版才接收稳定步骤对象和图片。 */
function recipeViewForClient(recipe: Record<string, unknown>, payload: Record<string, unknown>) {
  if (supportsRecipeImages(payload)) return recipe
  const result = { ...recipe }
  delete result.mainImage
  result.steps = Array.isArray(recipe.steps)
    ? recipe.steps.map((step) => typeof step === 'string'
        ? step
        : String(((step || {}) as Record<string, unknown>).text || ''))
      .filter(Boolean)
    : []
  return result
}

function hasRecipeImages(recipe: Record<string, unknown>): boolean {
  if (recipe.mainImage) return true
  return Array.isArray(recipe.steps) && recipe.steps.some((step) => {
    return typeof step === 'object' && step !== null && Boolean((step as Record<string, unknown>).image)
  })
}

export async function listRecipeState(userId: string, payload: Record<string, unknown>) {
  const { member: current } = await getActiveContext(userId)
  const [familyRaw, memberRaw, recipeRaw] = await Promise.all([
    db.collection('families').doc(current.familyId).get(),
    db.collection('family_members').where({ familyId: current.familyId }).limit(100).get(),
    db.collection('recipes').where({ familyId: current.familyId }).limit(1000).get(),
  ])
  const familyResult = familyRaw as unknown as { data: { _id: string; name: string } }
  const memberResult = memberRaw as unknown as { data: MemberRecord[] }
  const recipeResult = recipeRaw as unknown as { data: Array<Record<string, unknown>> }
  const family = familyResult.data
  const recipes = recipeResult.data
    .filter((recipe) => !recipe.archivedAt)
    .map((recipe) => readableRecipe(recipe, current.familyId))
    .map((recipe) => recipeViewForClient(recipe, payload))
  return {
    recipeSchemaVersion: 2,
    family: { id: family._id, name: family.name },
    currentMemberId: current._id,
    members: memberResult.data.map(memberView),
    recipes,
  }
}

export async function createRecipe(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const content = normalizeRecipeContent(payload.content, member.familyId)
  const recipeId = id('r-')
  const now = new Date().toISOString()
  const formal = content.successKeys.length > 0
  const revisions = formal ? [{
    id: id('rev-'), authorId: member._id, time: now,
    summary: '初次收录', snapshot: content,
  }] : []
  const recipe = {
    ...content,
    _id: recipeId,
    id: recipeId,
    familyId: member.familyId,
    state: formal ? 'formal' : 'pending',
    createdById: member._id,
    createdAt: now,
    updatedById: member._id,
    updatedAt: now,
    version: 1,
    revisions,
  }
  await db.collection('recipes').doc(recipeId).set({ data: writableDocument(recipe) })
  return recipeViewForClient(recipe, payload)
}

async function ownedRecipe(familyId: string, recipeId: string): Promise<Record<string, unknown>> {
  try {
    const result = await db.collection('recipes').doc(recipeId).get() as unknown as {
      data: Record<string, unknown>
    }
    const recipe = result.data as Record<string, unknown>
    assertDomain(recipe.familyId === familyId, 'FORBIDDEN', '无权访问这份食谱')
    assertDomain(!recipe.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓')
    return recipe
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('VALIDATION_ERROR', '食谱不存在')
  }
}

export async function updateRecipe(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const recipeId = requiredText(payload.recipeId, '食谱', 80)
  const content = normalizeRecipeContent(payload.content, member.familyId)
  assertDomain(content.successKeys.length > 0, 'VALIDATION_ERROR', '正式食谱至少需要一条关键经验')
  const expectedVersion = Number(payload.expectedVersion)
  const summary = requiredText(payload.summary, '修改说明', 100)
  const now = new Date().toISOString()
  let next: Record<string, unknown> = {}

  await db.runTransaction(async (transaction: any) => {
    const result = await transaction.collection('recipes').doc(recipeId).get()
    const current = result.data as Record<string, unknown>
    assertDomain(current.familyId === member.familyId, 'FORBIDDEN', '无权编辑这份食谱')
    assertDomain(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓')
    assertDomain(
      supportsRecipeImages(payload) || !hasRecipeImages(current),
      'CLIENT_UPDATE_REQUIRED',
      '这份食谱包含图片，请先更新到最新体验版再修改',
    )
    assertDomain(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入')
    const version = expectedVersion + 1
    const revisions = Array.isArray(current.revisions) ? [...current.revisions] : []
    revisions.push({ id: id('rev-'), authorId: member._id, time: now, summary, snapshot: content })
    next = {
      ...current,
      ...content,
      id: recipeId,
      state: 'formal',
      updatedById: member._id,
      updatedAt: now,
      version,
      revisions,
    }
    await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(next) })
  })
  return recipeViewForClient(next, payload)
}

export async function duplicateRecipe(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const sourceId = requiredText(payload.recipeId, '食谱', 80)
  const source = await ownedRecipe(member.familyId, sourceId)
  const sourceContent = contentOf(source, member.familyId)
  return createRecipe(userId, {
    clientSchemaVersion: payload.clientSchemaVersion,
    content: {
      ...sourceContent,
      name: `${String(source.name)}（副本）`,
      // 副本的步骤是新的内容实体，但同一家庭内可安全复用图片文件。
      steps: sourceContent.steps.map((step) => ({ ...step, id: id('step-') })),
    },
  })
}

/**
 * 将食谱软删除：只增加归档标记并从正常列表隐藏，正文和修订历史全部保留。
 * 使用版本校验，避免在家人刚完成修改后由旧页面误归档新版本。
 */
export async function archiveRecipe(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const recipeId = requiredText(payload.recipeId, '食谱', 80)
  const expectedVersion = Number(payload.expectedVersion)
  const now = new Date().toISOString()
  let version = expectedVersion

  await db.runTransaction(async (transaction: any) => {
    const result = await transaction.collection('recipes').doc(recipeId).get()
    const current = result.data as Record<string, unknown>
    assertDomain(current.familyId === member.familyId, 'FORBIDDEN', '无权删除这份食谱')
    assertDomain(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓')
    assertDomain(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入')
    version = expectedVersion + 1
    await transaction.collection('recipes').doc(recipeId).update({
      data: {
        archivedAt: now,
        archivedById: member._id,
        updatedById: member._id,
        updatedAt: now,
        version,
      },
    })
  })
  return { archivedRecipeId: recipeId, version }
}

export async function restoreRevision(userId: string, payload: Record<string, unknown>) {
  const { member } = await getActiveContext(userId)
  const recipeId = requiredText(payload.recipeId, '食谱', 80)
  const revisionId = requiredText(payload.revisionId, '修订记录', 80)
  const expectedVersion = Number(payload.expectedVersion)
  const now = new Date().toISOString()
  let next: Record<string, unknown> = {}

  await db.runTransaction(async (transaction: any) => {
    const result = await transaction.collection('recipes').doc(recipeId).get()
    const current = result.data as Record<string, unknown>
    assertDomain(current.familyId === member.familyId, 'FORBIDDEN', '无权恢复这份食谱')
    assertDomain(!current.archivedAt, 'RECIPE_ARCHIVED', '这份食谱已移入废纸篓')
    assertDomain(Number(current.version) === expectedVersion, 'VERSION_CONFLICT', '这份食谱已被家人更新，请重新载入')
    const revisions = Array.isArray(current.revisions)
      ? [...current.revisions] as Array<Record<string, unknown>> : []
    const target = revisions.find((item) => item.id === revisionId)
    assertDomain(target && target.snapshot, 'VALIDATION_ERROR', '修订记录不存在')
    const content = normalizeRecipeContent(target.snapshot, member.familyId)
    const version = expectedVersion + 1
    revisions.push({
      id: id('rev-'), authorId: member._id, time: now,
      summary: '恢复旧版本', snapshot: content,
    })
    next = {
      ...current,
      ...content,
      id: recipeId,
      state: content.successKeys.length > 0 ? 'formal' : 'pending',
      updatedById: member._id,
      updatedAt: now,
      version,
      revisions,
    }
    await transaction.collection('recipes').doc(recipeId).set({ data: writableDocument(next) })
  })
  return recipeViewForClient(next, payload)
}
