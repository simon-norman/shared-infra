import { defineConfig } from 'tsup'

export default defineConfig({
  target: 'esnext',
  format: ['cjs'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true
})