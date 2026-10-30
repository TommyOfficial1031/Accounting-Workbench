\# 后端局部规范



继承根目录 AGENTS.md。以下为补充与覆盖。



\## 允许引入的库

pandas, numpy, fastapi, uvicorn, pydantic, openpyxl, xlrd==1.2.0,

xlwt, reportlab, matplotlib, chardet, pyarrow, pytest, httpx, pypdf, pillow

（另用 Python 标准库 sqlite3，用于项目元数据存储，非第三方依赖）



\## 分层约束

\- routers/ 只做参数解析与响应包装，禁止业务逻辑。

\- services/ 编排流程，禁止直接操作 DataFrame。

\- compute/ 纯函数，禁止 import os / requests / fastapi。

\- storage/ 只做读写，禁止业务判断。

\- io/ 只做格式转换，禁止调用 compute/。



\## 函数约定

\- 所有 compute/ 下的函数必须是纯函数：输入 DataFrame + 配置，输出结果对象。

\- 所有对外函数必须有 pydantic 输入/输出模型。

\- 所有异常必须继承 AccountingError，并携带 code 与 message。



\## 测试

\- compute/ 下每个模块必须有对应 tests/ 文件。

\- 固定规则、占比、回归三块必须有数值对照测试。

