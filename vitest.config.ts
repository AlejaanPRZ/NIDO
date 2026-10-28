import { defineConfig } from 'vitest/config'

// Pruebas automáticas (npm test). Corren en Node, sin Electron: lo que necesita Electron se simula
// en cada archivo con vi.mock.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
