import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAdjacentRoot,
  isDeliberateRootSwipe,
  resolveRootSwipeDestination,
  ROOT_SWIPE_CHILD_SELECTOR,
  ROOT_SWIPE_PATHS,
} from './useRootSwipeNavigation.ts'

for (const [root, destination] of [
  ['/app/feed', '/app/search'],
  ['/app/search', '/app/glimpse'],
  ['/app/glimpse', '/app/clips'],
  ['/app/clips', '/app/profile'],
] as const) {
  test(`${root} right swipe selects ${destination}`, () => {
    assert.equal(getAdjacentRoot(root, 'right'), destination)
  })
}

for (const [root, destination] of [
  ['/app/profile', '/app/clips'],
  ['/app/clips', '/app/glimpse'],
  ['/app/glimpse', '/app/search'],
  ['/app/search', '/app/feed'],
] as const) {
  test(`${root} left swipe selects ${destination}`, () => {
    assert.equal(getAdjacentRoot(root, 'left'), destination)
  })
}

test('boundaries do not wrap and Events is excluded', () => {
  assert.equal(getAdjacentRoot('/app/feed', 'left'), null)
  assert.equal(getAdjacentRoot('/app/profile', 'right'), null)
  assert.equal(getAdjacentRoot('/app/events', 'right'), null)
  assert.deepEqual(ROOT_SWIPE_PATHS, [
    '/app/feed', '/app/search', '/app/glimpse', '/app/clips', '/app/profile',
  ])
})

test('only an exact root without an active overlay can switch', () => {
  assert.equal(resolveRootSwipeDestination('/app/feed', '', 'right', false), '/app/search')
  assert.equal(resolveRootSwipeDestination('/app/clips', '', 'right', false), '/app/profile')
  assert.equal(resolveRootSwipeDestination('/app/post/post-1', '', 'right', false), null)
  assert.equal(resolveRootSwipeDestination('/app/glimpse', '?open=story-1', 'right', false), null)
  assert.equal(resolveRootSwipeDestination('/app/feed', '', 'right', true), null)
})

test('vertical and short movements do not qualify as root swipes', () => {
  assert.equal(isDeliberateRootSwipe(30, 0, 400), false)
  assert.equal(isDeliberateRootSwipe(80, 90, 400), false)
  assert.equal(isDeliberateRootSwipe(100, 20, 400), true)
})

test('true controls and explicit gesture owners are excluded from root swipes', () => {
  for (const selector of [
    '[data-swipe-ignore]',
    'button',
    'input',
    'textarea',
    '[contenteditable]',
    '[draggable="true"]',
  ]) {
    assert.ok(ROOT_SWIPE_CHILD_SELECTOR.includes(selector))
  }
})

test('ordinary clickable root cards are not blanket-rejected by semantic roles', () => {
  assert.ok(!ROOT_SWIPE_CHILD_SELECTOR.includes('[role="button"]'))
  assert.ok(!ROOT_SWIPE_CHILD_SELECTOR.includes('[role="tab"]'))
  assert.ok(!ROOT_SWIPE_CHILD_SELECTOR.includes('[role="link"]'))
  assert.ok(!ROOT_SWIPE_CHILD_SELECTOR.includes('video'))
})