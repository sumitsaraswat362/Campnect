import assert from 'node:assert/strict'
import test from 'node:test'
import type { NavigateFunction } from 'react-router-dom'
import { navigateToAppRoot } from './appSectionNavigation.ts'
import { ROOT_TAB_PATHS } from '../utils/navigation.ts'

function recordRootTransitions(paths: string[]) {
  const calls: Array<{ to: unknown; options: unknown }> = []
  const navigate = ((to: unknown, options?: unknown) => {
    calls.push({ to, options })
  }) as NavigateFunction
  for (let index = 1; index < paths.length; index++) {
    const previous = paths[index - 1]
    const next = paths[index]
    assert.equal(navigateToAppRoot(navigate, previous, next), true)
  }

  return { calls }
}

for (const section of ['/app/search', '/app/events', '/app/glimpse', '/app/clips', '/app/profile']) {
test(`root to ${section} replaces without navigation state`, () => {
    const { calls } = recordRootTransitions(['/app/feed', section])

    assert.equal(calls[0].to, section)
    assert.deepEqual(calls[0].options, { replace: true })
  })
}

test('each canonical root pair replaces rather than building a tab Back stack', () => {
  const paths = ['/app/feed', '/app/search', '/app/events']
  const { calls } = recordRootTransitions(paths)

  assert.deepEqual(calls.map(({ to, options }) => ({ to, replace: (options as any).replace })), [
    { to: '/app/search', replace: true },
    { to: '/app/events', replace: true },
  ])
})

test('a deep nested branch can be replaced by a root without navigation metadata', () => {
  const calls: Array<{ to: unknown; options: unknown }> = []
  const navigate = ((to: unknown, options?: unknown) => calls.push({ to, options })) as NavigateFunction

  assert.equal(
    navigateToAppRoot(navigate, '/app/post/post-1', '/app/clips'),
    true,
  )
  assert.deepEqual(calls, [{ to: '/app/clips', options: { replace: true } }])
})

for (const origin of ROOT_TAB_PATHS) {
  for (const destination of ROOT_TAB_PATHS) {
    if (origin === destination) continue
    test(`${origin} to ${destination} is a root replacement`, () => {
      const calls: Array<{ to: unknown; options: unknown }> = []
      const navigate = ((to: unknown, options?: unknown) => calls.push({ to, options })) as NavigateFunction
      assert.equal(navigateToAppRoot(navigate, origin, destination), true)
      assert.equal(calls[0].to, destination)
      assert.equal((calls[0].options as any).replace, true)
    })
  }
}

test('tapping the active section does not create duplicate history', () => {
  const calls: unknown[] = []
  const navigate = ((...args: unknown[]) => calls.push(args)) as NavigateFunction

  assert.equal(navigateToAppRoot(navigate, '/app/clips', '/app/clips'), false)
  assert.deepEqual(calls, [])
})

for (const invalidRoot of ['/app', '/app/feed/', '/app/feed?tab=latest', '/app/profile/alice', '/app/clips/123']) {
  test(`${invalidRoot} is not accepted as an application root`, () => {
    const navigate = (() => {}) as NavigateFunction
    assert.throws(
      () => navigateToAppRoot(navigate, '/app/feed', invalidRoot),
      /Invalid application root/,
    )
  })
}