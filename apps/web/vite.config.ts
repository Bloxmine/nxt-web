import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { offline } from './build/offline';

export default defineConfig({
  // Relative paths so the build works from any folder on any static host.
  base: './',
  plugins: [react(), tailwindcss(), offline()],
});
