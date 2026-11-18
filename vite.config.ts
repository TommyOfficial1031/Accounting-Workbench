import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Don't watch the Rust/Python side — the compiled .exe and build
      // artifacts get locked while cargo rebuilds, which makes Vite's file
      // watcher throw EBUSY and crash the dev server.
      ignored: ["**/src-tauri/**", "**/backend/**"],
    },
  },
  build: {
    target: "es2020",
  },
  test: {
    // 只跑 src 下的纯函数单测：_proto/ 与 .build-tmp/ 里有 e2e 残留的
    // 临时 HOME 目录，默认 glob 会去扫它们并 EPERM。
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
