function renderChartConfig() {
  const res = analysisState.result;
  const labels = [...res.labels, ...res.derivedLabels];
  const dims = res.columnFields;
  // 维度/取值都随结果表收敛：换了筛选条件，失效的勾选自动掉
  const nextSel = {};
  dims.forEach((field, index) => {
    const allowed = new Set(res.rows.map((row) => row.fieldValues[index]));
    nextSel[field] = (analysisState.chartXSel?.[field] ?? []).filter((value) => allowed.has(value));
  });
  analysisState.chartXSel = nextSel;
  analysisState.chartY = analysisState.chartY.filter((label) => labels.includes(label));
  if (analysisState.chartY.length === 0) analysisState.chartY = labels.slice(0, 2);
  const pickedCount = dims.reduce((acc, field) => acc + (nextSel[field]?.length ?? 0), 0);
  $("#chart-x-label").textContent = dims.length
    ? `${dims.join(" × ")}${pickedCount > 0 ? ` · 已选 ${pickedCount} 项` : " · 全部"}`
    : "无分组条件";
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

