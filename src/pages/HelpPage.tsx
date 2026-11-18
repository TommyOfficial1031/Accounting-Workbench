import { useState } from "react";
import styles from "./HelpPage.module.css";

type DocId = "start" | "import" | "rules" | "keys" | "faq";

const DOCS: { id: DocId; label: string }[] = [
  { id: "start", label: "快速上手" },
  { id: "import", label: "导入须知" },
  { id: "rules", label: "固定规则口径" },
  { id: "keys", label: "快捷键" },
  { id: "faq", label: "常见问题" },
];

/** 帮助页：六个分页，文案照 _proto/shell-demo.html 的 HELP_DOCS。 */
function HelpPage() {
  const [doc, setDoc] = useState<DocId>("start");

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.title}>帮助</div>
          <div className={styles.sub}>软件说明文档</div>
        </div>
      </header>

      <div className={styles.wrap}>
        <aside className={styles.toc}>
          {DOCS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === doc ? styles.on : ""}
              onClick={() => setDoc(item.id)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className={styles.body}>
          {doc === "start" && (
            <article>
              <h2>快速上手</h2>
              <ol>
                <li>点击「新建项目」，填写项目名与创建人，选择要导入的 xlsx / xls / csv 文件。</li>
                <li>导入后在表格界面核对数据，可增删行列、复制粘贴、撤销重做。</li>
                <li>点击「分析」，选择时间范围、分组维度与指标；需要标准口径时直接用「固定规则」。</li>
                <li>在右侧结果区查看数字表格或图表，确认无误后导出。</li>
              </ol>
              <h4>说明</h4>
              <p>所有计算与数据都保存在本机，不会上传到任何服务器。</p>
            </article>
          )}

          {doc === "import" && (
            <article>
              <h2>导入须知</h2>
              <ul>
                <li>只读取第一个 Sheet；多 Sheet 文件会提示。</li>
                <li>xlsx / xls / csv 均可导入，自动识别表头与列类型。</li>
                <li>xls 格式上限 65,536 行，超出请另存为 xlsx。</li>
                <li>公式、条件格式、颜色填充不会保留，请先在 Excel 中清洗为纯值。</li>
              </ul>
              <h4>字段识别</h4>
              <p>导入后会自动匹配 44 个预定义字段。命中 ≥ 10 个时启用「固定规则」与五类分类导航。</p>
            </article>
          )}

          {doc === "rules" && (
            <article>
              <h2>固定规则口径</h2>
              <h4>网点货量分析</h4>
              <p>
                货量 = sum(结算重量)，按「账单时间 / 寄件所属一级网点 / 目的所属省份 / 公斤段 /
                物品来源 / 是否剔除」分组。
              </p>
              <h4>网点单公斤价格分析</h4>
              <p>单公斤价格 = sum(现价) ÷ sum(结算重量)，分组同上。</p>
              <h4>网点折扣分析</h4>
              <p>折扣 = sum(现价) ÷ sum(原价)。分母为 0 时留空，不输出 inf / NaN。</p>
              <p className={styles.tiny}>
                缺字段时不会静默降级：会弹窗列出缺失字段，并允许继续自定义分析。
              </p>
            </article>
          )}

          {doc === "keys" && (
            <article>
              <h2>快捷键</h2>
              <table>
                <thead>
                  <tr>
                    <th>快捷键</th>
                    <th>功能</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>
                    </td>
                    <td>新建项目</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>
                    </td>
                    <td>分析数据</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>S</kbd>
                    </td>
                    <td>保存项目</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>F</kbd>
                    </td>
                    <td>查找单元格</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+
                      <kbd>Z</kbd>
                    </td>
                    <td>撤销 / 重做</td>
                  </tr>
                  <tr>
                    <td>
                      <kbd>Ctrl</kbd>+<kbd>A</kbd> / <kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd>
                    </td>
                    <td>全选 / 复制 / 剪切 / 粘贴</td>
                  </tr>
                </tbody>
              </table>
              <p className={styles.tiny}>macOS 上 Ctrl 对应 ⌘。</p>
            </article>
          )}

          {doc === "faq" && (
            <article>
              <h2>常见问题</h2>
              <h4>导入后列名不是我期望的？</h4>
              <p>第一行会被当作列名；空列名自动补为「列1、列2…」，重复列名追加 _2、_3。</p>
              <h4>为什么「固定规则」是灰的？</h4>
              <p>命中预定义字段不足 10 个。可继续使用自由分析。</p>
              <h4>导出 xls 为什么被禁用？</h4>
              <p>xls 上限 65,536 行 / 256 列，超限时禁用并提示改用 xlsx。</p>
              <h4>复制整列只复制了一部分？</h4>
              <p>复制只取表格里已加载的行（滚动到的分块）。要整表导出请用「分析 → 导出」。</p>
              <h4>数据会被上传吗？</h4>
              <p>不会。后端是本机 sidecar，仅监听 127.0.0.1。</p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

export default HelpPage;
