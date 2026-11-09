import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ritmo.habitos',
  appName: 'Ritmo',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#171d19',
      style: 'DARK',
    },
  },
}

export default config
