import { parseSharedPostPayload } from './sharedPostPayload'

export type ReplyReferenceDestination =
  | { kind: 'post'; postId: string }
  | { kind: 'message'; messageId: string }

export function getReplyReferenceDestination({
  messageId,
  content,
}: {
  messageId: string
  content?: string | null
}): ReplyReferenceDestination {
  const postId = parseSharedPostPayload(content)?.postId
  return postId ? { kind: 'post', postId } : { kind: 'message', messageId }
}