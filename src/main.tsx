import { ThemeProvider } from './ThemeProvider'
import { LanguageProvider } from './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionBrowserRouter } from './MotionBrowserRouter'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import {
  foldTransitionNativeConfig,
  loadFoldTransitionSettings,
} from './foldTransition'
import { configureNativeFoldTransition } from './nativeBridge'
import { installNativeInsetsBridge } from './nativeInsets'
import { isNativePlatform, shouldRegisterServiceWorker } from './nativeRuntime'
import { installTextSelectionGuard } from './textSelection'
import './styles.css'

installNativeInsetsBridge()
installTextSelectionGuard()
// Native starts with its compiled defaults; this pushes the saved choices.
configureNativeFoldTransition(
  foldTransitionNativeConfig(loadFoldTransitionSettings()),
).catch((error: unknown) =>
  console.warn('Fold transition settings were not applied', error),
)

if (shouldRegisterServiceWorker(isNativePlatform())) {
  registerSW({ immediate: true })
} else {
  document.documentElement.classList.add('native-platform')
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <MotionBrowserRouter>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </MotionBrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)
