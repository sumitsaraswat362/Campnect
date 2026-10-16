export interface PresenceMember {
  id: string
  is_online: number
  last_seen?: string
}

export interface PresenceConversation<TMember extends PresenceMember = PresenceMember> {
  members: TMember[]
}

export interface PresenceSnapshot {
  online: boolean
  lastSeen?: string
}

export function updateConversationPresence<
  TMember extends PresenceMember,
  TConversation extends PresenceConversation<TMember>,
>(
  conversations: TConversation[],
  userId: string,
  online: boolean,
  lastSeen?: string,
): TConversation[] {
  let changed = false
  const next = conversations.map((conversation) => {
    let membersChanged = false
    const members = conversation.members.map((member) => {
      if (member.id !== userId) return member
      membersChanged = true
      return {
        ...member,
        is_online: online ? 1 : 0,
        ...(lastSeen ? { last_seen: lastSeen } : {}),
      }
    })
    if (!membersChanged) return conversation
    changed = true
    return { ...conversation, members }
  })
  return changed ? next : conversations
}

export function reconcileFetchedConversationPresence<
  TMember extends PresenceMember,
  TConversation extends PresenceConversation<TMember>,
>(
  conversations: TConversation[],
  presenceByUser: Record<string, PresenceSnapshot>,
): TConversation[] {
  return Object.entries(presenceByUser).reduce(
    (next, [userId, presence]) => updateConversationPresence(next, userId, presence.online, presence.lastSeen),
    conversations,
  )
}

export function isConversationMemberOnline(member: PresenceMember | undefined, onlineUsers: ReadonlySet<string>) {
  return Boolean(member && (onlineUsers.has(member.id) || member.is_online === 1))
}