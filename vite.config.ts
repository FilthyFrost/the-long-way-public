import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    // the game, the ModCar game (modcar.html) and the ModCar model viewer (docs/MODCAR.md §6, §8)
    rolldownOptions: { input: { main: page('./index.html'), modcar: page('./modcar.html'), viewer: page('./viewer.html') } },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
});
