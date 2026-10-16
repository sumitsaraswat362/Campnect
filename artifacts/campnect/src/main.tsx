import './demo/networkGuard'
import { DEMO_MODE } from './demo/config'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App'
import { initCapacitorPlugins } from './capacitor/plugins'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { registerPwa } from './pwa/registerPwa'
import { resolveKeyboardViewportMetrics } from './utils/keyboardViewport'

/**
 * Boot Capacitor native plugins (StatusBar, SplashScreen, OneSignal)
 * before mounting React.  This is a no-op in a normal browser — the guard
 * inside initCapacitorPlugins() checks Capacitor.isNativePlatform().
 */
if (!DEMO_MODE) initCapacitorPlugins().catch(console.warn)

// The web build is installable from supported browsers. Capacitor already owns
// the native app lifecycle and must never be controlled by a service worker.
if (!DEMO_MODE && !Capacitor.isNativePlatform()) {
  registerPwa()
}

// Android WebView otherwise exposes the browser text-selection toolbar when a
// user holds regular app content. Keep native interactions app-like without
// breaking copy/paste inside fields and other editable controls.
if (typeof document !== 'undefined' && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app')

  const isEditableTarget = (target: EventTarget | null) => {
    const element = target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
    return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
  }

  const preventBrowserInteraction = (event: Event) => {
    if (!isEditableTarget(event.target)) event.preventDefault()
  }

  document.addEventListener('contextmenu', preventBrowserInteraction, true)
  document.addEventListener('selectstart', preventBrowserInteraction, true)
  document.addEventListener('dragstart', preventBrowserInteraction, true)
}

// Keep fixed composers and editors above the Android/iOS software keyboard.
// Android may resize both window.innerHeight and visualViewport when the IME
// opens, so compare against a stable baseline instead of the current window
// height (which would make the calculated keyboard height zero).
if (typeof window !== 'undefined') {
  let viewportBaseline = window.innerHeight
  let lastWidth = window.innerWidth
  let nativeKeyboardOffset: number | null = null
  let keyboardWasOpen = false

  const setKeyboardMetrics = (offset: number, fullHeight = offset) => {
    const safeOffset = Math.max(0, Math.round(offset))
    const safeFullHeight = Math.max(0, Math.round(fullHeight))
    const keyboardIsOpen = safeFullHeight > 80
    const keyboardJustOpened = keyboardIsOpen && !keyboardWasOpen

    // Chat must measure whether it is following the latest message before
    // keyboard clearance expands the scroller's content. It schedules the
    // scroll for the next frame, after these CSS variables take effect.
    if (keyboardJustOpened) {
      window.dispatchEvent(new CustomEvent('campnect:keyboard-visibility', {
        detail: { open: true },
      }))
    }

    document.documentElement.style.setProperty('--keyboard-offset', `${safeOffset}px`)
    document.documentElement.style.setProperty('--keyboard-height', `${safeFullHeight}px`)
    document.documentElement.style.setProperty('--keyboard-open', keyboardIsOpen ? '1' : '0')
    document.documentElement.classList.toggle('keyboard-open', keyboardIsOpen)
    if (keyboardIsOpen !== keyboardWasOpen) {
      keyboardWasOpen = keyboardIsOpen
      if (!keyboardIsOpen) {
        window.dispatchEvent(new CustomEvent('campnect:keyboard-visibility', {
          detail: { open: false },
        }))
      }
    }
  }

  const updateVisualViewport = () => {
    const viewport = window.visualViewport
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight))
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0))
    document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`)
    document.documentElement.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`)
  }

  const updateKeyboardOffset = () => {
    updateVisualViewport()
    const viewport = window.visualViewport
    const widthChanged = Math.abs(window.innerWidth - lastWidth) > 80
    if (widthChanged) lastWidth = window.innerWidth

    const metrics = resolveKeyboardViewportMetrics({
      baselineHeight: viewportBaseline,
      innerHeight: window.innerHeight,
      visualHeight: viewport?.height,
      visualOffsetTop: viewport?.offsetTop,
      widthChanged,
      nativeKeyboardHeight: nativeKeyboardOffset,
    })
    viewportBaseline = metrics.baselineHeight
    document.documentElement.style.setProperty('--stable-viewport-height', `${Math.round(viewportBaseline)}px`)
    setKeyboardMetrics(metrics.visibleOffset, metrics.fullHeight)
  }

  window.addEventListener('resize', updateKeyboardOffset)
  window.visualViewport?.addEventListener('resize', updateKeyboardOffset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardOffset)
  updateKeyboardOffset()

  // Capacitor reports the actual IME height on Android. This is more reliable
  // than viewport measurements because some devices resize window.innerHeight,
  // some resize visualViewport, and some do both. The plugin is native-only;
  // never call it in the browser preview.
  if (Capacitor.isNativePlatform()) {
    void Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
      nativeKeyboardOffset = keyboardHeight
        updateKeyboardOffset()
    })
    void Keyboard.addListener('keyboardDidShow', ({ keyboardHeight }) => {
      nativeKeyboardOffset = keyboardHeight
        updateKeyboardOffset()
    })
    void Keyboard.addListener('keyboardWillHide', () => {
      nativeKeyboardOffset = null
      setKeyboardMetrics(0)
      updateKeyboardOffset()
    })
    void Keyboard.addListener('keyboardDidHide', () => {
      nativeKeyboardOffset = null
      setKeyboardMetrics(0)
      updateKeyboardOffset()
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
