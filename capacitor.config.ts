import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'club.a_dobe.alma',
  appName: 'Alma',
  webDir: 'dist',
  backgroundColor: '#080b0d',
  loggingBehavior: 'none',
  android: {
    allowMixedContent: false,
    backgroundColor: '#080b0d',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
    },
    SystemBars: {
      insetsHandling: 'disable',
      initialViewportFitValueHint: 'cover',
    },
    StatusBar: {
      backgroundColor: '#080b0d',
      style: 'DARK',
      overlaysWebView: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_alma',
    },
  },
}

export default config
