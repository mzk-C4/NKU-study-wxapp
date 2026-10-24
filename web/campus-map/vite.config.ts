import { defineConfig } from 'vite'

// Keep prior hashed assets for cached HTML and avoid destructive output cleanup.
export default defineConfig({ base: '/campus-map/', build: { emptyOutDir: false } })
