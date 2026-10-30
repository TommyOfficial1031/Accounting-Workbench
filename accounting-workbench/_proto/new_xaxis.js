/**
 * X 轴选择：一级只列当前的分组维度（表格左侧那几列），
 * 二级只列该维度**已经勾选**的取值（即结果表里真实存在的那些），
 * 勾选是跨维度的：网点选了 2 个、公斤段选了 2 个，就按组合出 4 个分类。
 */
function openXAxisPicker(anchor) {
  hideCtx();
  const res = analysisState.result;
  if (!res) return;
  if (res.columnFields.length === 0) {
    toast("先在「筛选条件」里加分组维度（文本字段 + 等于/不等于），图表才有 X 轴");
    return;
  }
  const dims = res.columnFields;
  let activeField = dims[0];
  const pop = document.createElement("div");
  pop.className = "picker cascade";

  /** 某维度在结果表里出现过的取值（= 用户筛过的那些） */
  const valuesOf = (field) => {
    const index = dims.indexOf(field);
    const set = new Set(res.rows.map((row) => row.fieldValues[index]));
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  };

  const renderValues = () => {
    const sub = pop.querySelector(".picker-col.sub");
    if (!sub) return;
    const values = valuesOf(activeField);
    const picked = analysisState.chartXSel?.[activeField] ?? [];
    sub.innerHTML = `
      <div class="picker-hint">二级：${activeField} 的取值${picked.length ? `（已选 ${picked.length}）` : "（不勾 = 全部）"}</div>
      <div class="picker-hint" style="padding-top:0">只列结果表里已有的取值；可跨维度勾选</div>
      ${
        values.length
          ? `<div class="picker-list">${values
              .map(
                (value) =>
                  `<label class="picker-item"><input type="checkbox" data-xvalue="${value}" ${
                    picked.includes(value) ? "checked" : ""
                  } /><span>${value}</span></label>`
              )
              .join("")}</div>`
          : '<div class="picker-sub-empty">该维度没有取值</div>'
      }
      <div class="picker-foot">
        <button class="btn btn-ghost" data-xall>全选</button>
        <button class="btn btn-ghost" data-xnone>清空</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" data-xok>完成</button>
      </div>`;
    sub.querySelector("[data-xall]").addEventListener("click", () => {
      sub.querySelectorAll("[data-xvalue]").forEach((box) => {
        box.checked = true;
      });
      syncPick();
    });
    sub.querySelector("[data-xnone]").addEventListener("click", () => {
      sub.querySelectorAll("[data-xvalue]").forEach((box) => {
        box.checked = false;
      });
      syncPick();
    });
    sub.querySelectorAll("[data-xvalue]").forEach((box) =>
      box.addEventListener("change", () => {
        syncPick();
      })
    );
    sub.querySelector("[data-xok]").addEventListener("click", () => {
      pop.remove();
    });
  };

  /** 勾选立即写回状态并重画（不用等「完成」） */
  const syncPick = () => {
    const sub = pop.querySelector(".picker-col.sub");
    if (!sub) return;
    const picked = [...sub.querySelectorAll("[data-xvalue]")]
      .filter((box) => box.checked)
      .map((box) => box.value);
    analysisState.chartXSel = { ...(analysisState.chartXSel ?? {}), [activeField]: picked };
    renderChartConfig();
    renderChart();
  };

  pop.innerHTML = `
    <div class="picker-col">
      <div class="picker-hint">一级：选分组维度</div>
      <div class="picker-list">
        ${dims
          .map(
            (field) =>
              `<label class="picker-item"><input type="radio" name="xaxis" value="${field}" ${
                activeField === field ? "checked" : ""
              } /><span>${field}</span><span class="dtype">${valuesOf(field).length} 个取值</span></label>`
          )
          .join("")}
      </div>
    </div>
    <div class="picker-col sub"></div>`;

  pop.querySelectorAll('input[name="xaxis"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      activeField = radio.value;
      renderValues();
    })
  );
  renderValues();

  const rect = anchor.getBoundingClientRect();
  const width = 212 * 2 + 2;
  pop.style.left = Math.min(rect.left, window.innerWidth - width - 12) + "px";
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 330) + "px";
  document.body.appendChild(pop);
  pop.addEventListener("click", (event) => event.stopPropagation());
}

/**
 * 图表数据 = 结果表按维度取值过滤后的行：分类是「维度组合」（如 金东三部 · 0-60），
 * 每个维度各自勾选取值，多维度勾选就是交集过滤，互不影响。
 */
function chartSeries(res) {
  const labels = [...res.labels, ...res.derivedLabels];
  const selected = analysisState.chartY.filter((label) => labels.includes(label));
  const active = selected.length > 0 ? selected : labels.slice(0, 1);
  const dims = res.columnFields;
  const sel = analysisState.chartXSel ?? {};

  let rows = res.rows.filter((row) =>
    dims.every((field, index) => {
      const picked = sel[field] ?? [];
      return picked.length === 0 || picked.includes(row.fieldValues[index]);
    })
  );
  // 勾选的取值与当前结果不匹配时兜底用全部行，避免"有数据却画不出来"
  if (rows.length === 0) rows = res.rows.slice();

  const categories = rows.map((row) => (row.fieldValues.length > 0 ? row.fieldValues.join(" · ") : row.key));
  const series = active.map((label) => {
    const metricIndex = res.labels.indexOf(label);
    const derivedIndex = res.derivedLabels.indexOf(label);
    const data = rows.map((row) => (metricIndex >= 0 ? row.values[metricIndex] : row.derived[derivedIndex]));
    return { name: label, data };
  });
  return { categories, series };
}

