/**
 * 多模态识别返回的临时食谱草稿。
 *
 * 该结构只用于“识别结果 -> 编辑页预填”，不会绕过用户确认直接写入家庭食谱。
 */
export interface RecipeImportIngredient {
  name: string
  amount: string
  primary: boolean
}

export interface RecipeImportStep {
  text: string
}

export interface RecipeImportDraft {
  name: string
  successKeys: string[]
  ingredients: RecipeImportIngredient[]
  steps: RecipeImportStep[]
  type: string
  stage: string
  warnings: string[]
}
