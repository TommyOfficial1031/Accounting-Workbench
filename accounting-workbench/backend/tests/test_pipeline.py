"""P1+P2 端到端集成测试：导入 → 字段识别 → 固定规则可用性。"""

from __future__ import annotations

import csv

from accounting_backend.schemas.dataset import ImportRequest
from accounting_backend.services.import_service import import_dataset

FULL_HEADERS = [
    "账单时间", "寄件所属一级网点", "目的所属省份", "公斤段", "物品来源", "是否剔除",
    "结算重量", "现价", "原价", "产品类型", "订单来源", "转运费", "备注",
]

FULL_ROW = [
    "2026-10-01", "网点A", "广东", "0-1kg", "电商", "否",
    10.0, 100.0, 120.0, "标准", "电商", 5.0, "备注内容",
]


def _write_csv(path, headers, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)


def _write_xlsx(path, headers, rows):
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def test_pipeline_import_and_enrich(tmp_path, monkeypatch):
    monkeypatch.setattr("accounting_backend.storage.paths.get_data_dir", lambda: tmp_path)

    csv_path = tmp_path / "full.csv"
    xlsx_path = tmp_path / "full.xlsx"
    _write_csv(csv_path, FULL_HEADERS, [FULL_ROW])
    _write_xlsx(xlsx_path, FULL_HEADERS, [FULL_ROW])

    for path in (csv_path, xlsx_path):
        response = import_dataset(ImportRequest(path=str(path), encoding="utf-8"))
        dataset = response.dataset

        assert dataset.predefined_hit_count == 12
        assert dataset.fixed_rules_available is True

        by_name = {column.name: column for column in dataset.columns}
        assert by_name["账单时间"].category == "运单基本信息"
        assert by_name["寄件所属一级网点"].category == "寄件网点信息"
        assert by_name["目的所属省份"].category == "到件网点信息"
        assert by_name["转运费"].category == "中转费用"
        assert by_name["备注"].category is None
        assert by_name["备注"].is_predefined is False
        assert all(
            column.is_predefined for column in dataset.columns if column.name != "备注"
        )

        assert [rule.name for rule in response.fixed_rules] == [
            "网点货量分析",
            "网点单公斤价格分析",
            "网点折扣分析",
        ]
        assert all(rule.available for rule in response.fixed_rules)
        assert all(rule.missing_fields == [] for rule in response.fixed_rules)

    # 字段不全时：命中 < 10，固定规则不可用，缺失字段精确匹配。
    partial_path = tmp_path / "partial.csv"
    _write_csv(
        partial_path,
        ["账单时间", "寄件所属一级网点", "结算重量"],
        [["2026-10-01", "网点A", 1.0]],
    )
    partial = import_dataset(ImportRequest(path=str(partial_path), encoding="utf-8"))
    assert partial.dataset.predefined_hit_count == 3
    assert partial.dataset.fixed_rules_available is False

    rules = {rule.name: rule for rule in partial.fixed_rules}
    assert rules["网点货量分析"].available is False
    assert rules["网点货量分析"].missing_fields == [
        "目的所属省份",
        "公斤段",
        "物品来源",
        "是否剔除",
    ]
