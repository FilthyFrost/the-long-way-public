// The action viewer (actions.html) built on its own, as one script with nothing loaded after it, for
// tools/character/pack_viewer.mjs to pack into a single HTML file. The game's public folder is not copied: the only
// files the viewer reads (her mesh, the clips) are put into the page by the packer.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: ROOT,
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    target: 'es2022',
    outDir: 'dist-viewer',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 1e9,
    chunkSizeWarningLimit: 1e9,
    rolldownOptions: {
      input: fileURLToPath(new URL('../../actions.html', import.meta.url)),
      output: { codeSplitting: false },
    },
  },
});
