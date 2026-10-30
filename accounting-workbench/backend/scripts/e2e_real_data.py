"""用真实表格跑一遍后端全链路：导入 → 看板 → 盈亏平衡（表格取数 / 手动测算）→ 导出文件夹。"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

SOURCE = Path(r"C:\Users\13774\Desktop\网络部\网点数据看板\数据原表（前100行）.xlsx")


def main() -> int:
    if not SOURCE.exists():
        print(f"FAIL 源文件不存在: {SOURCE}")
        return 1

    home = Path(tempfile.mkdtemp(prefix="aw_e2e_"))
    os.environ["USERPROFILE"] = str(home)
    os.environ["HOME"] = str(home)
    # 数据目录指针文件（设置 → 更改目录）也隔离到临时 HOME，绝不碰真实用户配置
    os.environ["APPDATA"] = str(home / "appdata")
    os.environ["XDG_CONFIG_HOME"] = str(home / "config")
    os.environ["MPLCONFIGDIR"] = str(home / ".mplcache")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    from fastapi.testclient import TestClient  # noqa: PLC0415

    from accounting_backend.main import app  # noqa: PLC0415

    client = TestClient(app)
    print(f"数据目录: {home}")

    # 1) 导入（ImportRequest 走 JSON + 本地路径）
    res = client.post("/api/import", json={"path": str(SOURCE), "encoding": None})
    print("import ->", res.status_code)
    if res.status_code != 200:
        print(res.text[:400])
        return 1
    dataset = res.json()["dataset"]
    dataset_id = dataset["id"]
    print(f"  行 {dataset['row_count']} × 列 {dataset['col_count']}，命中预定义 {len(dataset.get('predefined_matches') or [])} 个")
    columns = [column["name"] for column in dataset["columns"]]

    time_range = {"start": "2000-01-01", "end": "2999-12-31", "field": "账单时间" if "账单时间" in columns else columns[0]}

    # 2) 看板
    board = client.post(
        "/api/board",
        json={
            "dataset_id": dataset_id,
            "time_range": time_range,
            "nets": [],
            "exclude": "不剔除",
            "source": None,
            "dims": ["省份"],
        },
    )
    print("board ->", board.status_code)
    if board.status_code == 200:
        body = board.json()
        print(
            f"  组 {len(body['rows'])} 个 · 合计 {body['sum_vol']:.2f} kg"
            f" · 加权折扣 {body['weighted_disc']:.4f} · 加权单价 {body['weighted_unit']:.4f}"
        )
    else:
        print(" ", board.text[:300])

    # 2.4) 时间范围自动识别（第 11 轮 C）：优先「账单时间」，返回 min~max
    time_range_res = client.get(f"/api/dataset/{dataset_id}/time-range")
    print("dataset/time-range ->", time_range_res.status_code)
    if time_range_res.status_code == 200:
        info = time_range_res.json()
        print(
            f"  字段 {info['field']} · {info['start']} ~ {info['end']} · 有效日期 {info['rows']} 行"
        )
        if info["field"] is None:
            print("FAIL 识别不出时间字段")
            return 1
    else:
        print(" ", time_range_res.text[:300])
        return 1

    # 2.45) 省份 × 公斤段级联（第 11 轮 A①）：候选映射 + 按映射展开分组
    if "目的所属省份" in columns and "公斤段" in columns:
        cascade_res = client.post(
            "/api/values",
            json={
                "dataset_id": dataset_id,
                "fields": ["目的所属省份", "公斤段"],
                "parent_field": "目的所属省份",
                "child_field": "公斤段",
                "time_range": time_range,
            },
        )
        print("values(级联) ->", cascade_res.status_code)
        mapping = cascade_res.json().get("cascade", {}) if cascade_res.status_code == 200 else {}
        if mapping:
            first_province = sorted(mapping)[0]
            print(
                f"  {first_province}: {mapping[first_province]}"
                f" · 共 {len(mapping)} 个省份"
            )
            cascade_table = client.post(
                "/api/regression/table",
                json={
                    "dataset_id": dataset_id,
                    "time_range": time_range,
                    "dims": ["寄件所属一级网点", "目的所属省份", "公斤段"],
                    "picks": {"目的所属省份": [first_province]},
                    "cascade": {"目的所属省份": {first_province: mapping[first_province]}},
                    "exclude": "不剔除",
                },
            )
            print("regression/table(级联) ->", cascade_table.status_code)
            if cascade_table.status_code == 200:
                groups = cascade_table.json()["groups"]
                print(
                    f"  组 {len(groups)} 个 · 首个 {groups[0]['label'] if groups else '—'}"
                    f" · parts {groups[0]['parts'] if groups else {}}"
                )
                # 标签顺序必须是 网点 · 省份 · 公斤段
                if groups and not groups[0]["label"].endswith(str(mapping[first_province][0])):
                    print("FAIL 级联标签顺序不对")
                    return 1
            else:
                print(" ", cascade_table.text[:300])
                return 1
        else:
            print("  （真实数据里没有省份 × 公斤段映射，跳过）")

    # 2.5) 分析页（条件即维度 + 指标链 + 合计行 + 取值候选）
    if "寄件所属一级网点" in columns and "公斤段" in columns and "结算重量" in columns:
        analysis = client.post(
            "/api/compute",
            json={
                "dataset_id": dataset_id,
                "time_range": time_range,
                "filters": {
                    "logic": "AND",
                    "conditions": [
                        {"field": "公斤段", "op": "in", "value": ["0-60", "60-150"]},
                        {"field": "结算重量", "op": "between", "value": [0, 500]},
                    ],
                },
                "group_by": [
                    {"field": "寄件所属一级网点", "time_granularity": None},
                    {"field": "公斤段", "time_granularity": None},
                ],
                "metrics": [
                    {"id": "m1", "field": "结算重量", "agg": "sum", "alias": "货量"},
                    {"id": "m2", "field": "件数", "agg": "sum", "alias": "件数合计"}
                    if "件数" in columns
                    else {"id": "m2", "field": "结算重量", "agg": "count", "alias": "票数"},
                ],
                "derived_metrics": [
                    {"id": "d1", "expression": "m1 / m2", "alias": "计算结果"},
                ],
            },
        )
        print("compute ->", analysis.status_code)
        if analysis.status_code == 200:
            body = analysis.json()
            meta = body["meta"]
            print(
                f"  列 {body['columns']} · 行 {body['row_count']}"
                f" · 扫描 {meta['scanned']} → 范围内 {meta['ranged']} → 筛选后 {meta['filtered']}"
            )
            print(f"  合计 {meta['totals']}")
            print(f"  每组命中 {meta['group_counts']}")
        else:
            print(" ", analysis.text[:300])

        # 新增运算符：开头是 / 高于平均值
        for condition in (
            {"field": "寄件所属一级网点", "op": "startsWith", "value": "金"},
            {"field": "结算重量", "op": "aboveAvg", "value": None},
        ):
            probe = client.post(
                "/api/compute",
                json={
                    "dataset_id": dataset_id,
                    "time_range": time_range,
                    "filters": {"logic": "AND", "conditions": [condition]},
                    "group_by": [{"field": "公斤段", "time_granularity": None}],
                    "metrics": [{"id": "m1", "field": "结算重量", "agg": "sum", "alias": "货量"}],
                    "derived_metrics": [],
                },
            )
            ok = probe.status_code == 200
            detail = f"筛选后 {probe.json()['meta']['filtered']} 行" if ok else probe.text[:120]
            print(f"  {condition['op']} -> {probe.status_code} · {detail}")

        values = client.post(
            "/api/values",
            json={
                "dataset_id": dataset_id,
                "fields": ["寄件所属一级网点", "公斤段", "不存在但会跳过"][:2],
                "limit": 5,
                "time_range": time_range,
            },
        )
        print("values ->", values.status_code)
        if values.status_code == 200:
            for field, items in values.json()["values"].items():
                print(f"    {field}: {items}")

    # 3) 盈亏平衡 · 表格取数（先按不剔除口径）
    table = client.post(
        "/api/regression/table",
        json={
            "dataset_id": dataset_id,
            "time_range": time_range,
            "dims": ["公斤段"],
            "picks": {},
            "policies": {},
            "exclude": "不剔除",
            "source": None,
        },
    )
    print("regression/table ->", table.status_code)
    if table.status_code == 200:
        body = table.json()
        print(f"  组 {len(body['groups'])} 个 · 合计货量 {body['z']:.2f} kg · P0 {body['p0']:.4f} · P {body['p']:.4f}")
        for group in body["groups"][:3]:
            print(
                f"    {group['label']}: 货量 {group['z']:.0f} · P0 {group['p0']:.4f}"
                f" · P {group['p']:.4f} · 折扣 {group['d']:.2%} · 调整前 {group['profit_now']:.0f}"
            )
        first = body["groups"][0]["label"] if body["groups"] else None
        if first is not None:
            with_policy = client.post(
                "/api/regression/table",
                json={
                    "dataset_id": dataset_id,
                    "time_range": time_range,
                    "dims": ["公斤段"],
                    "picks": {},
                    "policies": {first: {"c_line": 0.1, "op_cost": 0.08, "d_plan": 0.8, "z_plan": 1000}},
                    "exclude": "不剔除",
                    "source": None,
                },
            )
            print("  带计划值 ->", with_policy.status_code)
            if with_policy.status_code == 200:
                filled = [g for g in with_policy.json()["groups"] if g["filled"]]
                print(f"  filled 组数 {len(filled)}（应为 1）")
                if filled:
                    print(f"    调整后 {filled[0]['profit_plan']:.0f} · 利润率 {filled[0]['rate_plan']:.2%}")
    else:
        print(" ", table.text[:300])

    # 4) 盈亏平衡 · 手动测算
    manual = client.post(
        "/api/regression/manual",
        json={
            "config": {
                "p0": 1.7361,
                "d": 0.3,
                "d_plan": 0.25,
                "b_now": 3000,
                "b_plan": 2000,
                "c": 0.2,
                "z_now": 120000,
                "z_plan": 150000,
            }
        },
    )
    print("regression/manual ->", manual.status_code)
    if manual.status_code == 200:
        body = manual.json()
        print(
            f"  调整前 {body['profit_now']:.0f}（{body['rate_now']:.2%}）"
            f" · 调整后 {body['profit_plan']:.0f}（{body['rate_plan']:.2%}）· 台阶 {len(body['steps'])} 行"
        )

    # 5) 导出文件夹
    out_dir = home / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    export = client.post(
        "/api/regression/export/table",
        json={
            "dataset_id": dataset_id,
            "time_range": time_range,
            "dims": ["公斤段"],
            "picks": {},
            "policies": {},
            "result": table.json() if table.status_code == 200 else None,
            "out_dir": str(out_dir),
            "stamp": "2026-10-24 16：40",
            "prefix": "全量",
        },
    )
    print("export/table ->", export.status_code)
    if export.status_code == 200:
        folder = Path(export.json()["folder"])
        files = sorted(item.name for item in folder.iterdir())
        print(f"  文件夹 {folder.name}")
        for name in files:
            size = (folder / name).stat().st_size
            print(f"    {name}  {size / 1024:.0f} KB")
    else:
        print(" ", export.text[:300])

    # 5.5) 一键算图表文件夹：1 张合并大图 + N 张拆分小图（用户 2026-10-29 定稿）
    if board.status_code == 200:
        board_body = board.json()
        bands = board_body["bands"]
        picked = board_body["rows"][:2]

        def board_job(rows: list) -> dict:
            series = [f"{row['label']} · 公斤段折扣" for row in rows]
            return {
                "result": {
                    "columns": ["公斤段", *series],
                    "rows": [
                        [
                            band,
                            *[
                                (row["cells"][index]["price"] / row["cells"][index]["orig"])
                                if row["cells"][index]["orig"] > 0
                                else None
                                for row in rows
                            ],
                        ]
                        for index, band in enumerate(bands)
                    ],
                    "row_count": len(bands),
                    "meta": {},
                },
                "chart": {
                    "chart_type": "line",
                    "x_axis": "公斤段",
                    "y_axis": "比率 / 单价",
                    "series": None,
                    "show_fields": series,
                    "sort_by": "custom",
                    "sort_order": "asc",
                    "top_n": None,
                    "palette": "default",
                    "title": "网点对比图表",
                    "show_legend": True,
                    "show_data_labels": False,
                    "time_granularity": None,
                    "aggregation": "sum",
                    "series_colors": ["#0071e3", "#34c759"],
                },
            }

        if picked:
            folder_base = f"网点对比图表 · 全部网点 · {board_body['dim_label']} · 公斤段折扣"
            file_names = [folder_base] + [
                f"网点对比图表 · 全部网点 · {row['label']} · 公斤段折扣" for row in picked
            ]
            chart_export = client.post(
                "/api/board/export/chart-folder",
                json={
                    "merged": board_job(picked),
                    "splits": [board_job([row]) for row in picked],
                    "out_dir": str(out_dir),
                    "stamp": "2026-10-24 16：41",
                    "folder_base": folder_base,
                    "file_names": file_names,
                    "format": "jpeg",
                    "render_opts": {"figsize": [10, 6], "dpi": 120},
                },
            )
            print("board/export/chart-folder ->", chart_export.status_code)
            if chart_export.status_code == 200:
                folder = Path(chart_export.json()["folder"])
                files = sorted(item.name for item in folder.iterdir())
                print(f"  文件夹 {folder.name}（{len(files)} 个文件，期望 {1 + len(picked)}）")
                for name in files:
                    print(f"    {name}  {(folder / name).stat().st_size / 1024:.0f} KB")
                if len(files) != 1 + len(picked):
                    print("FAIL 图表文件夹文件数不对")
                    return 1
            else:
                print(" ", chart_export.text[:300])
                print("FAIL 图表文件夹导出失败")
                return 1

    # 6) 项目保存 / 查询
    saved = client.post(
        "/api/projects",
        json={
            "name": "e2e 项目",
            "creator": "e2e",
            "source_path": str(SOURCE),
            "source_type": "xlsx",
            "row_count": dataset["row_count"],
            "col_count": dataset["col_count"],
            "analysis_config": {},
            "has_result": True,
            "state": {"board": {"dims": ["省份"]}},
            "saved_kind": "manual",
        },
    )
    print("projects POST ->", saved.status_code)
    listed = client.get("/api/projects")
    body = listed.json()
    count = len(body.get("projects") or body.get("items") or [])
    print("projects GET ->", listed.status_code, "条数", count, "keys", list(body)[:4])

    # 7) 导出文件管理（登记 / 列表 / 删除）
    record = client.post(
        "/api/exports",
        json={
            "name": "e2e_导出台账.xlsx",
            "kind": "file",
            "path": str(EXPORT_DIR / "e2e_导出台账.xlsx") if "EXPORT_DIR" in globals() else "C:/tmp/e2e.xlsx",
            "project_id": saved.json()["project"]["id"] if saved.status_code == 201 else None,
            "project_name": "e2e 项目",
            "creator": "e2e",
        },
    )
    print("exports POST ->", record.status_code)
    exports = client.get("/api/exports", params={"query": "e2e"})
    print("exports GET ->", exports.status_code, "条数", exports.json().get("total"))
    removed = client.delete(f"/api/exports/{record.json()['id']}")
    print("exports DELETE ->", removed.status_code, removed.json().get("deleted"))

    # 8) 数据目录迁移（设置页「更改目录」）：迁移后老项目必须还能打开
    project_id = saved.json()["project"]["id"] if saved.status_code in (200, 201) else None
    target_dir = home / "moved-data"
    moved = client.patch("/api/settings", json={"data_dir": str(target_dir)})
    print("settings PATCH ->", moved.status_code)
    if moved.status_code == 200 and project_id is not None:
        info = moved.json()
        migration = info["migration"]
        print(
            f"  数据目录 -> {info['settings']['data_dir']}"
            f"（复制 {migration['copied_files']} 个文件，旧目录保留 {migration['kept_previous']}）"
        )
        reopened = client.get(f"/api/projects/{project_id}")
        rows = (reopened.json().get("dataset") or {}).get("row_count")
        print("  迁移后打开老项目 ->", reopened.status_code, "行", rows)
        if reopened.status_code != 200 or rows != dataset["row_count"]:
            print("FAIL 迁移后老项目打不开")
            return 1
    else:
        print(" ", moved.text[:300])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
