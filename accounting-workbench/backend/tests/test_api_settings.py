"""HTTP 接口集成测试：设置（数据目录读写 + 迁移）。

为了让测试绝不碰真实用户目录：把「配置指针目录」和「默认数据目录」都指到 tmp_path，
再让 ``paths.get_data_dir`` 走真实实现（这样指针文件的读写路径真的被测到）。
"""

from __future__ import annotations

import csv
import json
import sys

import pytest
from fastapi.testclient import TestClient

from accounting_backend.main import app
from accounting_backend.storage import paths

HEADERS = ["账单时间", "寄件所属一级网点", "目的所属省份", "公斤段", "结算重量", "现价"]


@pytest.fixture()
def env(tmp_path, monkeypatch):
    # 注意：这里**不**创建 current，让「全新安装还没数据目录」和「已有数据」两种情况都能测
    current = tmp_path / "current"
    config = tmp_path / "cfg"
    monkeypatch.setattr(paths, "get_config_dir", lambda: config)
    monkeypatch.setattr(paths, "get_default_data_dir", lambda: current)
    paths.reset_data_dir_cache()
    yield current, config, TestClient(app)
    paths.reset_data_dir_cache()


def _write_csv(path, headers, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)


def _create_project(client, tmp_path, name="迁移项目"):
    source = tmp_path / f"{name}.csv"
    _write_csv(source, HEADERS, [["2026-10-01", "A", "广东", "0-1kg", 10, 100]])
    resp = client.post(
        "/api/projects", json={"name": name, "creator": "张三", "source_path": str(source)}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["project"]["id"]


def test_get_settings_default(env):
    current, _config, client = env
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data_dir"] == str(current)
    assert body["default_data_dir"] == str(current)
    assert body["is_default"] is True
    assert body["project_count"] == 0


def test_change_data_dir_migrates_and_keeps_old(env, tmp_path):
    current, config, client = env
    project_id = _create_project(client, tmp_path)
    assert (current / "projects.db").exists()
    assert (current / "projects" / project_id / "data.parquet").exists()
    assert (current / "datasets").is_dir()

    target = tmp_path / "moved"
    resp = client.patch("/api/settings", json={"data_dir": str(target)})
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert body["settings"]["data_dir"] == str(target)
    assert body["settings"]["is_default"] is False
    assert body["settings"]["project_count"] == 1
    assert body["migration"]["previous_dir"] == str(current)
    assert body["migration"]["kept_previous"] is True
    assert body["migration"]["copied_files"] >= 2

    # 新目录：库 + 项目缓存 + 数据集缓存都在
    assert (target / "projects.db").exists()
    assert (target / "projects" / project_id / "data.parquet").exists()
    assert (target / "datasets").is_dir()
    # 旧目录原样保留一份（不删用户数据）
    assert (current / "projects.db").exists()
    assert (current / "projects" / project_id / "data.parquet").exists()
    # 暂存目录不残留
    assert [item.name for item in target.iterdir() if item.name.startswith(".aw-migrate")] == []

    saved = json.loads((config / "settings.json").read_text(encoding="utf-8"))
    assert saved["data_dir"] == str(target)

    # 迁移后老项目还能打开（读的是新目录的库与 parquet）
    detail = client.get(f"/api/projects/{project_id}")
    assert detail.status_code == 200
    assert detail.json()["dataset"]["row_count"] == 1

    # 热切换后再新建的项目也落在新目录
    _create_project(client, tmp_path, "迁移后项目")
    assert client.get("/api/settings").json()["project_count"] == 2
    assert len(list((target / "projects").iterdir())) == 2

    # 进程重启（缓存清空）后从指针文件读回新目录
    paths.reset_data_dir_cache()
    assert client.get("/api/settings").json()["data_dir"] == str(target)


def test_change_data_dir_on_fresh_install(env, tmp_path):
    """还没导入过任何东西（数据目录都还不存在）时改目录：不报错、直接切过去。"""
    current, config, client = env
    assert not current.exists()

    target = tmp_path / "fresh-moved"
    resp = client.patch("/api/settings", json={"data_dir": str(target)})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["settings"]["data_dir"] == str(target)
    assert body["migration"]["copied_files"] == 0
    # 新目录里把子目录建好，指针文件也写了
    assert (target / "projects").is_dir()
    assert (target / "datasets").is_dir()
    saved = json.loads((config / "settings.json").read_text(encoding="utf-8"))
    assert saved["data_dir"] == str(target)


def test_change_data_dir_rejects_existing_data(env, tmp_path):
    current, _config, client = env
    target = tmp_path / "occupied"
    target.mkdir()
    (target / "projects.db").write_text("x", encoding="utf-8")

    resp = client.patch("/api/settings", json={"data_dir": str(target)})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "DATA_DIR_NOT_EMPTY"
    assert client.get("/api/settings").json()["data_dir"] == str(current)


def test_change_data_dir_rejects_same_dir(env):
    current, _config, client = env
    resp = client.patch("/api/settings", json={"data_dir": str(current)})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "DATA_DIR_UNCHANGED"


def test_change_data_dir_rejects_nested_dir(env):
    current, _config, client = env
    resp = client.patch("/api/settings", json={"data_dir": str(current / "inner")})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "DATA_DIR_INVALID"


def test_change_data_dir_rejects_empty_and_relative(env):
    _current, _config, client = env
    for value in ("", "   ", "relative\\dir"):
        resp = client.patch("/api/settings", json={"data_dir": value})
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "DATA_DIR_INVALID"


@pytest.mark.skipif(sys.platform != "win32", reason="Windows 才有的非法路径字符")
def test_change_data_dir_rejects_illegal_characters(env, tmp_path):
    """路径里带 Windows 不允许的字符：给 DATA_DIR_INVALID（400），不能是 500 堆栈。"""
    _current, _config, client = env
    resp = client.patch("/api/settings", json={"data_dir": str(tmp_path / "bad<>|name")})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "DATA_DIR_INVALID"


def test_change_data_dir_rejects_unwritable_parent(env, tmp_path):
    _current, _config, client = env
    blocker = tmp_path / "blocker.txt"
    blocker.write_text("x", encoding="utf-8")

    resp = client.patch("/api/settings", json={"data_dir": str(blocker / "sub")})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "DATA_DIR_NOT_WRITABLE"


def test_change_data_dir_rolls_back_when_settings_write_fails(env, tmp_path, monkeypatch):
    current, _config, client = env
    _create_project(client, tmp_path)
    target = tmp_path / "moved"

    def _boom(_values):
        raise OSError("disk full")

    monkeypatch.setattr(paths, "write_app_settings", _boom)
    resp = client.patch("/api/settings", json={"data_dir": str(target)})
    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "DATA_DIR_SETTINGS_FAILED"

    # 回滚干净：新目录没有半套数据，旧目录完好，设置没变
    assert not (target / "projects.db").exists()
    assert not (target / "projects").exists()
    assert (current / "projects.db").exists()
    assert client.get("/api/settings").json()["data_dir"] == str(current)


def test_settings_pointer_round_trip_and_corruption(env):
    current, config, _client = env
    paths.reset_data_dir_cache()
    assert paths.get_data_dir() == current

    elsewhere = config.parent / "elsewhere"
    paths.set_data_dir(elsewhere)
    assert paths.get_data_dir() == elsewhere
    assert json.loads((config / "settings.json").read_text(encoding="utf-8"))["data_dir"] == str(
        elsewhere
    )

    # 空值 / 坏 JSON 都要退回默认目录，不能把程序读崩
    paths.write_app_settings({"data_dir": ""})
    paths.reset_data_dir_cache()
    assert paths.get_data_dir() == current

    (config / "settings.json").write_text("{broken", encoding="utf-8")
    paths.reset_data_dir_cache()
    assert paths.get_data_dir() == current
