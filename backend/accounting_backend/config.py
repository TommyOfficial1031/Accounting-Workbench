"""Runtime configuration for the accounting backend sidecar."""

from __future__ import annotations

HOST: str = "127.0.0.1"
PORT: int = 0
API_PREFIX: str = "/api"

# 允许的前端 origin：Vite dev 服务器 + Tauri WebView。
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
]