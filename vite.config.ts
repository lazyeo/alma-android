import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS is required when the app is opened from a phone over the LAN:
// WebCrypto and camera access only work in a secure context (https or localhost).
const lanHttps = process.env.ALMA_MOBILE_HTTPS === '1'

const version = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string
const sha = (() => {
  if (process.env.ALMA_BUILD_SHA)
    return process.env.ALMA_BUILD_SHA.trim().slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dev'
  }
})()
const build = `${version} ${sha}`

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@alma/extensions-installed': resolve(
        process.env.ALMA_EXTENSIONS_ENTRY || 'src/extensions/installed.ts',
      ),
      '@alma/core': resolve('src'),
    },
  },
  define: { __ALMA_BUILD__: JSON.stringify(build) },
  plugins: [
    {
      name: 'alma-build',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { name: 'alma-build', content: build },
          injectTo: 'head',
        },
      ],
    },
    ...(lanHttps ? [basicSsl()] : []),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'badge-96.png'],
      manifest: {
        name: 'Alma Mobile',
        short_name: 'Alma',
        description: 'Secure mobile access to Alma Desktop',
        theme_color: '#080b0d',
        background_color: '#080b0d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      // Screenshot fixtures do not need a service worker. Disabling its dev
      // build prevents Workbox from writing `dev-dist/` in the project root.
      devOptions: {
        enabled: mode !== 'screenshots',
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    setupFiles: ['src/i18n/testSetup.ts'],
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}))
