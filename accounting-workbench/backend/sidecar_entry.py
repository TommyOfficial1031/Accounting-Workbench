"""PyInstaller entry point for the backend sidecar.

The shell spawns ``accounting-backend.exe`` (installed next to the app resources)
with no arguments; this module prepares the runtime directories and then starts
the FastAPI sidecar exactly like ``python -m accounting_backend.main`` does.
"""

from __future__ import annotations

import os
from pathlib import Path


def _prepare_env() -> None:
    """Point matplotlib's cache at the app config dir before it is imported.

    A frozen app usually runs from a read-only location (Program Files), and
    matplotlib would otherwise try to build its font cache in ``%TEMP%``, which
    fails on locked-down machines. The cache goes next to ``settings.json``
    (``%APPDATA%\\accounting-workbench\\.mplcache``) so it never lands inside the
    user-chosen data directory. Honouring an existing ``MPLCONFIGDIR`` keeps
    CI/tests able to redirect it.
    """
    if os.environ.get("MPLCONFIGDIR"):
        return
    try:
        from accounting_backend.storage.paths import get_config_dir  # noqa: PLC0415

        config_dir = get_config_dir()
    except Exception:  # noqa: BLE001 - 配置目录拿不到时退回老位置，不能因此起不来
        config_dir = Path.home() / ".accounting-workbench"
    cache_dir = config_dir / ".mplcache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ["MPLCONFIGDIR"] = str(cache_dir)


_prepare_env()

from accounting_backend.main import main  # noqa: E402  (must run after _prepare_env)

if __name__ == "__main__":
    main()
