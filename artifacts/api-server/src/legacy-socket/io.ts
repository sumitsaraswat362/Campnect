// @ts-nocheck
import type { Server as SocketServer } from 'socket.io'
import { sendOneSignalNotification } from '../legacy-services/oneSignal.js'

let _io: SocketServer | null = null

export function setIo(io: SocketServer): void {
  _io = io
}

export function getIo(): SocketServer | null {
  return _io
}

export function emitUserNotification(userId: string, notification: Record<string, unknown>): void {
  const payload = { ...notification, user_id: userId }
  _io?.to(`user:${userId}`).emit('notification:new', payload)
  void sendOneSignalNotification(payload)
}

export function emitUserMessagePreview(userId: string, preview: Record<string, unknown>): void {
  _io?.to(`user:${userId}`).emit('message:preview', { ...preview, user_id: userId })
}
