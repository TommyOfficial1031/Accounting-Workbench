"""确认口径过滤在真实数据上是否真的改变结果。"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

SOURCE = Path(r"C:\Users\13774\Desktop\网络部\网点数据看板\数据原表（前100行）.xlsx")
HOME = Path(tempfile.mkdtemp(prefix="aw_cal_"))
os.environ["USERPROFILE"] = str(HOME)
os.environ["HOME"] = str(HOME)
# 数据目录指针文件（设置 → 更改目录）也隔离，绝不碰真实用户配置
os.environ["APPDATA"] = str(HOME / "appdata")
os.environ["XDG_CONFIG_HOME"] = str(HOME / "config")
os.environ["MPLCONFIGDIR"] = str(HOME / ".mplcache")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: PLC0415

from accounting_backend.main import app  # noqa: PLC0415

client = TestClient(app)
dataset = client.post("/api/import", json={"path": str(SOURCE)}).json()["dataset"]
dataset_id = dataset["id"]
columns = [c["name"] for c in dataset["columns"]]
print("剔除列样本:", client.post("/api/values", json={"dataset_id": dataset_id, "fields": ["是否剔除"]}).json())
print("来源列样本:", client.post("/api/values", json={"dataset_id": dataset_id, "fields": ["物品来源"]}).json())

time_range = {"start": "2000-01-01", "end": "2999-12-31", "field": "账单时间"}
for exclude in ["不剔除", "剔除", "删除", "全部"]:
    res = client.post(
        "/api/regression/table",
        json={
            "dataset_id": dataset_id,
            "time_range": time_range,
            "dims": [],
            "picks": {},
            "policies": {},
            "exclude": exclude,
            "source": None,
        },
    )
    if res.status_code == 200:
        body = res.json()
        print(f"  exclude={exclude:6s} -> 货量 {body['z']:.2f} · P0 {body['p0']:.4f}")
    else:
        print(f"  exclude={exclude:6s} -> {res.status_code} {res.text[:160]}")

for source in ["普通物品", "审报物品", "全部"]:
    res = client.post(
        "/api/regression/table",
        json={
            "dataset_id": dataset_id,
            "time_range": time_range,
            "dims": [],
            "picks": {},
            "policies": {},
            "exclude": "不剔除",
            "source": source,
        },
    )
    if res.status_code == 200:
        body = res.json()
        print(f"  source={source:6s} -> 货量 {body['z']:.2f} · P0 {body['p0']:.4f}")
    else:
        print(f"  source={source:6s} -> {res.status_code} {res.text[:160]}")

print("列名含剔除的:", [c for c in columns if "剔" in c or "除" in c])
