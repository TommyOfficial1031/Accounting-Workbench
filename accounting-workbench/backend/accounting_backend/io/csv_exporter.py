"""CSV 导出（UTF-8 with BOM，Windows Excel 兼容）。"""

from __future__ import annotations

import pandas as pd

from accounting_backend.schemas.analysis import ComputeResult


def export_csv(result: ComputeResult, destination) -> None:
    """导出 csv（destination 可为路径或文件对象）。"""
    df = pd.DataFrame(result.rows, columns=result.columns)
    df.to_csv(
        destination,
        index=False,
        encoding="utf-8-sig",
        lineterminator="\r\n",
    )
