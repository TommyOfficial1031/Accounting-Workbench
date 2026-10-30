// Excel 兼容的 TSV 剪贴板：复制写 TSV，粘贴从 TSV 解析。

function escapeTsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[\t\n\r"]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeTsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeTsvCell).join("\t")).join("\r\n");
}

export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// 把编辑增量合并成一次 set_cells 的 payload（供单元测试的纯函数）。
export function buildSetCellsPayload(edits: Map<string, unknown>): { cells: { row: number; col: number; value: unknown }[] } {
  const cells: { row: number; col: number; value: unknown }[] = [];
  for (const [key, value] of edits.entries()) {
    const [row, col] = key.split(":").map(Number);
    cells.push({ row, col, value });
  }
  return { cells };
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}
