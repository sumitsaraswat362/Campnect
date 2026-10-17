export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const serviceWorkerUrl = `${import.meta.env.BASE_URL}sw.js`

    navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: import.meta.env.BASE_URL,
    }).then((registration) => {
      // Check for an updated app shell whenever the installed app starts.
      void registration.update()
    }).catch((error) => {
      console.warn('Campnect service worker registration failed', error)
    })
  }, { once: true })
}