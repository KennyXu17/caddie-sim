import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: ['index.html', 'dashboard.html'],
    },
  },
  server: {
    open: process.env.DASHBOARD === '1' ? '/dashboard.html' : '/',
  },
});
