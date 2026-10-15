import { defineConfig } from 'vite';
export default defineConfig({ base: process.env.BASE ?? './', build: { target: 'esnext', chunkSizeWarningLimit: 2000 }, esbuild: { target: 'esnext' }, optimizeDeps: { esbuildOptions: { target: 'esnext' } } });
