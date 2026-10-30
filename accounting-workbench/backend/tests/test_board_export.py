"""一键算图表文件夹导出：1 张合并大图 + N 张拆分小图（真写盘）。"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from accounting_backend.io.board_exporter import folder_path, safe_name
from accounting_backend.main import app

BANDS = ["0-60", "60-150", "150-300", "300-500", "500-800", "800+"]
STAMP = "2026-10-29 11：38"
FOLDER_BASE = "网点对比图表 · 上饶德兴 · 网点 × 省份 · 公斤段折扣"
MERGED_NAME = FOLDER_BASE
SPLIT_NAMES = [
    "网点对比图表 · 上饶德兴 · 上海市 · 公斤段折扣",
    "网点对比图表 · 上饶德兴 · 浙江省 · 公斤段折扣",
]
SERIES_A = "上饶德兴 · 上海市 · 公斤段折扣"
SERIES_B = "上饶德兴 · 浙江省 · 公斤段折扣"


@pytest.fixture()
def client():
    return TestClient(app)


def _merged_job() -> dict:
    """合并大图：每个分组行一条线（用户勾 1 个子指标时的真实形状）。"""
    return {
        "result": {
            "columns": ["公斤段", SERIES_A, SERIES_B],
            "rows": [[band, index + 1, index + 0.5] for index, band in enumerate(BANDS)],
            "row_count": len(BANDS),
            "meta": {},
        },
        "chart": {
            "chart_type": "line",
            "x_axis": "公斤段",
            "y_axis": "比率 / 单价",
            "series": None,
            "show_fields": [SERIES_A, SERIES_B],
            "sort_by": "custom",
            "sort_order": "asc",
            "palette": "default",
            "title": "网点对比图表",
            "series_colors": ["#0071e3", "#34c759"],
        },
    }


def _split_job(label: str, values: list[float]) -> dict:
    """拆分小图：只画该分组行自己的指标线。"""
    series = f"{label} · 公斤段折扣"
    return {
        "result": {
            "columns": ["公斤段", series],
            "rows": [[band, value] for band, value in zip(BANDS, values)],
            "row_count": len(BANDS),
            "meta": {},
        },
        "chart": {
            "chart_type": "line",
            "x_axis": "公斤段",
            "y_axis": "比率 / 单价",
            "series": None,
            "show_fields": [series],
            "sort_by": "custom",
            "sort_order": "asc",
            "palette": "default",
            "title": "网点对比图表",
            "series_colors": ["#0071e3"],
        },
    }


def _payload(out_dir: Path, fmt: str = "jpeg") -> dict:
    return {
        "merged": _merged_job(),
        "splits": [
            _split_job("上饶德兴 · 上海市", [1, 0, 2, 0, 1, 0]),
            _split_job("上饶德兴 · 浙江省", [0, 3, 0, 4, 0, 2]),
        ],
        "out_dir": str(out_dir),
        "stamp": STAMP,
        "folder_base": FOLDER_BASE,
        "file_names": [MERGED_NAME, *SPLIT_NAMES],
        "format": fmt,
        "render_opts": {"figsize": [10, 6], "dpi": 100},
    }


def test_export_jpeg_writes_one_folder_with_merged_and_splits(client, tmp_path: Path) -> None:
    response = client.post("/api/board/export/chart-folder", json=_payload(tmp_path))
    assert response.status_code == 200, response.text
    body = response.json()

    folder = Path(body["folder"])
    assert folder.is_dir()
    assert folder.parent == tmp_path
    assert folder.name == f"{FOLDER_BASE}_{STAMP}"
    assert body["files"] == [f"{MERGED_NAME}.jpg", *[f"{name}.jpg" for name in SPLIT_NAMES]]

    for name in body["files"]:
        content = (folder / name).read_bytes()
        assert content[:2] == b"\xff\xd8"  # JPEG 魔数
    assert len(list(folder.iterdir())) == 1 + len(SPLIT_NAMES)
    # 暂存目录不留在父目录里（只有那个文件夹）
    assert [path.name for path in tmp_path.iterdir()] == [folder.name]


def test_export_pdf_folder_keeps_title_and_legend(client, tmp_path: Path) -> None:
    response = client.post("/api/board/export/chart-folder", json=_payload(tmp_path, "pdf"))
    assert response.status_code == 200, response.text
    body = response.json()

    folder = Path(body["folder"])
    assert all(name.endswith(".pdf") for name in body["files"])

    merged = folder / body["files"][0]
    text = "".join(page.extract_text() or "" for page in PdfReader(str(merged)).pages)
    assert "网点对比图表" in text  # 标题
    assert "上海市" in text and "浙江省" in text  # 两条线的图例名（导出 = 预览）
    assert (folder / body["files"][1]).read_bytes()[:4] == b"%PDF"


def test_export_same_minute_appends_suffix(client, tmp_path: Path) -> None:
    first = client.post("/api/board/export/chart-folder", json=_payload(tmp_path)).json()
    second = client.post("/api/board/export/chart-folder", json=_payload(tmp_path)).json()

    assert Path(first["folder"]).name == f"{FOLDER_BASE}_{STAMP}"
    assert Path(second["folder"]).name == f"{FOLDER_BASE}_{STAMP}（2）"
    assert Path(second["folder"]).is_dir()


def test_export_rejects_file_name_count_mismatch(client, tmp_path: Path) -> None:
    payload = _payload(tmp_path)
    payload["file_names"] = [MERGED_NAME]

    response = client.post("/api/board/export/chart-folder", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_EXPORT_CONFIG"
    assert list(tmp_path.iterdir()) == []


def test_export_rolls_back_when_one_chart_fails(client, tmp_path: Path) -> None:
    payload = _payload(tmp_path)
    payload["splits"][1]["chart"]["x_axis"] = "不存在的列"

    response = client.post("/api/board/export/chart-folder", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_CHART_CONFIG"
    # 整批回滚：不留半个文件夹，也不留暂存目录
    assert list(tmp_path.iterdir()) == []


def test_export_write_failure_is_structured(client, tmp_path: Path) -> None:
    blocker = tmp_path / "not-a-dir"
    blocker.write_text("x", encoding="utf-8")

    response = client.post("/api/board/export/chart-folder", json=_payload(blocker))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "EXPORT_WRITE_FAILED"


def test_export_rejects_unknown_format(client, tmp_path: Path) -> None:
    response = client.post("/api/board/export/chart-folder", json=_payload(tmp_path, "png"))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_EXPORT_FORMAT"


def test_dedupe_file_names_inside_one_batch(client, tmp_path: Path) -> None:
    """多个网点时拆分取值可能撞名：同批重名追加 （2），不覆盖。"""
    payload = _payload(tmp_path)
    payload["file_names"] = [MERGED_NAME, SPLIT_NAMES[0], SPLIT_NAMES[0]]

    response = client.post("/api/board/export/chart-folder", json=payload)
    assert response.status_code == 200, response.text
    files = response.json()["files"]
    assert files[1] == f"{SPLIT_NAMES[0]}.jpg"
    assert files[2] == f"{SPLIT_NAMES[0]}（2）.jpg"
    assert len(set(files)) == len(files)


def test_safe_name_and_folder_path(tmp_path: Path) -> None:
    # 与前端 safeFileName 同一套：非法字符换成「·」，空白压成一个空格
    assert safe_name("比率 / 单价") == "比率 · 单价"
    assert safe_name("a\\b:c*d?e") == "a·b·c·d·e"
    assert safe_name("  多   空格  ") == "多 空格"
    assert safe_name("结尾的点.") == "结尾的点"
    # 半角冒号在 Windows 文件名里非法 → 全角（坑 4）
    path = folder_path(tmp_path, "网点对比图表 · 上饶德兴", "2026-10-29 11:38")
    assert path.name == "网点对比图表 · 上饶德兴_2026-10-29 11：38"
