import { useState } from "react";
import type { FixedRuleInfo } from "../../types/api";
import Modal from "../common/Modal";
import styles from "./FixedRuleMenu.module.css";

const AGG_LABELS: Record<string, string> = {
  sum: "求和",
  avg: "平均值",
  max: "最大值",
  min: "最小值",
  median: "中位数",
  count: "计数",
};

interface FixedRuleMenuProps {
  rules: FixedRuleInfo[];
  onAnalyze: (rule: FixedRuleInfo) => void;
}

/** 固定规则二级菜单：左列选口径，右列展开详情（原型 .picker.cascade 向右展开）。 */
function FixedRuleMenu({ rules, onAnalyze }: FixedRuleMenuProps) {
  const [selectedName, setSelectedName] = useState<string | null>(
    rules.find((rule) => rule.available)?.name ?? null,
  );
  const [missingRule, setMissingRule] = useState<FixedRuleInfo | null>(null);

  const selected = rules.find((rule) => rule.name === selectedName) ?? null;

  function handleClick(rule: FixedRuleInfo): void {
    if (!rule.available) {
      setMissingRule(rule);
      return;
    }
    setSelectedName(rule.name);
    setMissingRule(null);
  }

  return (
    <div className={styles.cascade}>
      <div className={styles.col}>
        <div className={styles.hint}>网点标准口径</div>
        {rules.map((rule) => (
          <button
            key={rule.name}
            type="button"
            className={`${styles.item} ${selected?.name === rule.name ? styles.itemOn : ""}`}
            onClick={() => handleClick(rule)}
          >
            <span className={styles.name}>{rule.name}</span>
            <span className={rule.available ? styles.ok : styles.missing}>
              {rule.available ? "可用" : `缺 ${rule.missing_fields.length} 字段`}
            </span>
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className={`${styles.col} ${styles.sub}`}>
          <div className={styles.subTitle}>{selected.name}</div>
          <div className={styles.kv}>
            <b>分组</b>
            <span>{selected.group_by.join("、")}</span>
          </div>
          <div className={styles.kv}>
            <b>指标</b>
            <span>
              {selected.metrics
                .map((metric) => `${metric.alias} = ${AGG_LABELS[metric.agg] ?? metric.agg}(${metric.field})`)
                .join("；")}
            </span>
          </div>
          {selected.derived_metrics.length > 0 && (
            <div className={styles.kv}>
              <b>派生</b>
              <span>
                {selected.derived_metrics
                  .map((derived) => `${derived.alias} = ${derived.expression}`)
                  .join("；")}
              </span>
            </div>
          )}
          <div className={styles.foot}>
            <span className="tiny">选中后进入分析页并预填</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onAnalyze(selected)}
            >
              开始分析
            </button>
          </div>
        </div>
      )}

      {missingRule !== null && (
        <Modal
          title={`缺少字段：${missingRule.name}`}
          onClose={() => setMissingRule(null)}
        >
          <p>执行「{missingRule.name}」需要以下字段：</p>
          <ul className={styles.missingList}>
            {missingRule.missing_fields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <p className={styles.missingHint}>
            关闭此窗口后可继续用「分析」自定义条件与指标。
          </p>
        </Modal>
      )}
    </div>
  );
}

export default FixedRuleMenu;
