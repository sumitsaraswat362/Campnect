export function createPresenceRegistry() {
  const socketsByUser = new Map<string, Set<string>>()

  return {
    connect(userId: string, socketId: string) {
      const sockets = socketsByUser.get(userId) || new Set<string>()
      const wasOnline = sockets.size > 0
      sockets.add(socketId)
      socketsByUser.set(userId, sockets)
      return { wasOnline, connectionCount: sockets.size }
    },
    disconnect(userId: string, socketId: string) {
      const sockets = socketsByUser.get(userId)
      if (!sockets) return { becameOffline: false, connectionCount: 0 }
      sockets.delete(socketId)
      if (sockets.size > 0) return { becameOffline: false, connectionCount: sockets.size }
      socketsByUser.delete(userId)
      return { becameOffline: true, connectionCount: 0 }
    },
    isOnline(userId: string) {
      return (socketsByUser.get(userId)?.size || 0) > 0
    },
  }
}

export const activePresence = createPresenceRegistry()