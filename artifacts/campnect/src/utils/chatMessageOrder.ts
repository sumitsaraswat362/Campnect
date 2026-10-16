import type { Message } from '../stores/chatStore'
import { parseServerTimestamp } from './chatTimestamp'

export function orderChatMessages(messages: Message[]): Message[] {
  const unique = new Map<string, Message>()
  for (const message of messages) unique.set(message.id, message)

  return [...unique.values()].sort((left, right) => {
    const leftTime = parseServerTimestamp(left.created_at).getTime()
    const rightTime = parseServerTimestamp(right.created_at).getTime()
    const leftValid = Number.isFinite(leftTime)
    const rightValid = Number.isFinite(rightTime)
    if (leftValid && rightValid && leftTime !== rightTime) return leftTime - rightTime
    if (leftValid !== rightValid) return leftValid ? -1 : 1
    return left.id.localeCompare(right.id)
  })
}

export function mergeChatMessages(existing: Message[], incoming: Message[]): Message[] {
  const incomingIds = new Set(incoming.map((message) => message.id))
  return orderChatMessages([...existing.filter((message) => !incomingIds.has(message.id)), ...incoming])
}