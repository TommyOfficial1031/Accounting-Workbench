/* ═══════════════════ 分析页：条件即维度（可真实计算） ═══════════════════ */
const TEXT_OPS = [
  { v: "eq", label: "等于" }, { v: "ne", label: "不等于" },
  { v: "startsWith", label: "开头是" }, { v: "endsWith", label: "结尾是" },
  { v: "contains", label: "包含" }, { v: "notContains", label: "不包含" }
];
const NUM_OPS = [
  { v: "eq", label: "等于" }, { v: "ne", label: "不等于" },
  { v: "gt", label: "大于" }, { v: "ge", label: "大于或等于" },
  { v: "lt", label: "小于" }, { v: "le", label: "小于或等于" },
  { v: "between", label: "介于" },
  { v: "aboveAvg", label: "高于平均值" }, { v: "belowAvg", label: "低于平均值" }
];
const AGGS = [
  { v: "sum", label: "求和", short: "合计" },
  { v: "avg", label: "求平均值", short: "均值" },
  { v: "median", label: "求中位数", short: "中位" },
  { v: "max", label: "求最大值", short: "最大" },
  { v: "min", label: "求最小值", short: "最小" },
  { v: "count", label: "计数", short: "计数" }
];
const CONNECTORS = ["AND", "+", "−", "×", "÷"];
const NO_VALUE_OPS = new Set(["aboveAvg", "belowAvg"]);
const ALL = "*";

const analysisState = {
  range: "本月",
  from: "2026-10-01",
  to: "2026-10-31",
  filters: [
    { field: "寄件所属一级网点", op: "eq", value: ALL },
    { field: "公斤段", op: "eq", value: "150-300" }
  ],
  metrics: [
    { field: "现价", agg: "sum", op: "÷" },
    { field: "原价", agg: "sum", op: "" }
  ],
  chartType: "line",
  chartX: null,
  chartY: [],
  result: null,
  tab: "table"
};

const fieldMeta = (name) => GRID_META.find((m) => m.name === name) ?? { name, type: "text" };
const opsFor = (name) => (fieldMeta(name).type === "number" ? NUM_OPS : TEXT_OPS);
const isTextField = (name) => fieldMeta(name).type !== "number";
const aggMeta = (v) => AGGS.find((a) => a.v === v) ?? AGGS[0];
const metricLabel = (metric) => `${metric.field}${aggMeta(metric.agg).short}`;
const isDim = (filter) => filter.value === ALL && (filter.op === "eq" || filter.op === "ne");
const fmtNum = (v) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";

function rangedRows() {
  return DEMO_ROWS.filter((row) => {
    const t = String(row["账单时间"]);
    return t >= analysisState.from && t <= analysisState.to;
  });
}
function distinctValues(name) {
  const set = new Set();
  rangedRows().forEach((row) => {
    const value = row[name];
    if (value !== "" && value !== null && value !== undefined) set.add(String(value));
  });
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
function fieldHasData(name) {
  return rangedRows().some((row) => {
    const value = row[name];
    return value !== "" && value !== null && value !== undefined;
  });
}

function renderAnalysisConfig() {
  renderFilterRows();
  renderMetricRows();
  renderDerived();
  $$("#a-range button").forEach((b) => b.classList.toggle("on", b.dataset.v === analysisState.range));
  const custom = analysisState.range === "自定义";
  $("#a-from").value = analysisState.from;
  $("#a-to").value = analysisState.to;
  $("#a-from").disabled = !custom;
  $("#a-to").disabled = !custom;
}

function valueCellHtml(filter, index) {
  if (NO_VALUE_OPS.has(filter.op)) return `<div class="no-value">无需填值</div>`;
  if (filter.op === "between") {
    const a = filter.value === ALL ? "" : filter.value;
    return `<div class="two-input"><input class="input" data-fv="${index}" value="${a}" placeholder="下限" /><span class="tiny">~</span><input class="input" data-fv2="${index}" value="${filter.value2}" placeholder="上限" /></div>`;
  }
  if (isTextField(filter.field) && (filter.op === "eq" || filter.op === "ne")) {
    const values = distinctValues(filter.field);
    return `<select class="input" data-fvsel="${index}">
      <option value="${ALL}" ${filter.value === ALL ? "selected" : ""}>全部（按此字段展开）</option>
      ${values.map((v) => `<option value="${v}" ${filter.value === v ? "selected" : ""}>${v}</option>`).join("")}
    </select>`;
  }
  const value = filter.value === ALL ? "" : filter.value;
  return `<input class="input" data-fv="${index}" value="${value}" placeholder="${
    isTextField(filter.field) ? "文本" : "数值"
  }" />`;
}

function renderFilterRows() {
  const host = $("#a-filters");
  if (analysisState.filters.length === 0) {
    host.innerHTML = `<div class="no-value">没有条件：结果只有一行全表合计</div>`;
    return;
  }
  host.innerHTML = analysisState.filters
    .map(
      (filter, index) => `
      <div class="filter-row">
        <button class="input" data-pick-field="${index}" style="text-align:left">${filter.field}</button>
        <select class="input" data-fop="${index}">
          ${opsFor(filter.field).map((op) => `<option value="${op.v}" ${op.v === filter.op ? "selected" : ""}>${op.label}</option>`).join("")}
        </select>
        ${valueCellHtml(filter, index)}
        <button class="btn btn-ghost btn-icon" data-rm-filter="${index}" title="删除条件">✕</button>
      </div>`
    )
    .join("");
}

function renderMetricRows() {
  const host = $("#a-metrics");
  host.innerHTML = analysisState.metrics
    .map(
      (metric, index) => `
      ${index > 0
        ? `<div class="op-chip"><select class="input op-select" style="width:58px" data-mop="${index - 1}">
             ${CONNECTORS.map((op) => `<option ${analysisState.metrics[index - 1].op === op ? "selected" : ""}>${op}</option>`).join("")}
           </select></div>`
        : ""}
      <div class="metric-row2" style="grid-template-columns:1.2fr 1fr 24px">
        <button class="input" data-pick-metric="${index}" style="text-align:left">${metric.field}</button>
        <select class="input" data-magg="${index}">
          ${AGGS.map((agg) => `<option value="${agg.v}" ${agg.v === metric.agg ? "selected" : ""}>${agg.label}</option>`).join("")}
        </select>
        <button class="btn btn-ghost btn-icon" data-rm-metric="${index}" title="删除指标">✕</button>
      </div>`
    )
    .join("");
}

function chainsOf() {
  const chains = [];
  if (analysisState.metrics.length === 0) return chains;
  let current = [0];
  for (let i = 1; i < analysisState.metrics.length; i += 1) {
    if ((analysisState.metrics[i - 1].op || "") === "AND") {
      chains.push(current);
      current = [i];
    } else {
      current.push(i);
    }
  }
  chains.push(current);
  return chains;
}
function derivedLabels() {
  const chains = chainsOf().filter((chain) => chain.length > 1);
  if (chains.length === 0) return [];
  return chains.length === 1 ? ["计算结果"] : chains.map((_, i) => `计算结果${i + 1}`);
}

function renderDerived() {
  const columns = [
    ...analysisState.filters
      .filter((f) => isDim(f) || ((f.op === "eq" || f.op === "ne") && f.value !== ALL))
      .map((f) => f.field),
    ...analysisState.metrics.map(metricLabel),
    ...derivedLabels()
  ];
  $("#a-derived").innerHTML =
    analysisState.metrics.length === 0
      ? "还没有指标：至少添加一个"
      : `结果表列：<b>${columns.join(" | ")}</b><br />` +
        (analysisState.metrics.length > 1
          ? "AND = 各指标独立成列；+ − × ÷ = 把这些指标合成一个「计算结果」列"
          : "");
}

/* ── 字段选择器：按时间范围灰掉无数据字段 ── */
function openFieldPicker(anchor, onPick, type = "any") {
  hideCtx();
  const items = GRID_META.filter((meta) => type === "any" || meta.type === type);
  const pop = document.createElement("div");
  pop.className = "picker";
  pop.innerHTML = `
    <input class="input" type="text" placeholder="搜索字段…" />
    <div class="picker-list">
      ${items
        .map((meta) => {
          const available = fieldHasData(meta.name);
          return `<label class="picker-item ${available ? "" : "disabled"}" data-field="${meta.name}"
              data-available="${available ? "1" : "0"}">
            <input type="checkbox" value="${meta.name}" ${available ? "" : "disabled"} />
            <span>${meta.name}</span>
            <span class="dtype">${meta.type === "number" ? "数值" : "文本"}${
              available ? "" : " · 无数据"
            }</span></label>`;
        })
        .join("")}
    </div>
    <div class="picker-foot">
      <button class="btn btn-ghost" data-pick-all>全选</button>
      <span class="tiny" data-pick-count>0 项</span>
      <span style="flex:1"></span>
      <button class="btn btn-primary" data-pick-ok>添加</button>
    </div>`;
  const rect = anchor.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 300) + "px";
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 350) + "px";
  document.body.appendChild(pop);

  const search = pop.querySelector('input[type="text"]');
  const boxes = () => Array.from(pop.querySelectorAll('input[type="checkbox"]'));
  const syncCount = () => {
    pop.querySelector("[data-pick-count]").textContent = `${boxes().filter((b) => b.checked).length} 项`;
  };
  search.addEventListener("input", () => {
    const q = search.value.trim();
    Array.from(pop.querySelectorAll(".picker-item")).forEach((el) => {
      el.hidden = q !== "" && !el.textContent.includes(q);
    });
  });
  boxes().forEach((box) => box.addEventListener("change", syncCount));

  pop.addEventListener("click", (event) => {
    const disabled = event.target.closest('.picker-item[data-available="0"]');
    if (disabled) {
      toast(
        `「${disabled.dataset.field}」在 ${analysisState.from} ~ ${analysisState.to} 内没有数据，请调整时间范围`
      );
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
  });

  pop.querySelector("[data-pick-all]").addEventListener("click", () => {
    const visible = Array.from(pop.querySelectorAll(".picker-item")).filter(
      (el) => !el.hidden && el.dataset.available === "1"
    );
    const allChecked = visible.every((el) => el.querySelector("input").checked);
    visible.forEach((el) => {
      el.querySelector("input").checked = !allChecked;
    });
    syncCount();
  });
  pop.querySelector("[data-pick-ok]").addEventListener("click", () => {
    const picked = boxes()
      .filter((box) => box.checked)
      .map((box) => box.value);
    pop.remove();
    if (picked.length === 0) {
      toast("请先勾选字段");
      return;
    }
    onPick(picked);
  });
}

function defaultFilter(name) {
  return {
    field: name,
    op: isTextField(name) ? "eq" : "gt",
    value: isTextField(name) ? ALL : "",
    value2: ""
  };
}

function applyPickedFields(index, picked, kind) {
  if (kind === "filter") {
    analysisState.filters[index] = defaultFilter(picked[0]);
    picked.slice(1).forEach((name) => analysisState.filters.push(defaultFilter(name)));
  } else {
    analysisState.metrics[index] = { field: picked[0], agg: "sum", op: analysisState.metrics[index]?.op ?? "" };
    picked.slice(1).forEach((name) =>
      analysisState.metrics.push({ field: name, agg: "sum", op: "AND" })
    );
  }
  renderAnalysisConfig();
  toast(`已添加 ${picked.length} 个${kind === "filter" ? "条件" : "指标"}`);
}

/* ── 计算引擎 ── */
function evalFilter(row, filter, pool) {
  if (filter.value === ALL && (filter.op === "eq" || filter.op === "ne")) return true;
  if (filter.op === "aboveAvg" || filter.op === "belowAvg") {
    const nums = pool.map((r) => Number(r[filter.field])).filter((v) => Number.isFinite(v));
    if (nums.length === 0) return false;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const value = Number(row[filter.field]);
    return filter.op === "aboveAvg" ? value > avg : value < avg;
  }
  const filled = filter.value !== "" && filter.value !== null && filter.value !== undefined;
  if (!filled && filter.op !== "between") return true;
  if (!isTextField(filter.field)) {
    const value = Number(row[filter.field]);
    const a = Number(filter.value);
    const b = Number(filter.value2);
    switch (filter.op) {
      case "eq": return value === a;
      case "ne": return value !== a;
      case "gt": return value > a;
      case "ge": return value >= a;
      case "lt": return value < a;
      case "le": return value <= a;
      case "between": return value >= Math.min(a, b) && value <= Math.max(a, b);
      default: return true;
    }
  }
  const text = String(row[filter.field]);
  const target = String(filter.value);
  switch (filter.op) {
    case "eq": return text === target;
    case "ne": return text !== target;
    case "startsWith": return text.startsWith(target);
    case "endsWith": return text.endsWith(target);
    case "contains": return text.includes(target);
    case "notContains": return !text.includes(target);
    default: return true;
  }
}

function aggValues(rows, metric) {
  if (metric.agg === "count") return rows.length;
  const nums = rows.map((r) => Number(r[metric.field])).filter((v) => Number.isFinite(v));
  if (nums.length === 0) return 0;
  switch (metric.agg) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    case "median": {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    default: return 0;
  }
}

function chainValue(chain, values) {
  let acc = values[chain[0]];
  for (let i = 1; i < chain.length; i += 1) {
    const op = analysisState.metrics[chain[i - 1]].op;
    const value = values[chain[i]];
    if (op === "+") acc += value;
    else if (op === "−") acc -= value;
    else if (op === "×") acc *= value;
    else if (op === "÷") acc = value === 0 ? NaN : acc / value;
  }
  return acc;
}

function computeAnalysis() {
  const ranged = rangedRows();
  const plain = analysisState.filters.filter(
    (f) => !isDim(f) && !NO_VALUE_OPS.has(f.op)
  );
  const pool = ranged.filter((row) => plain.every((f) => evalFilter(row, f, ranged)));
  const avgFilters = analysisState.filters.filter((f) => NO_VALUE_OPS.has(f.op));
  const filtered = pool.filter((row) => avgFilters.every((f) => evalFilter(row, f, pool)));

  const dimFields = [];
  const columnFields = [];
  analysisState.filters.forEach((filter) => {
    const asDim = isDim(filter);
    const asConst = (filter.op === "eq" || filter.op === "ne") && filter.value !== ALL;
    if (!asDim && !asConst) return;
    if (!columnFields.includes(filter.field)) columnFields.push(filter.field);
    if (asDim && !dimFields.includes(filter.field)) dimFields.push(filter.field);
  });

  const chains = chainsOf();
  const arithmetic = chains.filter((chain) => chain.length > 1);
  const labels = analysisState.metrics.map(metricLabel);

  const buckets = new Map();
  filtered.forEach((row) => {
    const key = dimFields.length > 0 ? dimFields.map((f) => String(row[f])).join(" · ") : "全表";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });

  const rows = [...buckets.entries()]
    .map(([key, group]) => {
      const sample = group[0];
      const fieldValues = columnFields.map((field) => {
        if (dimFields.includes(field)) return String(sample[field]);
        const filter = analysisState.filters.find((f) => f.field === field);
        return filter ? String(filter.value) : "";
      });
      const values = analysisState.metrics.map((metric) => aggValues(group, metric));
      const derived = arithmetic.map((chain) => chainValue(chain, values));
      return { key, fieldValues, values, derived, count: group.length };
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key), "zh"));

  const totals = analysisState.metrics.map((metric) => aggValues(filtered, metric));

  return {
    rows,
    columnFields,
    dimFields,
    labels,
    derivedLabels: derivedLabels(),
    totals,
    totalDerived: arithmetic.map((chain) => chainValue(chain, totals)),
    scanned: DEMO_ROWS.length,
    ranged: ranged.length,
    filtered: filtered.length
  };
}

/* ── 结果渲染 ── */
function renderResult() {
  const res = analysisState.result;
  if (!res) return;
  $("#result-empty").hidden = true;
  const isTable = analysisState.tab === "table";
  $("#result-table").hidden = !isTable;
  $("#chart-panel").hidden = isTable;
  if (!isTable) {
    renderChartConfig();
    renderChart();
    return;
  }

  const head = `<tr>
    ${res.columnFields.map((field) => `<th>${field}</th>`).join("")}
    ${res.labels.map((label) => `<th class="num">${label}</th>`).join("")}
    ${res.derivedLabels.map((label) => `<th class="num">${label}</th>`).join("")}
    <th class="num">行数</th></tr>`;
  const body = res.rows
    .map(
      (row) => `<tr>
      ${row.fieldValues.map((value) => `<td>${value}</td>`).join("")}
      ${row.values.map((value) => `<td class="num">${fmtNum(value)}</td>`).join("")}
      ${row.derived.map((value) => `<td class="num" style="font-weight:600">${fmtNum(value)}</td>`).join("")}
      <td class="num">${row.count}</td></tr>`
    )
    .join("");
  const total = `<tr style="background:var(--color-bg-sunken);font-weight:600">
    <td colspan="${res.columnFields.length || 1}">合计</td>
    ${res.totals.map((value) => `<td class="num">${fmtNum(value)}</td>`).join("")}
    ${res.totalDerived.map((value) => `<td class="num">${fmtNum(value)}</td>`).join("")}
    <td class="num">${res.filtered}</td></tr>`;

  $("#result-table").innerHTML = `
    <table class="table"><thead>${head}</thead><tbody>${body}${total}</tbody></table>
    <div class="tiny" style="margin-top:8px">
      ${res.rows.length} 行 · 扫描 ${res.scanned} 行 → 时间范围内 ${res.ranged} 行 → 筛选后 ${res.filtered} 行
      ${res.dimFields.length ? `· 分组：${res.dimFields.join(" × ")}` : "· 未分组"}
    </div>`;
}

function chartSeries(res) {
  const labels = [...res.labels, ...res.derivedLabels];
  const selected = analysisState.chartY.filter((label) => labels.includes(label));
  const active = selected.length > 0 ? selected : labels.slice(0, 1);
  const xIndex = res.columnFields.indexOf(analysisState.chartX);
  const categories = res.rows.map((row) =>
    xIndex >= 0 ? row.fieldValues[xIndex] : row.key
  );
  const series = active.map((label) => {
    const metricIndex = res.labels.indexOf(label);
    const data = res.rows.map((row) =>
      metricIndex >= 0 ? row.values[metricIndex] : row.derived[res.derivedLabels.indexOf(label)]
    );
    return { name: label, data };
  });
  return { categories, series };
}

function renderChartConfig() {
  const res = analysisState.result;
  const labels = [...res.labels, ...res.derivedLabels];
  if (!res.columnFields.includes(analysisState.chartX)) {
    analysisState.chartX = res.columnFields[0] ?? null;
  }
  if (analysisState.chartY.length === 0) analysisState.chartY = labels.slice(0, 2);
  $("#chart-x").innerHTML = res.columnFields.length
    ? res.columnFields.map((f) => `<option ${analysisState.chartX === f ? "selected" : ""}>${f}</option>`).join("")
    : `<option>（无分组字段）</option>`;
  $("#chart-y").innerHTML = labels
    .map(
      (label) =>
        `<button class="y-chip ${analysisState.chartY.includes(label) ? "on" : ""}" data-y="${label}">${label}</button>`
    )
    .join("");
  $$("#chart-type button").forEach((b) =>
    b.classList.toggle("on", b.dataset.v === analysisState.chartType)
  );
}

const CHART_COLORS = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30"];

function renderChart() {
  const res = analysisState.result;
  const { categories, series } = chartSeries(res);
  const host = $("#result-chart");
  if (series.length === 0 || categories.length === 0) {
    host.innerHTML = `<div class="tiny">没有可绘制的数据</div>`;
    return;
  }
  const w = 660, h = 340, padL = 56, padB = 62, padT = 18;
  const type = analysisState.chartType;
  const allValues = series.flatMap((s) => s.data.filter((v) => Number.isFinite(v)));
  const max = Math.max(...allValues, 0.0001);
  const min = Math.min(...allValues, 0);
  const span = max - min || 1;
  const yOf = (v) => h - padB - ((v - min) / span) * (h - padB - padT);
  const xOf = (i) => padL + (categories.length === 1 ? (w - padL - 30) / 2 : (i / (categories.length - 1)) * (w - padL - 30));

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const value = min + span * t;
      const y = yOf(value).toFixed(1);
      return `<line x1="${padL}" y1="${y}" x2="${w - 10}" y2="${y}" stroke="var(--color-border-soft)" opacity=".55"></line>
        <text x="${padL - 8}" y="${Number(y) + 3}" font-size="9" fill="var(--color-text-tertiary)" text-anchor="end">${value.toFixed(2)}</text>`;
    })
    .join("");

  const xLabels = categories
    .map((label, i) => {
      const text = String(label).length > 8 ? String(label).slice(0, 8) + "…" : String(label);
      return `<text x="${xOf(i)}" y="${h - padB + 18}" font-size="10" fill="var(--color-text-tertiary)" text-anchor="middle">${text}</text>`;
    })
    .join("");

  let drawing = "";
  if (type === "pie") {
    const data = series[0].data.map((v) => (Number.isFinite(v) ? Math.max(v, 0) : 0));
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const cx = w / 2, cy = h / 2 - 8, r = Math.min(w, h) / 3.1;
    let angle = -Math.PI / 2;
    drawing = data
      .map((value, i) => {
        const slice = (value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        angle += slice;
        const x2 = cx + r * Math.cos(angle);
        const y2 = cy + r * Math.sin(angle);
        const large = slice > Math.PI ? 1 : 0;
        return `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
          fill="${CHART_COLORS[i % CHART_COLORS.length]}" opacity=".85"></path>`;
      })
      .join("");
    const legend = categories
      .map(
        (label, i) =>
          `<span><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${label} ${(
            (data[i] / total) *
            100
          ).toFixed(1)}%</span>`
      )
      .join("");
    host.innerHTML = `<div style="width:100%">
      <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:300px">${drawing}</svg>
      <div class="chart-legend">${legend}</div></div>`;
    return;
  }

  if (type === "scatter") {
    drawing = series
      .map((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length];
        return s.data
          .map(
            (value, i) =>
              `<circle cx="${xOf(i)}" cy="${yOf(Number.isFinite(value) ? value : min)}" r="4" fill="${color}" opacity=".85"></circle>`
          )
          .join("");
      })
      .join("");
  } else if (type === "bar") {
    const groupWidth = (w - padL - 30) / Math.max(categories.length, 1);
    const barWidth = Math.max(6, (groupWidth - 10) / series.length);
    drawing = series
      .map((s, si) =>
        s.data
          .map((value, i) => {
            const v = Number.isFinite(value) ? value : min;
            const x = padL + i * groupWidth + 6 + si * barWidth;
            const y = yOf(v);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}"
              height="${(h - padB - y).toFixed(1)}" rx="3" fill="${CHART_COLORS[si % CHART_COLORS.length]}" opacity=".85"></rect>`;
          })
          .join("")
      )
      .join("");
  } else {
    drawing = series
      .map((s, si) => {
        const color = CHART_COLORS[si % CHART_COLORS.length];
        const points = s.data
          .map((value, i) => `${xOf(i).toFixed(1)},${yOf(Number.isFinite(value) ? value : min).toFixed(1)}`)
          .join(" ");
        const dots = s.data
          .map(
            (value, i) =>
              `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(Number.isFinite(value) ? value : min).toFixed(1)}" r="3" fill="${color}"></circle>`
          )
          .join("");
        return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"></polyline>${dots}`;
      })
      .join("");
  }

  const legend =
    series.length > 1
      ? `<div class="chart-legend">${series
          .map(
            (s, i) => `<span><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${s.name}</span>`
          )
          .join("")}</div>`
      : "";

  host.innerHTML = `<div style="width:100%">
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:300px">
      ${grid}
      <line x1="${padL}" y1="${h - padB}" x2="${w - 10}" y2="${h - padB}" stroke="var(--color-border)"></line>
      ${drawing}${xLabels}
    </svg>${legend}</div>`;
}

/* ── 事件绑定 ── */
$("#analysis-back").addEventListener("click", () => go("workspace"));
$("#analysis-help").addEventListener("click", () => {
  go("help");
  renderDoc("rules");
});

$("#run-analysis").addEventListener("click", () => {
  if (analysisState.metrics.length === 0) {
    toast("请至少添加一个计算指标");
    return;
  }
  const btn = $("#run-analysis");
  btn.disabled = true;
  btn.textContent = "计算中…";
  $("#config-status").textContent = "正在计算…";
  setTimeout(() => {
    analysisState.result = computeAnalysis();
    state.analysisDone = true;
    btn.disabled = false;
    btn.textContent = "开始计算";
    const res = analysisState.result;
    $("#config-status").textContent = `${res.rows.length} 行结果 · 命中 ${res.filtered} / 扫描 ${res.scanned} 行`;
    renderResult();
  }, 240);
});

$$("#result-tabs button").forEach((btn) =>
  btn.addEventListener("click", () => {
    analysisState.tab = btn.dataset.tab;
    $$("#result-tabs button").forEach((b) => b.classList.toggle("on", b === btn));
    renderResult();
  })
);

$$("#a-range button").forEach((btn) =>
  btn.addEventListener("click", () => {
    analysisState.range = btn.dataset.v;
    const presets = { 本月: ["2026-10-01", "2026-10-31"], 上月: ["2026-09-01", "2026-09-30"] };
    const pair = presets[analysisState.range];
    if (pair) {
      analysisState.from = pair[0];
      analysisState.to = pair[1];
    }
    renderAnalysisConfig();
    toast(`时间范围：${analysisState.from} ~ ${analysisState.to}`);
  })
);

$("#a-from").addEventListener("change", (event) => {
  analysisState.from = event.target.value;
  renderAnalysisConfig();
});
$("#a-to").addEventListener("change", (event) => {
  analysisState.to = event.target.value;
  renderAnalysisConfig();
});
$("#a-add-filter").addEventListener("click", () => {
  analysisState.filters.push(defaultFilter("目的所属省份"));
  renderAnalysisConfig();
});
$("#a-add-metric").addEventListener("click", () => {
  analysisState.metrics.push({
    field: "结算重量",
    agg: "sum",
    op: analysisState.metrics.length > 0 ? "AND" : ""
  });
  renderAnalysisConfig();
});

document.addEventListener("click", (event) => {
  const chartType = event.target.closest("#chart-type button");
  if (chartType) {
    analysisState.chartType = chartType.dataset.v;
    renderChartConfig();
    renderChart();
    return;
  }
  const yChip = event.target.closest("[data-y]");
  if (yChip) {
    const label = yChip.dataset.y;
    if (analysisState.chartY.includes(label)) {
      if (analysisState.chartY.length === 1) return;
      analysisState.chartY = analysisState.chartY.filter((item) => item !== label);
    } else {
      analysisState.chartY.push(label);
    }
    renderChartConfig();
    renderChart();
    return;
  }
  const pickField = event.target.closest("[data-pick-field]");
  if (pickField) {
    openFieldPicker(pickField, (picked) =>
      applyPickedFields(Number(pickField.dataset.pickField), picked, "filter")
    );
    return;
  }
  const pickMetric = event.target.closest("[data-pick-metric]");
  if (pickMetric) {
    openFieldPicker(
      pickMetric,
      (picked) => applyPickedFields(Number(pickMetric.dataset.pickMetric), picked, "metric"),
      "any"
    );
    return;
  }
  const rmFilter = event.target.closest("[data-rm-filter]");
  if (rmFilter) {
    analysisState.filters.splice(Number(rmFilter.dataset.rmFilter), 1);
    renderAnalysisConfig();
    return;
  }
  const rmMetric = event.target.closest("[data-rm-metric]");
  if (rmMetric) {
    analysisState.metrics.splice(Number(rmMetric.dataset.rmMetric), 1);
    renderAnalysisConfig();
  }
});

document.addEventListener("change", (event) => {
  const fop = event.target.closest("[data-fop]");
  if (fop) {
    const index = Number(fop.dataset.fop);
    analysisState.filters[index].op = fop.value;
    const filter = analysisState.filters[index];
    if (!isTextField(filter.field) && (filter.op === "eq" || filter.op === "ne")) {
      filter.value = "";
    }
    if (isTextField(filter.field) && (filter.op === "eq" || filter.op === "ne")) {
      filter.value = ALL;
    }
    renderAnalysisConfig();
    return;
  }
  const fvsel = event.target.closest("[data-fvsel]");
  if (fvsel) {
    analysisState.filters[Number(fvsel.dataset.fvsel)].value = fvsel.value;
    renderDerived();
    return;
  }
  const magg = event.target.closest("[data-magg]");
  if (magg) {
    analysisState.metrics[Number(magg.dataset.magg)].agg = magg.value;
    renderAnalysisConfig();
    return;
  }
  const mop = event.target.closest("[data-mop]");
  if (mop) {
    analysisState.metrics[Number(mop.dataset.mop)].op = mop.value;
    renderDerived();
    return;
  }
  const chartX = event.target.closest("#chart-x");
  if (chartX) {
    analysisState.chartX = chartX.value;
    renderChart();
  }
});

document.addEventListener("input", (event) => {
  const fv = event.target.closest("[data-fv]");
  if (fv) {
    analysisState.filters[Number(fv.dataset.fv)].value = fv.value;
    return;
  }
  const fv2 = event.target.closest("[data-fv2]");
  if (fv2) {
    analysisState.filters[Number(fv2.dataset.fv2)].value2 = fv2.value;
  }
});

