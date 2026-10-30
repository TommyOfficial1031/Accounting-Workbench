"""让 ``accounting_backend`` 包在运行 pytest 时可被导入。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
