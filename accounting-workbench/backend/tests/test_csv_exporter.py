"""CSV 导出测试。"""

from __future__ import annotations

from accounting_backend.io.csv_exporter import export_csv
from accounting_backend.schemas.analysis import ComputeResult


def test_export_csv_bom_and_chinese(tmp_path):
    result = ComputeResult(
        columns=["账单时间", "货量"],
        rows=[["2026-10-01", 15.0], ["2026-10-02", 8.0]],
        row_count=2,
        meta={},
    )
    path = tmp_path / "out.csv"
    export_csv(result, str(path))

    data = path.read_bytes()
    assert data[:3] == b"\xef\xbb\xbf"  # UTF-8 BOM
    text = data.decode("utf-8-sig")
    assert "账单时间" in text  # 中文不丢失
    assert "2026-10-01" in text
