import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Suite normal (unitarias). Los bancos de Postgres viven en tests/db y se corren con `npm run test:int`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    exclude: ['e2e/**', 'tests/db/**', '**/node_modules/**', '**/.next/**'],
    passWithNoTests: true,
  },
})
