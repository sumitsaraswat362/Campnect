import type { NativeBackEvent } from './nativeBackEvent'

export type AppBackRequestHandler = (nativeEvent?: NativeBackEvent) => void

let activeHandler: AppBackRequestHandler | null = null

export function registerAppBackHandler(handler: AppBackRequestHandler) {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export function dispatchAppBack(nativeEvent?: NativeBackEvent) {
  if (!activeHandler) return false
  activeHandler(nativeEvent)
  return true
}

export function requestAppBack() {
  return dispatchAppBack()
}