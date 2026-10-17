import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  // y-monaco still imports Monaco's legacy pre-0.55 path.
  resolve: { alias: { 'monaco-editor/esm/vs/editor/editor.api.js': 'monaco-editor/editor/editor.api.js' } },
  server: { host: '127.0.0.1', strictPort: true, watch: { ignored: ['**/release/**', '**/build/**'] } },
});
