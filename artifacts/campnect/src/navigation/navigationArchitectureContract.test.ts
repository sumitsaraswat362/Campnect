import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  destinationFromNavigationState,
  normalizeAppDestination,
} from '../utils/navigation'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('post-auth destinations accept only internal application routes', () => {
  assert.equal(
    normalizeAppDestination('/app/post/post-1?comments=open#media'),
    '/app/post/post-1?comments=open#media',
  )
  assert.equal(
    destinationFromNavigationState({
      from: { pathname: '/app/settings/account', search: '?tab=security', hash: '#password' },
    }),
    '/app/settings/account?tab=security#password',
  )
  for (const unsafe of [
    'https://evil.example/app/feed',
    '//evil.example/app/feed',
    '/login',
    '/app\\evil',
    '/app/feed\u0000',
  ]) {
    assert.equal(normalizeAppDestination(unsafe), null, unsafe)
  }
})

test('visual Back controls delegate temporary child state to the shared coordinator', () => {
  const temporaryLayerOwners = [
    '../components/feed/PostCard.tsx',
    '../screens/main/CreatePostScreen.tsx',
    '../screens/main/CreateEventScreen.tsx',
    '../screens/main/ClipCreateScreen.tsx',
    '../screens/main/CreateGlimpseScreen.tsx',
    '../screens/main/CreateGroupScreen.tsx',
    '../screens/main/MessageRequestsScreen.tsx',
    '../screens/settings/PrivacyScreen.tsx',
    '../screens/auth/ForgotPasswordScreen.tsx',
    '../screens/auth/RegisterScreen.tsx',
  ]

  for (const path of [...temporaryLayerOwners, '../screens/main/NewMessageScreen.tsx']) {
    const file = source(path)
    assert.match(file, /requestAppBack/, path)
  }
  for (const path of temporaryLayerOwners) {
    const file = source(path)
    assert.match(file, /useBackDismiss/, path)
  }
})

test('Back coordinator dismisses temporary UI before resolving the route', () => {
  const coordinator = source('./backCoordinator.ts')
  const dismissIndex = coordinator.indexOf('dismissTopOverlay()')
  const routeIndex = coordinator.indexOf('resolveRouteAction()')
  assert.ok(dismissIndex >= 0)
  assert.ok(routeIndex > dismissIndex)
})

test('BottomNav treats Create as a child action and roots as replacements', () => {
  const bottomNav = source('../components/navigation/BottomNav.tsx')
  assert.match(bottomNav, /navigateToAppRoot\(navigate, location\.pathname, path\)/)
  assert.match(bottomNav, /location\.pathname !== item\.path\) navigate\(item\.path\)/)
  assert.doesNotMatch(bottomNav, /startsWith\('\/app\/create'\).*return 'create'/)
})

test('the Create chooser keeps shared navigation while creation editors stay fullscreen', () => {
  const appShell = source('../screens/main/AppShell.tsx')
  const fullscreenRule = appShell.slice(
    appShell.indexOf('function isFullScreenRoute'),
    appShell.indexOf('export function AppShell'),
  )
  assert.match(appShell, /'\/app\/create\/'/)
  assert.doesNotMatch(fullscreenRule, /pathname === '\/app\/create'/)
  assert.match(appShell, /location\.pathname === '\/app\/create'/)
  assert.match(appShell, /\{!fullscreen && <BottomNav \/>\}/)
})

test('the Clips root keeps shared bottom navigation while Clip viewers stay fullscreen', () => {
  const appShell = source('../screens/main/AppShell.tsx')
  const fullscreenRule = appShell.slice(
    appShell.indexOf('function isFullScreenRoute'),
    appShell.indexOf('export function AppShell'),
  )
  assert.match(appShell, /const FULLSCREEN_PREFIXES[\s\S]*?'\/app\/clips\/'/)
  assert.doesNotMatch(fullscreenRule, /pathname === '\/app\/clips'/)
  assert.match(appShell, /\{!fullscreen && <BottomNav \/>\}/)
})

test('the Clips root does not reserve an immersive caption gap above shared navigation', () => {
  const clipsScreen = source('../screens/main/ClipsScreen.tsx')
  assert.match(clipsScreen, /\['--clips-bottom-clearance' as string\]: id/)
  assert.match(clipsScreen, /: 'max\(14px, var\(--sab\)\)'/)
  assert.match(clipsScreen, /\? 'max\(clamp\(56px, 8dvh, 88px\), calc\(24px \+ var\(--sab\)\)\)'/)
})

test('the Clips canvas continues behind the floating bottom navigation', () => {
  const appShell = source('../screens/main/AppShell.tsx')
  assert.match(appShell, /background: clipRoute \? '#000' : undefined/)
})

test('AppShell mounts one shared pointer-event surface for every root layout', () => {
  const appShell = source('../screens/main/AppShell.tsx')
  assert.match(appShell, /onPointerDown=\{rootSwipe\.onPointerDown\}/)
  assert.match(appShell, /onPointerMove=\{rootSwipe\.onPointerMove\}/)
  assert.match(appShell, /onPointerUp=\{rootSwipe\.onPointerUp\}/)
  assert.match(appShell, /onPointerCancel=\{rootSwipe\.onPointerCancel\}/)
})

test('the Clips root does not render a visual Back control', () => {
  const clipsScreen = source('../screens/main/ClipsScreen.tsx')
  assert.match(clipsScreen, /\{id \? \(\s*<button aria-label="Back"/)
  assert.match(clipsScreen, /showBack=\{Boolean\(id\)\}/)
})