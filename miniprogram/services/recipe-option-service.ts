import { callApi } from './cloud-client'
import { invalidateState } from './recipe-store'

export type RecipeOptionKind = 'foodType' | 'stage'

export interface ManagedRecipeOption {
  name: string
  usageCount: number
}

export interface RecipeOptionsData {
  familyName: string
  version: number
  foodTypes: ManagedRecipeOption[]
  stages: ManagedRecipeOption[]
}

export function listRecipeOptions(): Promise<RecipeOptionsData> {
  return callApi('recipeOptions.list')
}

export async function addRecipeOption(
  kind: RecipeOptionKind,
  name: string,
  expectedVersion: number,
): Promise<RecipeOptionsData> {
  const result = await callApi<RecipeOptionsData>('recipeOptions.add', { kind, name, expectedVersion })
  invalidateState()
  return result
}

export async function removeRecipeOption(
  kind: RecipeOptionKind,
  name: string,
  expectedVersion: number,
): Promise<RecipeOptionsData & { affectedCount: number }> {
  const result = await callApi<RecipeOptionsData & { affectedCount: number }>('recipeOptions.remove', {
    kind, name, expectedVersion,
  })
  invalidateState()
  return result
}
