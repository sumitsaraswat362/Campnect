function previewForMessage(message: any): string {
  if (message.type === 'text' && message.content?.startsWith('__POST_SHARE__:')) {
    return 'Shared a post'
  }
  return message.type === 'text'
    ? String(message.content || '').slice(0, 80)
    : `[${message.type}]`
}

export async function refreshConversationPreview(
  runner: { one: (sql: string, params?: any[]) => Promise<any>; run: (sql: string, params?: any[]) => Promise<any> },
  conversationId: string,
) {
  const latest = await runner.one(
    `SELECT id, type, content, created_at
     FROM messages
     WHERE conversation_id = $1 AND is_deleted = 0
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [conversationId],
  )

  await runner.run(
    `UPDATE conversations
     SET last_message_id = $1,
         last_message_preview = $2,
         last_message_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    latest
      ? [latest.id, previewForMessage(latest), latest.created_at, conversationId]
      : [null, null, null, conversationId],
  )
}