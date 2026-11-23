import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // '/' locally; '/<repo-name>/' when built for GitHub Pages (set by the deploy workflow).
  base: process.env.BASE_PATH || '/',
  server: { port: 5173 },
});
