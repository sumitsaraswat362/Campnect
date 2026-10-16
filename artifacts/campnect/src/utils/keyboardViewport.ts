export type KeyboardViewportInput = {
  baselineHeight: number
  innerHeight: number
  visualHeight?: number
  visualOffsetTop?: number
  widthChanged: boolean
  nativeKeyboardHeight: number | null
}

export type KeyboardViewportMetrics = {
  baselineHeight: number
  visibleOffset: number
  fullHeight: number
}

export function shouldAnchorLatestMessage({
  scrollTop,
  scrollHeight,
  clientHeight,
  threshold = 72,
}: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  threshold?: number
}) {
  return Math.max(0, scrollHeight - clientHeight - scrollTop) <= threshold
}

export function resolveKeyboardViewportMetrics({
  baselineHeight,
  innerHeight,
  visualHeight = innerHeight,
  visualOffsetTop = 0,
  widthChanged,
  nativeKeyboardHeight,
}: KeyboardViewportInput): KeyboardViewportMetrics {
  const currentHeight = Math.min(innerHeight, visualHeight)
  const nextBaseline = widthChanged
    ? innerHeight
    : nativeKeyboardHeight === null
      ? Math.max(baselineHeight, innerHeight, currentHeight)
      : baselineHeight
  const viewportShrink = Math.max(0, nextBaseline - currentHeight - visualOffsetTop)

  if (nativeKeyboardHeight === null) {
    return {
      baselineHeight: nextBaseline,
      visibleOffset: viewportShrink,
      fullHeight: viewportShrink,
    }
  }

  // A material VisualViewport/layout shrink means this WebView has already
  // moved fixed UI above the IME. Native values can arrive before, after, or
  // in a different unit from that resize on Android; applying any remainder
  // would lift fixed sheets a second time. The CSS viewport edge is the
  // authoritative visible keyboard boundary in this mode.
  if (viewportShrink > 80) {
    return {
      baselineHeight: nextBaseline,
      visibleOffset: 0,
      fullHeight: viewportShrink,
    }
  }

  return {
    baselineHeight: nextBaseline,
    visibleOffset: nativeKeyboardHeight,
    fullHeight: nativeKeyboardHeight,
  }
}
