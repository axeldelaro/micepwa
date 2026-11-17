import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          network: ['peerjs', 'trystero'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
