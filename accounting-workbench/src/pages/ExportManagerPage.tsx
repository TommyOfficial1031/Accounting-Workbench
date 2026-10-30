import { useEffect, useState } from "react";
import { useExportStore } from "../stores/exportStore";
import styles from "./ExportManagerPage.module.css";

/** 导出文件管理：文件名 / 导出时间 / 归属项目 / 创建人 / 路径 + 打开文件、打开路径。 */
function ExportManagerPage() {
  const records = useExportStore((state) => state.records);
  const query = useExportStore((state) => state.query);
  const loading = useExportStore((state) => state.loading);
  const error = useExportStore((state) => state.error);
  const load = useExportStore((state) => state.load);
  const setQuery = useExportStore((state) => state.setQuery);
  const remove = useExportStore((state) => state.remove);
  const clear = useExportStore((state) => state.clear);
  const openFile = useExportStore((state) => state.openFile);
  const openFolder = useExportStore((state) => state.openFolder);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleOpen(path: string, kind: "file" | "folder"): Promise<void> {
    const message =
      kind === "folder" ? await openFolder(path) : await openFile(path);
    setHint(message);
  }

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <div className={styles.title}>导出文件</div>
          <div className={styles.sub}>按导出时间倒序 · 记录只保存在本机</div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={records.length === 0}
            onClick={() => void clear()}
          >
            清空记录
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.find}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            placeholder="搜索文件名 / 项目 / 创建人 / 路径…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load(query);
              if (event.key === "Escape") {
                setQuery("");
                void load("");
              }
            }}
          />
          <button type="button" onClick={() => void load(query)}>
            搜索
          </button>
        </div>
        <span className="spacer" />
        <span className={styles.count}>
          {loading ? "加载中…" : `共 ${records.length} 条`}
        </span>
      </div>

      {error !== null && <p className={styles.error}>{error}</p>}
      {hint !== null && (
        <p className={styles.hint} onClick={() => setHint(null)}>
          {hint}
        </p>
      )}

      <div className={styles.body}>
        {records.length === 0 && !loading ? (
          <div className={styles.empty}>
            <div>还没有导出记录</div>
            <div className={styles.emptyHint}>
              在分析页或盈亏平衡页导出文件后，这里会自动登记
            </div>
          </div>
        ) : (
          <table className={`table ${styles.table}`}>
            <thead>
              <tr>
                <th>文件名称</th>
                <th>导出时间</th>
                <th>归属项目</th>
                <th>创建人</th>
                <th>文件路径</th>
                <th className={styles.opHead}>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td title={record.name}>
                    <span className={record.kind === "folder" ? styles.folder : styles.file}>
                      {record.kind === "folder" ? "📁" : "📄"}
                    </span>
                    {record.name}
                  </td>
                  <td className={styles.time}>{record.exported_at}</td>
                  <td title={record.project_name ?? ""}>{record.project_name ?? "—"}</td>
                  <td>{record.creator ?? "—"}</td>
                  <td className={styles.path} title={record.path}>
                    {record.path}
                  </td>
                  <td className={styles.ops}>
                    <button
                      type="button"
                      className={styles.link}
                      disabled={record.kind === "folder"}
                      title={record.kind === "folder" ? "文件夹请用「打开路径」" : "用默认程序打开"}
                      onClick={() => void handleOpen(record.path, "file")}
                    >
                      打开文件
                    </button>
                    <button
                      type="button"
                      className={styles.link}
                      title="在资源管理器中定位"
                      onClick={() => void handleOpen(record.path, "folder")}
                    >
                      打开路径
                    </button>
                    <button
                      type="button"
                      className={styles.linkDanger}
                      title="只删记录，不删磁盘文件"
                      onClick={() => void remove(record.id)}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default ExportManagerPage;
