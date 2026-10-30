"""编辑编排测试：会话隔离 + undo/redo + 幂等 + 并发。"""

from __future__ import annotations

import threading

import pandas as pd
import pytest

from accounting_backend.schemas.edit import EditRequest
from accounting_backend.services import edit_service


@pytest.fixture(autouse=True)
def _clear_sessions():
    edit_service._sessions.clear()
    yield
    edit_service._sessions.clear()


def _register(dataset_id, frame):
    edit_service.register_dataframe(dataset_id, frame)


def test_undo_stack_isolation_between_datasets():
    _register("A", pd.DataFrame({"x": [1, 2, 3]}))
    _register("B", pd.DataFrame({"y": [10, 20]}))

    for i in range(3):
        edit_service.apply(
            EditRequest(op="set_cells", payload={"cells": [{"row": 0, "col": 0, "value": 100 + i}]}), "A"
        )
    for i in range(2):
        edit_service.apply(
            EditRequest(op="set_cells", payload={"cells": [{"row": 0, "col": 0, "value": 200 + i}]}), "B"
        )

    edit_service.apply(EditRequest(op="undo"), "A")
    assert len(edit_service._get_session("A").undo_stack) == 2
    assert len(edit_service._get_session("B").undo_stack) == 2


def test_undo_redo_cycle():
    _register("C", pd.DataFrame({"x": [1, 2]}))
    edit_service.apply(
        EditRequest(op="set_cells", payload={"cells": [{"row": 0, "col": 0, "value": 99}]}), "C"
    )
    assert edit_service.get_frame("C").iat[0, 0] == 99
    edit_service.apply(EditRequest(op="undo"), "C")
    assert edit_service.get_frame("C").iat[0, 0] == 1
    edit_service.apply(EditRequest(op="redo"), "C")
    assert edit_service.get_frame("C").iat[0, 0] == 99


def test_idempotency_key_no_duplicate_execution():
    _register("D", pd.DataFrame({"x": [1]}))
    req = EditRequest(
        op="set_cells", payload={"cells": [{"row": 0, "col": 0, "value": 5}]}, idempotency_key="k1"
    )
    edit_service.apply(req, "D")
    edit_service.apply(req, "D")  # 重复 key 不重复入栈
    assert len(edit_service._get_session("D").undo_stack) == 1


def test_concurrent_edits_serialized():
    _register("E", pd.DataFrame({"x": [0, 0, 0, 0, 0]}))

    def worker(row, value):
        edit_service.apply(
            EditRequest(op="set_cells", payload={"cells": [{"row": row, "col": 0, "value": value}]}), "E"
        )

    threads = [threading.Thread(target=worker, args=(i, i + 1)) for i in range(5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(edit_service.get_frame("E")["x"].tolist()) == [1, 2, 3, 4, 5]
    assert len(edit_service._get_session("E").undo_stack) == 5
