import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Animation library — large, changes rarely
          "vendor-framer": ["framer-motion"],
          // React core — split from app code
          "vendor-react": ["react", "react-dom"],
        },
      },
    },
  },
})
