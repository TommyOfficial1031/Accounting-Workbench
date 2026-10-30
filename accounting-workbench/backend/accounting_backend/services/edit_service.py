"""编辑编排：工作副本 + undo/redo 栈 + pending_cut + 幂等 + 并发串行化。

每个 dataset 一个 EditSession，用 threading.Lock 串行化所有编辑指令，
避免快速连点（undo 与编辑并发）导致交错损坏。
"""

from __future__ import annotations

import threading
from typing import Optional

import pandas as pd

from accounting_backend.compute.edit_ops import apply_command, apply_inverse_command
from accounting_backend.errors import AccountingError
from accounting_backend.schemas.edit import EditRequest, EditResponse
from accounting_backend.storage.dataset_cache import load_dataframe

_UNDO_LIMIT = 100
_IDEMPOTENCY_LIMIT = 50


class EditSession:
    """单个 dataset 的编辑会话：工作副本 + undo/redo 栈 + pending_cut。"""

    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.undo_stack: list[tuple[dict, dict]] = []  # (forward, inverse)
        self.redo_stack: list[dict] = []  # forward
        self.pending_cut: Optional[dict] = None
        self.lock = threading.Lock()
        self._idempotency: dict[str, EditResponse] = {}

    def remember(self, key: str, response: EditResponse) -> None:
        self._idempotency[key] = response
        while len(self._idempotency) > _IDEMPOTENCY_LIMIT:
            self._idempotency.pop(next(iter(self._idempotency)))


_sessions: dict[str, EditSession] = {}
_sessions_lock = threading.Lock()


def _get_session(dataset_id: str) -> EditSession:
    with _sessions_lock:
        session = _sessions.get(dataset_id)
        if session is None:
            try:
                frame = load_dataframe(dataset_id)
            except FileNotFoundError as exc:
                raise AccountingError(
                    "DATASET_NOT_FOUND", f"数据集不存在：{dataset_id}", status_code=404
                ) from exc
            session = EditSession(frame)
            _sessions[dataset_id] = session
        return session


def register_dataframe(dataset_id: str, frame: pd.DataFrame) -> None:
    """导入后注册工作副本（覆盖已有的旧会话）。"""
    with _sessions_lock:
        _sessions[dataset_id] = EditSession(frame)


def get_frame(dataset_id: str) -> pd.DataFrame:
    """获取工作副本（供 compute / preview 读取编辑后的数据）。"""
    return _get_session(dataset_id).frame


def reset(dataset_id: str) -> None:
    """丢弃工作副本；下次访问从 parquet 重新加载（恢复导入初始）。"""
    with _sessions_lock:
        _sessions.pop(dataset_id, None)


def _response(session: EditSession) -> EditResponse:
    return EditResponse(
        success=True,
        row_count=len(session.frame),
        col_count=len(session.frame.columns),
        can_undo=len(session.undo_stack) > 0,
        can_redo=len(session.redo_stack) > 0,
    )


def apply(request: EditRequest, dataset_id: str) -> EditResponse:
    """串行执行一条编辑指令（带锁 + 幂等）。"""
    session = _get_session(dataset_id)
    with session.lock:
        key = request.idempotency_key
        if key and key in session._idempotency:
            return session._idempotency[key]
        response = _apply_unlocked(session, request, dataset_id)
        if key:
            session.remember(key, response)
        return response


def _apply_unlocked(session: EditSession, request: EditRequest, dataset_id: str) -> EditResponse:
    op = request.op
    payload = request.payload

    if op == "undo":
        return _undo(session)
    if op == "redo":
        return _redo(session)
    if op == "reset":
        reset(dataset_id)
        return _response(_get_session(dataset_id))
    if op == "cut":
        session.pending_cut = {"region": payload}
        return _response(session)
    if op == "paste":
        return _paste(session, payload)

    # 其它正向编辑命令会清除 pending_cut（剪切后未粘贴改做别的操作）
    session.pending_cut = None
    cmd = {"op": op, "payload": payload}
    new_df, inverse = apply_command(session.frame, cmd)
    session.frame = new_df
    _push_undo(session, cmd, inverse)
    return _response(session)


def _paste(session: EditSession, payload: dict) -> EditResponse:
    pending = session.pending_cut
    session.pending_cut = None
    if pending is None:
        cmd = {"op": "paste", "payload": payload}
        new_df, inverse = apply_command(session.frame, cmd)
        session.frame = new_df
        _push_undo(session, cmd, inverse)
        return _response(session)

    # 剪切后粘贴：清空原区域 + 写入数据，一步 undo
    cmd = {
        "op": "cut_paste",
        "payload": {
            "target_row": payload["target_row"],
            "target_col": payload["target_col"],
            "data": payload["data"],
            "clear_region": pending["region"],
        },
    }
    new_df, inverse = apply_command(session.frame, cmd)
    session.frame = new_df
    _push_undo(session, cmd, inverse)
    return _response(session)


def _undo(session: EditSession) -> EditResponse:
    if not session.undo_stack:
        return _response(session)
    forward, inverse = session.undo_stack.pop()
    session.frame = apply_inverse_command(session.frame, inverse)
    session.redo_stack.append(forward)
    return _response(session)


def _redo(session: EditSession) -> EditResponse:
    if not session.redo_stack:
        return _response(session)
    forward = session.redo_stack.pop()
    new_df, inverse = apply_command(session.frame, forward)
    session.frame = new_df
    session.undo_stack.append((forward, inverse))
    return _response(session)


def _push_undo(session: EditSession, forward: dict, inverse: dict) -> None:
    session.undo_stack.append((forward, inverse))
    if len(session.undo_stack) > _UNDO_LIMIT:
        session.undo_stack.pop(0)
    session.redo_stack.clear()
