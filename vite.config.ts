import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` erzeugt dist/index.html als EINE Datei (für Artifact-Link, Doppelklick oder Homescreen).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020' },
  test: { environment: 'node' },
} as any);
