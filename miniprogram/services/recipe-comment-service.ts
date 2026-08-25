import type { RecipeComment } from '../models/recipe'
import { callApi } from './cloud-client'
import { setCachedCommentCount } from './recipe-store'

export type CommentSort = 'newest' | 'oldest'

interface CommentListResult {
  comments: RecipeComment[]
  commentCount: number
}

interface CommentCreateResult {
  comment: RecipeComment
  commentCount: number
}

interface CommentDeleteResult {
  deletedCommentId: string
  recipeId: string
  commentCount: number
}

export async function listRecipeComments(
  recipeId: string,
  sort: CommentSort,
): Promise<CommentListResult> {
  const result = await callApi<CommentListResult>('recipeComment.list', { recipeId, sort })
  setCachedCommentCount(recipeId, result.commentCount)
  return result
}

export async function createRecipeComment(recipeId: string, content: string): Promise<CommentCreateResult> {
  const result = await callApi<CommentCreateResult>('recipeComment.create', { recipeId, content })
  setCachedCommentCount(recipeId, result.commentCount)
  return result
}

export function updateRecipeComment(commentId: string, content: string, expectedVersion: number): Promise<RecipeComment> {
  return callApi<RecipeComment>('recipeComment.update', { commentId, content, expectedVersion })
}

export async function deleteRecipeComment(commentId: string): Promise<CommentDeleteResult> {
  const result = await callApi<CommentDeleteResult>('recipeComment.delete', { commentId })
  setCachedCommentCount(result.recipeId, result.commentCount)
  return result
}
