import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Bancos contra un Postgres REAL (embedded-postgres, version exacta = la de prod). Opt-in:
//   PG_INTEGRATION=1 npm run test:int
// Sin PG_INTEGRATION los *.int.test.ts se saltan y no cargan los binarios. La suite normal
// (vitest.config.ts) los excluye. La raiz es la del repo; las dependencias del banco viven en tests/db.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/db/**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
})
