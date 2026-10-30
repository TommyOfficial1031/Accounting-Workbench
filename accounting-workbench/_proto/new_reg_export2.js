/* ═══════════════════ 导出：一个文件夹 + 多选文件 ═══════════════════ */
/**
 * 文件夹名：<已勾选的维度取值>盈亏平衡与折扣分析 - YYYY-MM-DD HH：MM
 *   每个维度内多个值用「、」连接，维度之间用「 · 」；没勾取值写「全部」，手动模式写「手动测算」。
 *   时间用「空格 + 全角冒号」：Windows 文件名不允许半角「:」，否则建文件夹 / 解压都会失败。
 */
function regExportFolderName(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}：${pad(d.getMinutes())}`;
  const pickDims = REG_GROUP_FIELDS.filter((item) => (REG_TABLE.picks[item.key] || []).length > 0).map((item) =>
    REG_TABLE.picks[item.key].join("、")
  );
  const prefix = REG.mode === "table" ? (pickDims.length ? pickDims.join(" · ") : "全部") : "手动测算";
  return `${prefix}盈亏平衡与折扣分析 - ${stamp}`;
}

/** 文件名里不能出现的字符 */
function regSafeName(text) {
  return String(text).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

/** 可导出的文件清单（顺序即显示顺序） */
function regExportFileList(M) {
  const groups = M.tableMode ? (M.groups || []) : [];
  const labels = M.tableMode ? groups.map((g) => g.label) : ["货量-利润"];
  const list = [
    { kind: "pdf", name: "盈亏平衡与折扣分析.pdf", note: "结论卡 + 调整盈亏分析 + 全部小图 + 汇算明细" },
    { kind: "grid", name: "小图网格.jpg", note: `${labels.length} 张按 3 列拼成一张` }
  ];
  labels.forEach((label, i) => {
    list.push({
      kind: "mini",
      index: i,
      name: `小图-${String(i + 1).padStart(2, "0")}-${regSafeName(label)}.jpg`,
      note: M.tableMode
        ? `${regMoney(groups[i].profitNow)} / ${groups[i].filled ? regMoney(groups[i].profitPlan) : "待填"}`
        : "调整前 / 调整后"
    });
  });
  list.push({ kind: "xlsx", name: "汇算明细表.xlsx", note: `${labels.length || 0} 行 + 合计` });
  return list;
}

/* ── 小工具：CRC32 / ZIP(store) / 单页 PDF ── */
const REG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function regCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = REG_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function regU8(text) {
  return new TextEncoder().encode(text);
}

/** 不压缩 ZIP（够用，且不引第三方库） */
function regZipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  entries.forEach((entry) => {
    const nameBytes = regU8(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = regCrc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);
    const dir = new Uint8Array(46 + nameBytes.length);
    const dv2 = new DataView(dir.buffer);
    dv2.setUint32(0, 0x02014b50, true);
    dv2.setUint16(4, 20, true);
    dv2.setUint16(6, 20, true);
    dv2.setUint16(8, 0x0800, true);
    dv2.setUint32(16, crc, true);
    dv2.setUint32(20, data.length, true);
    dv2.setUint32(24, data.length, true);
    dv2.setUint16(28, nameBytes.length, true);
    dv2.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    central.push(dir);
    offset += local.length + data.length;
  });
  const centralSize = central.reduce((a, d) => a + d.length, 0);
  const end = new Uint8Array(22);
  const dv3 = new DataView(end.buffer);
  dv3.setUint32(0, 0x06054b50, true);
  dv3.setUint16(8, entries.length, true);
  dv3.setUint16(10, entries.length, true);
  dv3.setUint32(12, centralSize, true);
  dv3.setUint32(16, offset, true);
  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  chunks.forEach((c) => {
    out.set(c, p);
    p += c.length;
  });
  central.forEach((c) => {
    out.set(c, p);
    p += c.length;
  });
  out.set(end, p);
  return out;
}

/** 单页 PDF：一张 JPEG 铺满整页（整页长图导出） */
function regPdfFromJpeg(jpeg, w, h) {
  const jpegBytes = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
  const contentBytes = regU8(content);
  const parts = [];
  const offsets = [];
  let length = 0;
  const emit = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const emitText = (text) => emit(regU8(text));
  emitText("%PDF-1.4\n");
  const object = (id, head, stream) => {
    offsets[id] = length;
    emitText(`${id} 0 obj\n${head}\n`);
    if (stream) {
      emitText("stream\n");
      emit(stream);
      emitText("\nendstream\n");
    }
    emitText("endobj\n");
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`,
    jpegBytes
  );
  object(5, `<< /Length ${contentBytes.length} >>`, contentBytes);
  const xrefPos = length;
  emitText("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) emitText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  emitText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let p = 0;
  parts.forEach((c) => {
    out.set(c, p);
    p += c.length;
  });
  return out;
}

/** 表格数据（表头 + 明细 + 合计），导出与 XLSX 共用 */
function regXlsxRows(M) {
  if (!M.tableMode) {
    const rows = [["相对计划货量", "承诺货量", "该量下的保本折扣", "中心利润", "利润率"]];
    regSteps(M).forEach(({ tag, z }) => {
      const p = M.profit(z);
      const rev = M.Pplan * z + M.B;
      const need = M.P0 > 0 && z > 0 ? (M.C - M.B / z) / M.P0 : "";
      rows.push([tag, Math.round(z), Number.isFinite(need) ? Number(need.toFixed(4)) : "", Math.round(p), rev ? p / rev : ""]);
    });
    return rows;
  }
  const rows = [["分组", "数据货量", "原价", "现价", "折扣", "成本", "计划折扣", "计划货量", "调整前", "调整后", "利润率", "判定"]];
  const judge = (g) => (!g.filled ? "待填值" : g.profitPlan > 0 ? "盈利" : g.profitPlan < 0 ? "亏损" : "持平");
  (M.groups || []).forEach((g) => {
    rows.push([
      g.label,
      Math.round(g.z),
      Number.isFinite(g.P0) ? Number(g.P0.toFixed(4)) : "",
      Number.isFinite(g.P) ? Number(g.P.toFixed(4)) : "",
      g.d,
      Number(g.C.toFixed(4)),
      g.filled ? g.dPlan : "",
      g.filled ? Math.round(g.zPlan) : "",
      Math.round(g.profitNow),
      g.filled ? Math.round(g.profitPlan) : "",
      g.filled && Number.isFinite(g.ratePlan) ? g.ratePlan : "",
      judge(g)
    ]);
  });
  const t = regTableResult();
  rows.push([
    "合计",
    Math.round(t.z),
    Number.isFinite(t.P0) ? Number(t.P0.toFixed(4)) : "",
    Number.isFinite(t.P) ? Number(t.P.toFixed(4)) : "",
    t.d,
    "",
    Number.isFinite(t.dPlan) ? Number(t.dPlan.toFixed(4)) : "",
    Number.isFinite(t.zPlan) ? Math.round(t.zPlan) : "",
    Math.round(t.profitNow),
    Number.isFinite(t.profitPlan) ? Math.round(t.profitPlan) : "",
    Number.isFinite(t.revenuePlan) && t.revenuePlan !== 0 ? t.profitPlan / t.revenuePlan : "",
    ""
  ]);
  return rows;
}

/** 哪些列要按百分比显示（0.8883 → 88.8%） */
function regXlsxPercentCols(M) {
  return M.tableMode ? [4, 6, 10] : [2, 4];
}

/** 汇算明细 → XLSX（标题行 + 百分比格式 + 合计行） */
function regXlsxFromGroups(M) {
  const rows = regXlsxRows(M);
  const percentCols = regXlsxPercentCols(M);
  const title = "汇算明细表";
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colName = (c) => (c < 26 ? String.fromCharCode(65 + c) : `A${String.fromCharCode(65 + c - 26)}`);

  /* 行 1 = 标题；行 2 = 空；行 3 = 表头；之后是数据 */
  const sheetRows = [];
  sheetRows.push(`<row r="1"><c r="A1" s="2" t="inlineStr"><is><t>${esc(title)}</t></is></c></row>`);
  sheetRows.push(`<row r="2"></row>`);
  rows.forEach((row, r) => {
    const rowNo = r + 3;
    const isHeader = r === 0;
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${rowNo}`;
      const numeric = typeof v === "number" && Number.isFinite(v);
      const style = isHeader ? 3 : numeric && percentCols.includes(c) ? 1 : 0;
      const sAttr = style ? ` s="${style}"` : "";
      return numeric
        ? `<c r="${ref}"${sAttr}><v>${v}</v></c>`
        : `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${esc(v === undefined ? "" : v)}</t></is></c>`;
    });
    sheetRows.push(`<row r="${rowNo}">${cells.join("")}</row>`);
  });

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    sheetRows.join("") +
    `</sheetData></worksheet>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>` +
    `<fonts count="3">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs></styleSheet>`;

  return regZipStore([
    {
      name: "[Content_Types].xml",
      data: regU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`
      )
    },
    {
      name: "_rels/.rels",
      data: regU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      )
    },
    {
      name: "xl/workbook.xml",
      data: regU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="汇算明细" sheetId="1" r:id="rId1"/></sheets></workbook>`
      )
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: regU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      )
    },
    { name: "xl/worksheets/sheet1.xml", data: regU8(sheet) },
    { name: "xl/styles.xml", data: regU8(styles) }
  ]);
}

/* ── 浏览器侧：SVG → 图片、拼图、长图、写文件夹 ── */
function regInlineVars(text) {
  const cs = getComputedStyle(document.documentElement);
  return text.replace(/var\((--[a-z0-9-]+)(?:\s*,[^)]*)?\)/gi, (m, name) => {
    const value = cs.getPropertyValue(name).trim();
    if (value) return value;
    if (name.includes("danger")) return "#ff3b30";
    if (name.includes("success")) return "#34c759";
    if (name.includes("warning")) return "#ff9500";
    return "#1d1d1f";
  });
}

function regSvgToCanvas(svgEl, scale) {
  return new Promise((resolve, reject) => {
    const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
    const bw = (vb && vb.width) || svgEl.clientWidth || 360;
    const bh = (vb && vb.height) || svgEl.clientHeight || 226;
    const w = Math.round(bw * scale);
    const h = Math.round(bh * scale);
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);
    const text = regInlineVars(new XMLSerializer().serializeToString(clone));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(cv);
    };
    img.onerror = () => reject(new Error("SVG 转图片失败"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
  });
}

function regCanvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type || "image/jpeg", quality || 0.92));
}

/** 要导出的图：表格模式取每张小图；手动模式取那张通栏图 */
function regExportParts() {
  const mini = $$("#reg-charts .reg-mini-box svg");
  if (mini.length) {
    const titles = $$("#reg-charts .reg-mini-title").map((el) => el.textContent.trim());
    const legends = $$("#reg-charts .reg-mini-legend").map((el) => el.textContent.replace(/\s+/g, " ").trim());
    return mini.map((svg, i) => ({ svg, title: titles[i] || "", legend: legends[i] || "" }));
  }
  const box = $("#reg-chart");
  const svg = box && box.querySelector("svg");
  if (!svg) return [];
  const legendBox = $("#reg-pol-note");
  return [{ svg, title: "货量 – 利润", legend: legendBox ? legendBox.textContent.replace(/\s+/g, " ").trim() : "" }];
}

/** 单张图：标题 + 图 + 图例（导出的小图必须带图例） */
async function regComposedCanvas(part, scale) {
  const chart = await regSvgToCanvas(part.svg, scale || 2);
  const pad = Math.round(12 * (scale || 2) * 0.6);
  const titleH = Math.round(30 * (scale || 2) * 0.55);
  const legendH = Math.round(26 * (scale || 2) * 0.55);
  const out = document.createElement("canvas");
  out.width = chart.width + pad * 2;
  out.height = titleH + chart.height + legendH + pad * 2;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#1d1d1f";
  ctx.font = `600 ${Math.round(9 * (scale || 2))}px system-ui, sans-serif`;
  ctx.fillText(part.title || "", pad, pad);
  ctx.drawImage(chart, pad, pad + titleH);
  ctx.fillStyle = "#6e6e73";
  ctx.font = `${Math.round(7.5 * (scale || 2))}px system-ui, sans-serif`;
  ctx.fillText(part.legend || "", pad, pad + titleH + chart.height + 6);
  return out;
}

/** 全部小图按 3 列拼成一张长图（带标题与图例） */
async function regGridCanvas(scale) {
  const parts = regExportParts();
  if (!parts.length) throw new Error("没有可导出的小图");
  const cells = [];
  for (const part of parts) cells.push(await regComposedCanvas(part, (scale || 2) * 0.8));
  const cols = Math.min(3, cells.length);
  const rows = Math.ceil(cells.length / cols);
  const gap = 26;
  const cellW = Math.max(...cells.map((c) => c.width));
  const cellH = Math.max(...cells.map((c) => c.height));
  const out = document.createElement("canvas");
  out.width = cols * cellW + (cols + 1) * gap;
  out.height = rows * cellH + (rows + 1) * gap;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  cells.forEach((cv, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(cv, gap + col * (cellW + gap), gap + row * (cellH + gap));
  });
  return out;
}

/** 按宽度折行 */
function regWrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of String(text)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 整页长图：四个板块，板块之间有标题与分隔线 */
async function regFullPageCanvas(scale) {
  const M = regModel();
  const grid = await regGridCanvas(scale || 2);
  const t = regTableResult();
  const pad = 56;
  const width = Math.max(grid.width + pad * 2, 1680);
  const s = scale || 2;

  /* 先量一遍高度：分析段与表格行数决定长度 */
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `${Math.round(8 * s)}px system-ui, sans-serif`;
  const adviceLines = regWrapText(probe, regAdviceText(M).plain, width - pad * 2);
  const tableRows = regXlsxRows(M);
  const rowH = Math.round(15 * s * 0.85);
  const tableH = Math.round(22 * s * 0.85) + tableRows.length * rowH;

  const sectionTitleH = Math.round(26 * s * 0.8);
  const out = document.createElement("canvas");
  out.width = width;
  out.height =
    pad + Math.round(40 * s * 0.8) + Math.round(20 * s * 0.8) + 24 + // 标题区
    sectionTitleH + Math.round(20 * s * 0.8) * 3 + 24 + // 一、结论
    sectionTitleH + adviceLines.length * Math.round(9 * s) + 34 + // 二、分析
    sectionTitleH + grid.height + 34 + // 三、小图
    sectionTitleH + tableH + pad; // 四、汇算明细
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textBaseline = "top";

  let y = pad;
  ctx.fillStyle = "#1d1d1f";
  ctx.font = `700 ${Math.round(18 * s * 0.8)}px system-ui, sans-serif`;
  ctx.fillText("盈亏平衡与折扣分析", pad, y);
  y += Math.round(26 * s * 0.8);
  ctx.fillStyle = "#6e6e73";
  ctx.font = `${Math.round(8 * s)}px system-ui, sans-serif`;
  ctx.fillText(regExportFolderName(), pad, y);
  y += Math.round(20 * s * 0.8);

  const section = (title) => {
    ctx.strokeStyle = "#e5e5ea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(out.width - pad, y);
    ctx.stroke();
    y += 10;
    ctx.fillStyle = "#1d1d1f";
    ctx.font = `600 ${Math.round(10 * s)}px system-ui, sans-serif`;
    ctx.fillText(title, pad, y);
    y += sectionTitleH;
  };

  /* 一、分析结论 */
  section("一、分析结论");
  const before = M.profitNow;
  const after = M.tableMode ? M.profitPlan : M.profit(M.Z);
  ctx.fillStyle = "#1d1d1f";
  ctx.font = `${Math.round(8.5 * s)}px system-ui, sans-serif`;
  [
    `① 政策调整前：${regMoney(before)}（利润率 ${regPct(M.rateNow, 2)}）`,
    `② 政策调整后：${Number.isFinite(after) ? regMoney(after) : "待填四个值"}（${
      M.tableMode ? `已填 ${M.filledCount}/${M.groups.length} 组` : `利润率 ${regPct(M.rate, 2)}`
    }）`
  ].forEach((line) => {
    ctx.fillText(line, pad, y);
    y += Math.round(12 * s * 0.9);
  });
  y += 8;

  /* 二、调整盈亏情况分析 */
  section("二、调整盈亏情况分析");
  ctx.fillStyle = "#3a3a3c";
  ctx.font = `${Math.round(8 * s)}px system-ui, sans-serif`;
  adviceLines.forEach((line) => {
    ctx.fillText(line, pad, y);
    y += Math.round(9 * s);
  });
  y += 10;

  /* 三、分组小图 */
  section(`三、分组小图（${regExportParts().length} 张）`);
  ctx.drawImage(grid, pad, y);
  y += grid.height + 10;

  /* 四、汇算明细表 */
  section("四、" + (M.tableMode ? "汇算明细表" : "不同承诺货量下的利润"));
  const percentCols = regXlsxPercentCols(M);
  const colW = Math.floor((out.width - pad * 2) / tableRows[0].length);
  const fmt = (v, c) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return v === "" ? "" : String(v);
    return percentCols.includes(c) ? `${(v * 100).toFixed(1)}%` : v.toLocaleString("zh-CN");
  };
  tableRows.forEach((row, r) => {
    ctx.fillStyle = r === 0 ? "#6e6e73" : "#1d1d1f";
    ctx.font = `${r === 0 ? "600 " : ""}${Math.round(7.5 * s)}px system-ui, sans-serif`;
    row.forEach((v, c) => ctx.fillText(String(fmt(v, c)).slice(0, 18), pad + c * colW, y));
    y += rowH;
  });
  return out;
}

function regDownloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * 按用户勾选生成文件。
 * picks：要导出的清单下标数组（对应 regExportFileList 的顺序）
 */
async function regBuildExportFiles(picks) {
  const M = regModel();
  const parts = regExportParts();
  if (!parts.length) throw new Error("当前没有可导出的图");
  const list = regExportFileList(M);
  const chosen = Array.isArray(picks) && picks.length ? picks : list.map((_, i) => i);
  const files = [];

  const wantsPdf = chosen.some((i) => list[i] && list[i].kind === "pdf");
  const wantsGrid = chosen.some((i) => list[i] && list[i].kind === "grid");
  const wantsXlsx = chosen.some((i) => list[i] && list[i].kind === "xlsx");
  const miniIdx = chosen.filter((i) => list[i] && list[i].kind === "mini").map((i) => list[i].index);

  if (wantsPdf) {
    const pageCanvas = await regFullPageCanvas(2);
    const pageJpeg = new Uint8Array(await (await regCanvasToBlob(pageCanvas)).arrayBuffer());
    files.push({
      name: "盈亏平衡与折扣分析.pdf",
      blob: new Blob([regPdfFromJpeg(pageJpeg, pageCanvas.width, pageCanvas.height)], { type: "application/pdf" })
    });
  }
  if (wantsGrid) {
    files.push({ name: "小图网格.jpg", blob: await regCanvasToBlob(await regGridCanvas(2)) });
  }
  for (const idx of miniIdx) {
    const part = parts[idx];
    if (!part) continue;
    const cv = await regComposedCanvas(part, 3);
    files.push({
      name: `小图-${String(idx + 1).padStart(2, "0")}-${regSafeName(part.title || `图${idx + 1}`)}.jpg`,
      blob: await regCanvasToBlob(cv)
    });
  }
  if (wantsXlsx) {
    files.push({
      name: "汇算明细表.xlsx",
      blob: new Blob([regXlsxFromGroups(M)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    });
  }
  if (!files.length) throw new Error("没有勾选任何文件");
  return { folder: regExportFolderName(), files };
}

/** 写文件夹：优先真建文件夹（File System Access），否则打包成 ZIP 下载 */
async function regWriteExportFolder(folder, files) {
  if (typeof window !== "undefined" && window.showDirectoryPicker) {
    try {
      const root = await window.showDirectoryPicker({ mode: "readwrite", id: "reg-export" });
      const dir = await root.getDirectoryHandle(folder, { create: true });
      for (const f of files) {
        const handle = await dir.getFileHandle(f.name, { create: true });
        const writer = await handle.createWritable();
        await writer.write(f.blob);
        await writer.close();
      }
      return "folder";
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
    }
  }
  const entries = [];
  for (const f of files) entries.push({ name: `${folder}/${f.name}`, data: new Uint8Array(await f.blob.arrayBuffer()) });
  regDownloadBlob(new Blob([regZipStore(entries)], { type: "application/zip" }), `${folder}.zip`);
  return "zip";
}

/** 导出对话框：文件可多选（默认全选） */
function regOpenExportDialog() {
  const M = regModel();
  const list = regExportFileList(M);
  const folder = regExportFolderName();
  hideCtx();
  const pop = document.createElement("div");
  pop.className = "picker reg-export-dialog";
  pop.innerHTML = `
    <div style="padding:2px 4px 8px">
      <div style="font-weight:600;font-size:14px">导出</div>
      <div class="tiny" style="margin-top:6px;line-height:1.6">文件夹：<b>${folder}</b></div>
    </div>
    <div class="reg-exp-tools">
      <span class="tiny">勾选要导出的文件（默认全选）</span>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" data-exp-all>全选</button>
      <button class="btn btn-ghost" data-exp-none>清空</button>
    </div>
    <div class="reg-exp-list">
      ${list
        .map(
          (f, i) => `<label class="reg-exp-row">
            <input type="checkbox" data-exp-pick="${i}" checked />
            <span class="reg-exp-main"><b>${f.name}</b><i>${f.note}</i></span>
          </label>`
        )
        .join("")}
    </div>
    <div class="picker-foot">
      <button class="btn btn-ghost" data-exp-cancel>取消</button>
      <span style="flex:1"></span>
      <button class="btn btn-primary" data-exp-ok>导出</button>
    </div>`;
  const boxes = () => [...pop.querySelectorAll("[data-exp-pick]")];
  pop.querySelector("[data-exp-all]").addEventListener("click", () => boxes().forEach((box) => { box.checked = true; }));
  pop.querySelector("[data-exp-none]").addEventListener("click", () => boxes().forEach((box) => { box.checked = false; }));
  pop.querySelector("[data-exp-cancel]").addEventListener("click", () => pop.remove());
  pop.querySelector("[data-exp-ok]").addEventListener("click", async () => {
    const picks = boxes().filter((box) => box.checked).map((box) => Number(box.dataset.expPick));
    if (!picks.length) {
      toast("至少勾选一个文件");
      return;
    }
    const btn = pop.querySelector("[data-exp-ok]");
    btn.disabled = true;
    btn.textContent = "导出中…";
    try {
      const built = await regBuildExportFiles(picks);
      const where = await regWriteExportFolder(built.folder, built.files);
      pop.remove();
      toast(where === "folder" ? `已写入文件夹「${built.folder}」（${built.files.length} 个文件）` : `已打包下载 ${built.folder}.zip`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "导出";
      toast(`导出失败：${err && err.message ? err.message : err}`);
    }
  });
  document.body.appendChild(pop);
  pop.addEventListener("click", (event) => event.stopPropagation());
  pop.style.width = "600px";
  pop.style.left = Math.max(16, window.innerWidth / 2 - 300) + "px";
  pop.style.top = "80px";
}
