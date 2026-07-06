// Temporary local-verification config: port 3001 is occupied by another app on
// this machine, so the backend runs on 3002 for the session. Delete after use.
import { mergeConfig } from "vite"
import baseConfig from "./vite.config"

export default mergeConfig(baseConfig, {
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
})
