import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  root: "demo",
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
})
