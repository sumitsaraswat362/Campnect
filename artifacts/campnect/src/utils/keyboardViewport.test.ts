import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveKeyboardViewportMetrics, shouldAnchorLatestMessage } from './keyboardViewport'

test('resized layout viewport reports the full keyboard occlusion', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 800,
    innerHeight: 500,
    visualHeight: 500,
    widthChanged: false,
    nativeKeyboardHeight: null,
  }), {
    baselineHeight: 800,
    visibleOffset: 300,
    fullHeight: 300,
  })
})

test('visual viewport-only resize reports the full keyboard occlusion', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 800,
    innerHeight: 800,
    visualHeight: 500,
    widthChanged: false,
    nativeKeyboardHeight: null,
  }), {
    baselineHeight: 800,
    visibleOffset: 300,
    fullHeight: 300,
  })
})

test('native overlay keyboard remains fully visible to local overlays', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 800,
    innerHeight: 800,
    visualHeight: 800,
    widthChanged: false,
    nativeKeyboardHeight: 300,
  }), {
    baselineHeight: 800,
    visibleOffset: 300,
    fullHeight: 300,
  })
})

test('combined native and viewport resize signals are not doubled', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 800,
    innerHeight: 500,
    visualHeight: 500,
    widthChanged: false,
    nativeKeyboardHeight: 300,
  }), {
    baselineHeight: 800,
    visibleOffset: 0,
    fullHeight: 300,
  })
})

test('prefers a resized CSS viewport over every native keyboard value', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 900,
    innerHeight: 500,
    visualHeight: 500,
    widthChanged: false,
    nativeKeyboardHeight: 800,
  }), {
    baselineHeight: 900,
    visibleOffset: 0,
    fullHeight: 400,
  })
})

test('does not add native keyboard remainder to an already resized viewport', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 900,
    innerHeight: 500,
    visualHeight: 500,
    widthChanged: false,
    nativeKeyboardHeight: 470,
  }), {
    baselineHeight: 900,
    visibleOffset: 0,
    fullHeight: 400,
  })
})

test('a width change establishes a new stable viewport baseline', () => {
  assert.deepEqual(resolveKeyboardViewportMetrics({
    baselineHeight: 800,
    innerHeight: 480,
    visualHeight: 480,
    widthChanged: true,
    nativeKeyboardHeight: null,
  }), {
    baselineHeight: 480,
    visibleOffset: 0,
    fullHeight: 0,
  })
})

test('latest-message anchoring applies only when already near the bottom', () => {
  assert.equal(shouldAnchorLatestMessage({
    scrollTop: 928,
    scrollHeight: 1600,
    clientHeight: 600,
  }), true)
  assert.equal(shouldAnchorLatestMessage({
    scrollTop: 700,
    scrollHeight: 1600,
    clientHeight: 600,
  }), false)
})
