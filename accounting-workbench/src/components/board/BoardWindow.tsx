import { useEffect, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

import Modal from "../common/Modal";
import { useEconStore } from "../../stores/econStore";
import { formatChartValue } from "../../utils/numberFormat";
import type { BoardCell, BoardRequest } from "../../types/api";
import styles from "./BoardWindow.module.css";

interface BoardWindowProps {
  onClose: () => void;
  datasetId: string | null;
  timeRange: { start: string; end: string; field: string };
}

type Dim = "网点" | "省份";

const PALETTE = ["#0071e3", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#5ac8fa"];

function kg(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function pct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function ratio(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function BoardWindow({ onClose, datasetId, timeRange }: BoardWindowProps) {
  const board = useEconStore((state) => state.board);
  const sources = useEconStore((state) => state.sources);
  const values = useEconStore((state) => state.values);
  const loading = useEconStore((state) => state.loading);
  const error = useEconStore((state) => state.error);
  const runBoard = useEconStore((state) => state.runBoard);
  const loadSources = useEconStore((state) => state.loadSources);
  const loadValues = useEconStore((state) => state.loadValues);

  const boardInputs = useEconStore((state) => state.boardInputs);
  const setBoardInputs = useEconStore((state) => state.setBoardInputs);
  const { nets, exclude, source } = boardInputs;
  const dims = boardInputs.dims;
  const setNets = (value: string[] | ((prev: string[]) => string[])): void =>
    setBoardInputs({
      nets: typeof value === "function" ? value(boardInputs.nets) : value,
    });
  const setExclude = (value: string): void => setBoardInputs({ exclude: value });
  const setSource = (value: string): void => setBoardInputs({ source: value });
  const setDims = (next: Dim[]): void => setBoardInputs({ dims: next });

  useEffect(() => {
    if (datasetId === null) return;
    void loadValues(datasetId, ["是否剔除", "物品来源"]);
    void loadSources({ dataset_id: datasetId, nets: [], exclude, source });
    // 口径变化时重新拉候选网点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, exclude, source]);

  const request = useMemo<BoardRequest | null>(() => {
    if (datasetId === null) return null;
    return { dataset_id: datasetId, time_range: timeRange, nets, exclude, source, dims };
  }, [datasetId, timeRange, nets, exclude, source, dims]);

  function toggleNet(net: string): void {
    setNets((current) =>
      current.includes(net) ? current.filter((item) => item !== net) : [...current, net],
    );
  }

  function toggleDim(dim: Dim): void {
    const next = dims.includes(dim) ? dims.filter((item) => item !== dim) : [...dims, dim];
    setDims(next.length === 0 ? ["省份"] : next);
  }

  const option = useMemo<EChartsOption>(() => {
    if (board === null) return {};
    /* 所有分组都画（用户 2026-10-29 定稿：29 组就画 29 条线，不再截断前 6 个） */
    const series = board.rows.map((row, index) => ({
      name: row.label,
      type: "line" as const,
      smooth: false,
      symbolSize: 6,
      itemStyle: { color: PALETTE[index % PALETTE.length] },
      data: row.cells.map((cell) => Math.round(cell.vol)),
    }));
    return {
      grid: { left: 70, right: 24, top: 40, bottom: 40 },
      tooltip: { trigger: "axis", valueFormatter: formatChartValue },
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "category", data: board.bands, boundaryGap: false },
      yAxis: {
        type: "value",
        name: "结算重量（kg）",
        axisLabel: { formatter: formatChartValue },
      },
      series,
    };
  }, [board]);

  const totalCell = (cells: BoardCell[]): number =>
    cells.reduce((acc, cell) => acc + cell.vol, 0);

  return (
    <Modal title="一键算 · 看板" onClose={onClose}>
      {datasetId === null ? (
        <p className={styles.hint}>请先导入表格，看板需要基于数据计算。</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <span className={styles.label}>是否剔除</span>
            {(values["是否剔除"] ?? ["不剔除"]).slice(0, 4).map((value) => (
              <button
                key={value}
                type="button"
                className={value === exclude ? styles.chipOn : styles.chip}
                onClick={() => setExclude(value)}
              >
                {value}
              </button>
            ))}
            <span className={styles.label}>物品来源</span>
            {(values["物品来源"] ?? ["普通物品"]).slice(0, 4).map((value) => (
              <button
                key={value}
                type="button"
                className={value === source ? styles.chipOn : styles.chip}
                onClick={() => setSource(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className={styles.toolbar}>
            <span className={styles.label}>网点</span>
            <button
              type="button"
              className={nets.length === 0 ? styles.chipOn : styles.chip}
              onClick={() => setNets([])}
            >
              全部
            </button>
            {(sources?.nets ?? []).slice(0, 8).map((net) => (
              <button
                key={net}
                type="button"
                className={nets.includes(net) ? styles.chipOn : styles.chip}
                onClick={() => toggleNet(net)}
              >
                {net}
              </button>
            ))}
          </div>

          <div className={styles.toolbar}>
            <span className={styles.label}>分组维度</span>
            {(["省份", "网点"] as Dim[]).map((dim) => (
              <button
                key={dim}
                type="button"
                className={dims.includes(dim) ? styles.chipOn : styles.chip}
                onClick={() => toggleDim(dim)}
              >
                {dim}
              </button>
            ))}
            <span className={styles.spacer} />
            {loading && <span className={styles.hint}>计算中…</span>}
            <button
              type="button"
              className={styles.primary}
              disabled={request === null || loading}
              onClick={() => {
                if (request !== null) void runBoard(request);
              }}
            >
              计算
            </button>
          </div>

          {error !== null && <p className={styles.error}>{error}</p>}

          {board !== null && (
            <>
              <div className={styles.cards}>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>累计货量</span>
                  <strong className={styles.cardValue}>{kg(board.sum_vol)} kg</strong>
                  <span className={styles.cardNote}>{board.row_count} 组 · {board.dim_label}</span>
                </div>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>综合折扣（加权）</span>
                  <strong className={styles.cardValue}>{pct(board.weighted_disc)}</strong>
                  <span className={styles.cardNote}>简单平均 {pct(board.simple_disc)}</span>
                </div>
                <div className={styles.card}>
                  <span className={styles.cardTitle}>综合单价（加权）</span>
                  <strong className={styles.cardValue}>{ratio(board.weighted_unit)}</strong>
                  <span className={styles.cardNote}>简单平均 {ratio(board.simple_unit)}</span>
                </div>
              </div>

              <h4 className={styles.sectionTitle}>货物流向数据</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{board.dim_label}</th>
                    {board.bands.map((band) => (
                      <th key={band}>{band}</th>
                    ))}
                    <th>合计</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      {row.cells.map((cell, index) => (
                        <td key={`${row.label}-${board.bands[index]}`}>
                          {cell.vol > 0 ? `${kg(cell.vol)}（${pct(cell.vol / board.sum_vol, 1)}）` : "—"}
                        </td>
                      ))}
                      <td>{kg(totalCell(row.cells))}</td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td>合计</td>
                    {board.band_totals.map((cell, index) => (
                      <td key={`total-${board.bands[index]}`}>{kg(cell.vol)}</td>
                    ))}
                    <td>{kg(board.sum_vol)}</td>
                  </tr>
                </tbody>
              </table>

              <h4 className={styles.sectionTitle}>网点对比图表</h4>
              <div className={styles.chart}>
                <ReactECharts option={option} style={{ height: 280, width: "100%" }} notMerge />
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export default BoardWindow;
