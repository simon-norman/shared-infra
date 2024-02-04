import { defineConfig } from 'tsup'

export default defineConfig({
  target: 'esnext',
  format: ['cjs'],
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true
})