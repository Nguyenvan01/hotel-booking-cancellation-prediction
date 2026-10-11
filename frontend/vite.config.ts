import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Build ra app/web để FastAPI phục vụ cùng cổng; khi dev, /api được proxy tới uvicorn ở cổng 8000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "../app/web", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { proxy: { "/api": "http://localhost:8000", "/docs": "http://localhost:8000", "/openapi.json": "http://localhost:8000" } },
})
