import { defineConfig } from 'vite'

export default defineConfig({
  base: '/duplicate-finder/',
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
})
