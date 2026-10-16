import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAppBackRouteAction } from './BackNavigation.tsx'
import { classifyAppRoute, ROOT_TAB_PATHS } from '../utils/navigation.ts'

test('every canonical root uses root exit instead of Router Back', () => {
  for (const root of ROOT_TAB_PATHS) {
    assert.deepEqual(resolveAppBackRouteAction(root, '', 'router-entry', 'native'), { type: 'exit' }, root)
  }
})

test('Android and in-app Back classify canonical roots identically', () => {
  for (const root of ROOT_TAB_PATHS) {
    assert.deepEqual(resolveAppBackRouteAction(root, '', 'router-entry', 'ui'), { type: 'exit' }, root)
  }
})

test('a cold public in-app Back button returns to the shared app entry', () => {
  assert.deepEqual(resolveAppBackRouteAction('/login', '', 'default', 'ui'), { type: 'fallback', path: '/' })
  assert.deepEqual(resolveAppBackRouteAction('/signup', '', 'default', 'ui'), { type: 'fallback', path: '/' })
})

test('cold child routes return directly to their canonical root', () => {
  const cases = new Map([
    ['/app/post/post-1', '/app/feed'],
    ['/app/settings/account', '/app/profile'],
    ['/app/profile/alice/followers', '/app/search'],
    ['/app/search/id-suggestions', '/app/search'],
    ['/app/events/event-1/attendees', '/app/events'],
    ['/app/clips/clip-1', '/app/clips'],
    ['/app/glimpse/glimpse-1', '/app/glimpse'],
    ['/app/chat/conversation-1/info', '/app/feed'],
  ])
  for (const [pathname, root] of cases) {
    assert.deepEqual(
      resolveAppBackRouteAction(pathname, '', 'default', 'ui'),
      { type: 'fallback', path: root },
      pathname,
    )
  }
})

test('ordinary nested routes use React Router history', () => {
  for (const pathname of [
    '/app/profile/alice',
    '/app/post/post-1',
    '/app/clips/clip-1',
    '/app/glimpse/glimpse-1',
    '/app/events/event-1',
    '/app/chat/conversation-1',
    '/app/settings/privacy',
  ]) {
    assert.deepEqual(resolveAppBackRouteAction(pathname, '', 'router-entry', 'native'), { type: 'history' }, pathname)
  }
})

test('cold child fallback never invents an intermediate route', () => {
  assert.deepEqual(
    resolveAppBackRouteAction('/app/settings/account', '', 'default', 'native'),
    { type: 'fallback', path: '/app/profile' },
  )
})

test('a child reached by replace falls to its canonical root', () => {
  for (const source of ['ui', 'native'] as const) {
    assert.deepEqual(
      resolveAppBackRouteAction('/app/post/post-1', '', 'replacement-key', source, 'REPLACE'),
      { type: 'fallback', path: '/app/feed' },
    )
    assert.deepEqual(
      resolveAppBackRouteAction('/app/settings/account', '', 'replacement-key', source, 'REPLACE'),
      { type: 'fallback', path: '/app/profile' },
    )
  }
})

test('a pushed child uses Router history', () => {
  assert.deepEqual(
    resolveAppBackRouteAction('/app/post/post-1', '', 'child-key', 'native', 'PUSH'),
    { type: 'history' },
  )
})

test('query-backed Glimpse viewer state is not classified as a canonical root', () => {
  assert.deepEqual(resolveAppBackRouteAction('/app/glimpse', '?open=glimpse-1', 'router-entry', 'native'), { type: 'history' })
  assert.deepEqual(
    resolveAppBackRouteAction('/app/glimpse', '?open=glimpse-1', 'default', 'native'),
    { type: 'fallback', path: '/app/glimpse' },
  )
})

test('each root can push a nested destination that returns through Router history', () => {
  const nestedByRoot: Record<string, string> = {
    '/app/feed': '/app/post/post-1',
    '/app/search': '/app/profile/alice',
    '/app/events': '/app/events/event-1',
    '/app/glimpse': '/app/glimpse/glimpse-1',
    '/app/clips': '/app/clips/clip-1',
    '/app/profile': '/app/settings',
  }

  for (const [root, nested] of Object.entries(nestedByRoot)) {
    assert.deepEqual(resolveAppBackRouteAction(root, '', 'root-key'), { type: 'exit' }, root)
    assert.deepEqual(resolveAppBackRouteAction(nested, '', 'nested-key'), { type: 'history' }, nested)
  }
})

test('deep nested routes unwind through Router history at every level', () => {
  for (const pathname of [
    '/app/profile/alice',
    '/app/post/post-1',
    '/app/post/post-1?comments=open',
    '/app/profile/bob',
    '/app/settings/privacy',
  ]) {
    const [path, query = ''] = pathname.split('?')
    assert.deepEqual(
      resolveAppBackRouteAction(path, query ? `?${query}` : '', 'nested-key'),
      { type: 'history' },
      pathname,
    )
  }
})

test('central route classification never treats child URLs as roots', () => {
  assert.equal(classifyAppRoute('/app/profile', '').kind, 'root')
  assert.deepEqual(classifyAppRoute('/app/profile/alice', ''), { kind: 'child', fallback: '/app/search' })
  assert.deepEqual(classifyAppRoute('/app/search/id-suggestions', ''), { kind: 'child', fallback: '/app/search' })
  assert.deepEqual(classifyAppRoute('/app/clips/123', ''), { kind: 'child', fallback: '/app/clips' })
  assert.deepEqual(classifyAppRoute('/app/glimpse', '?open=123'), { kind: 'child', fallback: '/app/glimpse' })
})

test('cold Help articles fall to Help, while cold Help retains its settings fallback', () => {
  for (const source of ['ui', 'native'] as const) {
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help/article/cant-log-in', '', 'default', source),
      { type: 'fallback', path: '/app/settings/help' })
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help', '', 'default', source),
      { type: 'fallback', path: '/app/profile' })
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help', '', 'help-key', source, 'PUSH'),
      { type: 'history' })
  }
})

test('related article replacement unwinds to the existing Help entry without an article chain', () => {
  for (const source of ['ui', 'native'] as const) {
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help/article/forgot-password', '', 'article-key',
      source, 'REPLACE', { helpFromHome: true }), { type: 'history' })
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help/article/forgot-password', '', 'article-key',
      source, 'REPLACE'), { type: 'fallback', path: '/app/settings/help' })
    assert.deepEqual(resolveAppBackRouteAction('/app/settings/help/article/forgot-password', '', 'default',
      source, 'REPLACE', { helpFromHome: true }), { type: 'fallback', path: '/app/settings/help' })
  }
})