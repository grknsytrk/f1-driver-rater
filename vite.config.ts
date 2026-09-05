import path from "path"
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.split(path.sep).join('/');
          if (!normalizedId.includes('/node_modules/')) return undefined;

          if (normalizedId.includes('/node_modules/@supabase/')) return 'supabase';
          if (normalizedId.includes('/node_modules/react')) return 'react';
          if (normalizedId.includes('/node_modules/framer-motion/')) return 'motion';
          if (normalizedId.includes('/node_modules/recharts/')) return 'charts';
          if (normalizedId.includes('/node_modules/lucide-react/')) return 'icons';
          if (normalizedId.includes('/node_modules/country-flag-icons/')) return 'flags';
          if (normalizedId.includes('/node_modules/axios/')) return 'http';
          if (
            normalizedId.includes('/node_modules/@radix-ui/') ||
            normalizedId.includes('/node_modules/class-variance-authority/') ||
            normalizedId.includes('/node_modules/clsx/') ||
            normalizedId.includes('/node_modules/sonner/') ||
            normalizedId.includes('/node_modules/tailwind-merge/')
          ) {
            return 'ui';
          }

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'happy-dom',
  },
})
