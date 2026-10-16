import React from 'react'

type PinchPoint = { x: number; y: number }

interface TemporaryPinchZoomOptions {
  maxScale?: number
  onPinchChange?: (pinching: boolean) => void
}

function distance(points: PinchPoint[]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

export function useTemporaryPinchZoom({
  maxScale = 4,
  onPinchChange,
}: TemporaryPinchZoomOptions = {}) {
  const pointersRef = React.useRef(new Map<number, PinchPoint>())
  const startDistanceRef = React.useRef(0)
  const activeRef = React.useRef(false)
  const suppressClickUntilRef = React.useRef(0)
  const onPinchChangeRef = React.useRef(onPinchChange)
  const [scale, setScale] = React.useState(1)
  const [origin, setOrigin] = React.useState('50% 50%')
  const [pinching, setPinching] = React.useState(false)

  onPinchChangeRef.current = onPinchChange

  const reset = React.useCallback(() => {
    if (activeRef.current) onPinchChangeRef.current?.(false)
    activeRef.current = false
    startDistanceRef.current = 0
    setPinching(false)
    setScale(1)
    setOrigin('50% 50%')
  }, [])

  React.useEffect(() => reset, [reset])

  const startPinch = React.useCallback((element: HTMLElement) => {
    const points = Array.from(pointersRef.current.values()).slice(0, 2)
    if (points.length < 2) return
    const rect = element.getBoundingClientRect()
    const midpointX = (points[0].x + points[1].x) / 2
    const midpointY = (points[0].y + points[1].y) / 2
    const originX = rect.width ? ((midpointX - rect.left) / rect.width) * 100 : 50
    const originY = rect.height ? ((midpointY - rect.top) / rect.height) * 100 : 50

    startDistanceRef.current = Math.max(1, distance(points))
    activeRef.current = true
    suppressClickUntilRef.current = Date.now() + 500
    setOrigin(`${Math.max(0, Math.min(100, originX))}% ${Math.max(0, Math.min(100, originY))}%`)
    setPinching(true)
    onPinchChangeRef.current?.(true)
  }, [])

  const onPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      event.preventDefault()
      startPinch(event.currentTarget)
      for (const pointerId of pointersRef.current.keys()) {
        try { event.currentTarget.setPointerCapture(pointerId) } catch {}
      }
    }
  }, [startPinch])

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!activeRef.current || pointersRef.current.size < 2) return

    event.preventDefault()
    const points = Array.from(pointersRef.current.values()).slice(0, 2)
    const nextScale = distance(points) / startDistanceRef.current
    setScale(Math.max(1, Math.min(maxScale, nextScale)))
  }, [maxScale])

  const finishPointer = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (activeRef.current && pointersRef.current.size < 2) {
      suppressClickUntilRef.current = Date.now() + 500
      reset()
    }
  }, [reset])

  const onClickCapture = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (Date.now() >= suppressClickUntilRef.current) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    pinching,
    scale,
    mediaStyle: {
      transform: `scale(${scale})`,
      transformOrigin: origin,
      transition: pinching ? 'none' : 'transform 140ms ease-out',
      willChange: pinching ? 'transform' : undefined,
    } satisfies React.CSSProperties,
    interactionStyle: {
      touchAction: 'pan-x pan-y',
    } satisfies React.CSSProperties,
    interactionProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onLostPointerCapture: finishPointer,
      onClickCapture,
    },
  }
}

interface TemporaryPinchZoomProps {
  children: React.ReactElement<React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties }>
  maxScale?: number
  onPinchChange?: (pinching: boolean) => void
}

export function TemporaryPinchZoom({
  children,
  maxScale,
  onPinchChange,
}: TemporaryPinchZoomProps) {
  const zoom = useTemporaryPinchZoom({ maxScale, onPinchChange })

  return React.cloneElement(children, {
    ...zoom.interactionProps,
    style: {
      ...children.props.style,
      ...zoom.interactionStyle,
      ...zoom.mediaStyle,
    },
  })
}