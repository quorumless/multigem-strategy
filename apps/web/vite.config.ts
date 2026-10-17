/// <reference types="vitest/config" />
import fs from 'fs'
import path from 'path'
import { spawn } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'

// Real data (local-only, gitignored) if present, else the synthetic sample committed to the repo.
const dataDir = ['processed', 'sample']
  .map((d) => path.resolve(__dirname, '../../data', d))
  .find((d) => fs.existsSync(path.join(d, 'monthly.csv')))

const sampleAtStart = dataDir === undefined || path.basename(dataDir) === 'sample'

// Dev-server only (apply: 'serve'): POST /__data/refresh runs the data pipeline. Never in the static build.
function dataRefresh(): Plugin {
  let busy = false
  return {
    name: 'data-refresh',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__data/refresh', (req, res) => {
        const send = (code: number, body: object) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { ok: false, log: 'POST only' })
        // CSRF guard: a cross-site page must not be able to trigger the run.
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { ok: false, log: 'Bad origin' })
        if (busy) return send(409, { ok: false, log: 'A refresh is already running' })
        busy = true
        let out = ''
        const child = spawn('pnpm', ['data:refresh'], { cwd: path.resolve(__dirname, '../..') })
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (out += d))
        child.on('error', (e) => (out += `${e.message}\n`))
        child.on('close', (code) => {
          busy = false
          const lines = out.trimEnd().split('\n')
          const r = lines.findLast((l) => l.startsWith('RESULT '))
          const result = r ? JSON.parse(r.slice(7)) : {}
          send(200, { ok: code === 0, ...result, restart: code === 0 && sampleAtStart, log: lines.slice(-40).join('\n') })
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    dataRefresh(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': dataDir ?? path.resolve(__dirname, '../../data/sample'),
    },
  },
  test: {
    silent: 'passed-only',
    unstubEnvs: true,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      // include: ['src/**/*.{js,jsx,ts,tsx}'], // Uncomment to expand the report to all src/**/* so untested modules appear as 0% coverage.
      exclude: [
        'src/components/ui/**',
        'src/assets/**',
        'src/tanstack-table.d.ts',
        'src/routeTree.gen.ts',
        'src/test-utils/**',
        'src/routes/**',
      ],
    },
  },
})
