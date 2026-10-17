import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.campnect.app',
  appName: 'Campnect',

  // The web artifact owns the React app and emits Vite output here.
  webDir: 'artifacts/campnect/dist/public',

  server: {
    androidScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#07120B',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    // The app supplies safe-area CSS variables itself. Avoid injecting them
    // before documentElement exists on slower Android WebViews.
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
}

export default config