"""FastAPI entry point for the accounting workbench backend sidecar.

The sidecar listens on a random local port (127.0.0.1:0), prints the assigned
port to stdout as ``PORT=<port>`` so the Tauri shell can capture it, and serves
the JSON API under the ``/api`` prefix.
"""

from __future__ import annotations

import socket

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from accounting_backend.config import ALLOWED_ORIGINS, API_PREFIX, HOST
from accounting_backend.errors import AccountingError
from accounting_backend.routers import (
    board_export_router,
    board_router,
    chart_router,
    compute_router,
    export_records_router,
    export_router,
    import_router,
    project_router,
    regression_export_router,
    regression_router,
    settings_router,
    values_router,
)

app = FastAPI(title="Accounting Workbench Backend")

# The Tauri webview and the Vite dev server run on different origins than the
# local backend, so CORS must be enabled for the allowed frontend origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(import_router.router)
app.include_router(compute_router.router)
app.include_router(chart_router.router)
app.include_router(export_router.router)
app.include_router(project_router.router)
app.include_router(board_router.router)
app.include_router(board_export_router.router)
app.include_router(regression_router.router)
app.include_router(regression_export_router.router)
app.include_router(values_router.router)
app.include_router(export_records_router.router)
app.include_router(settings_router.router)


@app.exception_handler(AccountingError)
async def accounting_error_handler(request: Request, exc: AccountingError) -> JSONResponse:
    """Serialize AccountingError into the ``{"error": {...}}`` contract."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


@app.get(f"{API_PREFIX}/health")
async def health() -> dict[str, str]:
    """Return a liveness probe used by the frontend to confirm connectivity."""
    return {"status": "ok"}


def find_free_port() -> int:
    """Reserve a free TCP port on the loopback interface."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def main() -> None:
    """Start uvicorn on a random port and announce it to stdout."""
    port = find_free_port()
    # The Tauri shell parses this exact line to learn the backend port.
    print(f"PORT={port}", flush=True)
    uvicorn.run(app, host=HOST, port=port, log_level="info")


if __name__ == "__main__":
    main()