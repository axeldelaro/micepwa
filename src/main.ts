import { Game } from './core/Game';

// Register Offline PWA Service Worker with relative path for 100% GitHub Pages compatibility
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker registration skipped:', err);
    });
  });
}

// Boot VoxelCraft Online
const app = new Game();
(window as unknown as { __VOXELCRAFT_APP__?: Game }).__VOXELCRAFT_APP__ = app;
