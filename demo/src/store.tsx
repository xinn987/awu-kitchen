import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Member, Recipe, RecipeContent } from './types'
import { FAMILY_NAME, seedMembers, seedRecipes } from './data'
import { nowIso, uid } from './utils'

const STORAGE_KEY = 'jiawei-demo-v2'

interface StoreValue {
  recipes: Recipe[]
  members: Member[]
  currentUser: Member
  formalRecipes: Recipe[]
  pendingRecipes: Recipe[]
  getRecipe: (id: string) => Recipe | undefined
  quickCapture: (content: RecipeContent) => Recipe
  savePending: (name: string) => Recipe
  completePending: (id: string, content: RecipeContent) => Recipe | undefined
  updateRecipe: (id: string, content: RecipeContent, summary: string) => Recipe | undefined
  restoreRevision: (id: string, revisionId: string) => void
  duplicateRecipe: (id: string) => Recipe | undefined
  removeRecipe: (id: string) => void
  searchRecipes: (query: string) => Recipe[]
}

const StoreContext = createContext<StoreValue | null>(null)

interface Persisted {
  recipes: Recipe[]
  members: Member[]
}

const isFormal = (r: Recipe) => r.successKeys.some((k) => k.trim().length > 0)

function loadInitial(): Persisted {
  // 演示辅助: 打开 #reset 时清空本地数据, 恢复初始示例
  if (window.location.hash === '#reset') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 忽略 */
    }
    window.history.replaceState(null, '', window.location.pathname)
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted
      if (Array.isArray(parsed.recipes) && Array.isArray(parsed.members)) {
        return parsed
      }
    }
  } catch {
    /* 忽略损坏数据, 回退到种子数据 */
  }
  return { recipes: seedRecipes, members: seedMembers }
}

function contentOf(r: Recipe): RecipeContent {
  return {
    name: r.name,
    successKeys: r.successKeys,
    ingredients: r.ingredients,
    steps: r.steps,
    stage: r.stage,
    type: r.type,
    tags: r.tags,
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [{ recipes, members }, setState] = useState<Persisted>(loadInitial)
  const currentUser = members.find((m) => m.id === 'm-mom') ?? members[0]

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ recipes, members }))
    } catch {
      /* 存储不可用时静默降级为内存模式 */
    }
  }, [recipes, members])

  const getRecipe = useCallback(
    (id: string) => recipes.find((r) => r.id === id),
    [recipes],
  )

  const quickCapture = useCallback(
    (content: RecipeContent) => {
      const now = nowIso()
      const recipe: Recipe = {
        ...content,
        id: uid('r-'),
        family: FAMILY_NAME,
        createdBy: currentUser.name,
        createdAt: now,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [
          {
            id: uid('rev-'),
            author: currentUser.name,
            time: now,
            summary: '初次收录',
            snapshot: content,
          },
        ],
      }
      setState((s) => ({ ...s, recipes: [recipe, ...s.recipes] }))
      return recipe
    },
    [currentUser],
  )

  const savePending = useCallback(
    (name: string) => {
      const now = nowIso()
      const recipe: Recipe = {
        id: uid('r-'),
        family: FAMILY_NAME,
        name,
        successKeys: [],
        ingredients: [],
        steps: [],
        type: undefined,
        stage: undefined,
        tags: [],
        createdBy: currentUser.name,
        createdAt: now,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [],
      }
      setState((s) => ({ ...s, recipes: [recipe, ...s.recipes] }))
      return recipe
    },
    [currentUser],
  )

  /** 把待补条目补全成功关键后转为正式家庭食谱 */
  const completePending = useCallback(
    (id: string, content: RecipeContent) => {
      const target = recipes.find((r) => r.id === id)
      if (!target) return undefined
      const now = nowIso()
      const next: Recipe = {
        ...target,
        ...content,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [
          ...target.revisions,
          {
            id: uid('rev-'),
            author: currentUser.name,
            time: now,
            summary: '补充成功关键，转为正式食谱',
            snapshot: content,
          },
        ],
      }
      setState((s) => ({
        ...s,
        recipes: s.recipes.map((r) => (r.id === id ? next : r)),
      }))
      return next
    },
    [recipes, currentUser],
  )

  const updateRecipe = useCallback(
    (id: string, content: RecipeContent, summary: string) => {
      const target = recipes.find((r) => r.id === id)
      if (!target) return undefined
      const now = nowIso()
      const next: Recipe = {
        ...target,
        ...content,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [
          ...target.revisions,
          { id: uid('rev-'), author: currentUser.name, time: now, summary, snapshot: content },
        ],
      }
      setState((s) => ({
        ...s,
        recipes: s.recipes.map((r) => (r.id === id ? next : r)),
      }))
      return next
    },
    [recipes, currentUser],
  )

  /** 恢复旧版本: 用快照生成一条新的修订记录, 不删除历史 */
  const restoreRevision = useCallback(
    (id: string, revisionId: string) => {
      const target = recipes.find((r) => r.id === id)
      const rev = target?.revisions.find((v) => v.id === revisionId)
      if (!target || !rev) return
      const now = nowIso()
      const next: Recipe = {
        ...target,
        ...rev.snapshot,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [
          ...target.revisions,
          {
            id: uid('rev-'),
            author: currentUser.name,
            time: now,
            summary: `恢复 ${rev.author} 的版本`,
            snapshot: rev.snapshot,
          },
        ],
      }
      setState((s) => ({
        ...s,
        recipes: s.recipes.map((r) => (r.id === id ? next : r)),
      }))
    },
    [recipes, currentUser],
  )

  const duplicateRecipe = useCallback(
    (id: string) => {
      const target = recipes.find((r) => r.id === id)
      if (!target) return undefined
      const now = nowIso()
      const copy: Recipe = {
        ...target,
        id: uid('r-'),
        name: `${target.name}（副本）`,
        createdBy: currentUser.name,
        createdAt: now,
        updatedBy: currentUser.name,
        updatedAt: now,
        revisions: [
          {
            id: uid('rev-'),
            author: currentUser.name,
            time: now,
            summary: `复制自「${target.name}」`,
            snapshot: contentOf(target),
          },
        ],
      }
      setState((s) => ({ ...s, recipes: [copy, ...s.recipes] }))
      return copy
    },
    [recipes, currentUser],
  )

  /** 删除待补条目（正式食谱不提供删除入口） */
  const removeRecipe = useCallback((id: string) => {
    setState((s) => ({ ...s, recipes: s.recipes.filter((r) => r.id !== id) }))
  }, [])

  const searchRecipes = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return recipes
      return recipes.filter((r) => {
        const haystack = [
          r.name,
          ...r.successKeys,
          r.type ?? '',
          r.stage ?? '',
          ...r.tags,
          ...r.ingredients.map((i) => i.name),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    },
    [recipes],
  )

  const formalRecipes = useMemo(
    () =>
      recipes
        .filter(isFormal)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [recipes],
  )

  const pendingRecipes = useMemo(
    () =>
      recipes
        .filter((r) => !isFormal(r))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [recipes],
  )

  const value = useMemo<StoreValue>(
    () => ({
      recipes,
      members,
      currentUser,
      formalRecipes,
      pendingRecipes,
      getRecipe,
      quickCapture,
      savePending,
      completePending,
      updateRecipe,
      restoreRevision,
      duplicateRecipe,
      removeRecipe,
      searchRecipes,
    }),
    [
      recipes,
      members,
      currentUser,
      formalRecipes,
      pendingRecipes,
      getRecipe,
      quickCapture,
      savePending,
      completePending,
      updateRecipe,
      restoreRevision,
      duplicateRecipe,
      removeRecipe,
      searchRecipes,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用')
  return ctx
}
