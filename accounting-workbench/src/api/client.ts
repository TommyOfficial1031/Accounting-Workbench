import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "../utils/platform";
import type { ApiErrorBody, HealthResponse } from "../types/api";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

const DEV_BACKEND_PORT = Number(
  (import.meta.env.VITE_BACKEND_PORT as string | undefined) ?? 0,
);

export async function getBackendPort(): Promise<number> {
  if (isTauri()) {
    const port = await invoke<number | null>("get_backend_port");
    if (port) return port;
    throw new Error("Backend port is not available yet");
  }
  if (DEV_BACKEND_PORT > 0) return DEV_BACKEND_PORT;
  throw new Error("Not running inside Tauri and VITE_BACKEND_PORT is not set");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 启动时后端 sidecar 可能尚未输出 PORT=，这里带重试地获取端口。
export async function getBackendPortWithRetry(
  getPort: () => Promise<number> = getBackendPort,
  maxAttempts = 10,
  intervalMs = 500,
): Promise<number> {
  let lastError: unknown = new Error("Backend port is not available yet");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const port = await getPort();
      console.log(`[backend] 端口获取成功（第 ${attempt}/${maxAttempts} 次）：${port}`);
      return port;
    } catch (err) {
      lastError = err;
      console.log(
        `[backend] 端口获取失败（第 ${attempt}/${maxAttempts} 次）：${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempt < maxAttempts) {
        await sleep(intervalMs);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// 探活：重试获取端口成功后请求 /api/health。
export async function probeBackend(
  getPort: () => Promise<number> = getBackendPort,
  healthFn: () => Promise<HealthResponse> = getHealth,
  maxAttempts = 10,
  intervalMs = 500,
): Promise<{ port: number; health: HealthResponse }> {
  const port = await getBackendPortWithRetry(getPort, maxAttempts, intervalMs);
  const health = await healthFn();
  return { port, health };
}

async function getBaseUrl(): Promise<string> {
  const port = await getBackendPort();
  return `http://127.0.0.1:${port}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers:
      options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = `Request failed with status ${response.status}`;
    let details: unknown;

    try {
      // FastAPI 校验失败时返回 { detail: [...] }，把它拼进消息，避免只看到 422
      const raw = (await response.clone().text()) || "";
      const parsed = JSON.parse(raw || "{}") as {
        error?: ApiErrorBody;
        detail?: unknown;
      };
      if (parsed.detail !== undefined) {
        // FastAPI 校验失败：{"detail":[{loc,msg,type}, ...]}
        message = `${message}：${JSON.stringify(parsed.detail).slice(0, 240)}`;
      }
      const body = parsed;
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
        details = body.error.details;
      }
    } catch {
      // Ignore malformed error bodies and keep the HTTP fallback.
    }

    throw new ApiError(code, message, details);
  }

  return (await response.json()) as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}