/** X 轴选择：左列一级字段 → 右侧展开二级取值（不再上下堆叠） */
function openXAxisPicker(anchor) {
  hideCtx();
  const res = analysisState.result;
  if (!res) return;
  const pop = document.createElement("div");
  pop.className = "picker cascade";

  const renderValues = () => {
    const sub = pop.querySelector(".picker-col.sub");
    if (!sub) return;
    const field = analysisState.chartX ?? res.columnFields[0] ?? "";
    const values = field ? distinctValues(field) : [];
    const chosen = analysisState.chartXValues ?? [];
    const pickedCount = values.filter((value) => chosen.includes(value)).length;
    sub.innerHTML = `
      <div class="picker-hint">二级：${field || "—"} 的取值${pickedCount > 0 ? `（已选 ${pickedCount}）` : "（不勾 = 全部）"}</div>
      ${
        values.length
          ? `<div class="picker-list">${values
              .map(
                (value) =>
                  `<label class="picker-item"><input type="checkbox" data-xvalue="${value}" ${
                    chosen.includes(value) ? "checked" : ""
                  } /><span>${value}</span></label>`
              )
              .join("")}</div>`
          : '<div class="picker-sub-empty">该字段在当前结果里没有取值</div>'
      }
      <div class="picker-foot">
        <button class="btn btn-ghost" data-xall>全选</button>
        <button class="btn btn-ghost" data-xnone>清空</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" data-xok>确定</button>
      </div>`;
    sub.querySelector("[data-xall]").addEventListener("click", () => {
      sub.querySelectorAll("[data-xvalue]").forEach((box) => {
        box.checked = true;
      });
    });
    sub.querySelector("[data-xnone]").addEventListener("click", () => {
      sub.querySelectorAll("[data-xvalue]").forEach((box) => {
        box.checked = false;
      });
    });
    sub.querySelector("[data-xok]").addEventListener("click", () => {
      analysisState.chartXValues = Array.from(sub.querySelectorAll("[data-xvalue]"))
        .filter((box) => box.checked)
        .map((box) => box.value);
      pop.remove();
      renderChartConfig();
      renderChart();
    });
  };

  const currentField = analysisState.chartX ?? res.columnFields[0] ?? "";
  pop.innerHTML = `
    <div class="picker-col">
      <div class="picker-hint">一级：选 X 轴字段</div>
      <div class="picker-list">
        ${res.columnFields
          .map(
            (item) =>
              `<label class="picker-item"><input type="radio" name="xaxis" value="${item}" ${
                currentField === item ? "checked" : ""
              } /><span>${item}</span><span class="dtype">${distinctValues(item).length} 个取值</span></label>`
          )
          .join("")}
      </div>
    </div>
    <div class="picker-col sub"></div>`;
  pop.querySelectorAll('input[name="xaxis"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      analysisState.chartX = radio.value;
      analysisState.chartXValues = [];
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

/* ====PICKER2==== */
/** 分组维度：左列一级维度 → 右侧展开二级取值 */
function openDimPicker(anchor) {
  hideCtx();
  const pop = document.createElement("div");
  pop.className = "picker cascade";

  const renderValues = () => {
    const sub = pop.querySelector(".picker-col.sub");
    if (!sub) return;
    const sources = [];
    if (boardState.dims.includes("省份")) {
      sources.push({ key: "省份", values: BOARD_AREAS.flatMap((group) => group.provinces) });
    }
    if (boardState.dims.includes("网点")) {
      sources.push({ key: "网点", values: BOARD_NETS.map((net) => net.name) });
    }
    sub.innerHTML = `
      <div class="picker-hint">二级：勾选取值（不勾 = 全部）</div>
      ${sources
        .map(
          (source) => `
        <div class="picker-hint" style="padding-top:2px">${source.key}</div>
        <div class="picker-list" style="max-height:${sources.length > 1 ? 94 : 186}px">
          ${source.values
            .map(
              (value) =>
                `<label class="picker-item"><input type="checkbox" data-bdim-value="${source.key}|${value}" ${
                  (boardState.dimValues?.[source.key] ?? []).includes(value) ? "checked" : ""
                } /><span>${value}</span></label>`
            )
            .join("")}
        </div>`
        )
        .join("")}
      <div class="picker-foot">
        <button class="btn btn-ghost" data-bdim-clear>清空取值</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary" data-bdim-ok>确定</button>
      </div>`;
    sub.querySelector("[data-bdim-clear]").addEventListener("click", () => {
      sub.querySelectorAll("[data-bdim-value]").forEach((box) => {
        box.checked = false;
      });
    });
    sub.querySelector("[data-bdim-ok]").addEventListener("click", () => {
      const next = { 省份: [], 网点: [] };
      sub.querySelectorAll("[data-bdim-value]").forEach((box) => {
        if (!box.checked) return;
        const [key, value] = box.dataset.bdimValue.split("|");
        next[key].push(value);
      });
      boardState.dimValues = next;
      pop.remove();
      renderBoard();
    });
  };

  const current = boardState.dims.join(",");
  pop.innerHTML = `
    <div class="picker-col">
      <div class="picker-hint">一级：分组维度</div>
      <div class="picker-list">
        ${DIM_OPTIONS.flatMap((group) => group.items)
          .map(
            (item) =>
              `<label class="picker-item"><input type="radio" name="bdim" value="${item.v}" ${
                current === item.v ? "checked" : ""
              } /><span>${item.label}</span></label>`
          )
          .join("")}
      </div>
    </div>
    <div class="picker-col sub"></div>`;
  pop.querySelectorAll('input[name="bdim"]').forEach((radio) =>
    radio.addEventListener("change", () => {
      boardState.dims = radio.value.split(",");
      renderDimLabel();
      renderValues();
    })
  );
  renderValues();

  const rect = anchor.getBoundingClientRect();
  const width = 212 * 2 + 2;
  pop.style.left = Math.min(rect.left, window.innerWidth - width - 12) + "px";
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 380) + "px";
  document.body.appendChild(pop);
  pop.addEventListener("click", (event) => event.stopPropagation());
}
