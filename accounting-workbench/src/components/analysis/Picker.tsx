import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeOverlay } from "../../utils/overlay";
import styles from "./Picker.module.css";

export interface PickerItem {
  value: string;
  label: string;
  /** 右侧灰字，如「数值」「无数据」。 */
  meta?: string;
  disabled?: boolean;
}

interface PickerProps {
  /** 期望的左上角坐标（fixed 定位）；实际位置会被夹进窗口内。 */
  left: number;
  top: number;
  title?: string;
  items: PickerItem[];
  initialSelected?: string[];
  confirmLabel: string;
  /** 取值多选器带「清空」；字段选择器没有。 */
  showClear?: boolean;
  onConfirm: (values: string[]) => void;
  onCancel: () => void;
  /** 点到灰掉的项（时间范围内无数据）时给一句提示。 */
  onDisabledPick?: (item: PickerItem) => void;
}

/** 弹层宽度（CSS px，与 Picker.module.css 的 .picker 一致）。 */
const PICKER_WIDTH = 274;

/**
 * 原型 openFieldPicker / openValuePicker：搜索 + 多选 + 全选/清空 + 添加/确定。
 *
 * 2026-10-28 统一交互：
 * - 弹层自己夹进窗口（量真实尺寸 + 视口探针，确定按钮永远点得到）；
 * - 勾选后点窗口任意其他地方 = 收起并让勾选生效（不再白点一次取消）；
 * - Esc / 没改过就关 = 取消。
 *
 * 2026-10-28 第六轮（用户反馈 E：底部按钮仍被遮挡）：弹层改成 ``createPortal``
 * 挂到 ``document.body``，脱离祖先的 ``overflow`` 裁切。
 *
 * 2026-10-28 第七轮（用户反馈「底部还是看不到」）：portal 之后就剩坐标问题 ——
 * 字号缩放用 ``html { zoom }`` 时，``getBoundingClientRect()`` 是视觉坐标，
 * 而 inline ``top / max-height`` 是布局坐标（渲染时再乘 zoom），直接混用会让弹层
 * 往下多跑 zoom 倍距离，越靠页面底部越明显。现在统一走 ``placeOverlay()``
 * （输入视觉坐标、输出 CSS px），弹层视觉位置 = 想要的位置。
 */
function Picker({
  left,
  top,
  title,
  items,
  initialSelected = [],
  confirmLabel,
  onConfirm,
  onCancel,
  onDisabledPick,
}: PickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<string[]>(initialSelected);
  const [warning, setWarning] = useState("");
  const [placement] = useState(() =>
    placeOverlay({
      left,
      belowY: top,
      // 调用方传的是「锚点下方 4px」；往上翻时弹层底边要落在按钮上沿再留 4px，
      // 按按钮高度 26px 估：top - (4 + 26 + 4) = top - 34
      aboveY: top - 34,
      width: PICKER_WIDTH,
      designMax: 380,
      minBelow: 240,
      minHeight: 160,
    }),
  );

  const selected = useMemo(() => new Set(order), [order]);

  const changed = useMemo(() => {
    if (order.length !== initialSelected.length) return true;
    return order.some((value) => !initialSelected.includes(value));
  }, [order, initialSelected]);

  /* 点外面 = 收起并使勾选生效；Esc = 取消 */
  useEffect(() => {
    function close(): void {
      if (changed) {
        onConfirm(order);
        return;
      }
      onCancel();
    }
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [changed, order, onCancel, onConfirm]);

  const visible = useMemo(() => {
    const keyword = query.trim();
    if (keyword === "") return items;
    return items.filter((item) => item.label.includes(keyword));
  }, [items, query]);

  function toggle(item: PickerItem, checked: boolean): void {
    setWarning("");
    setOrder((prev) => {
      if (checked) {
        return prev.includes(item.value) ? prev : [...prev, item.value];
      }
      return prev.filter((value) => value !== item.value);
    });
  }

  function toggleAll(): void {
    setWarning("");
    const enabled = visible.filter((item) => !item.disabled);
    const allChecked = enabled.every((item) => selected.has(item.value));
    if (allChecked) {
      setOrder((prev) => prev.filter((value) => !enabled.some((item) => item.value === value)));
      return;
    }
    setOrder((prev) => {
      const next = [...prev];
      for (const item of enabled) {
        if (!next.includes(item.value)) next.push(item.value);
      }
      return next;
    });
  }

  function confirm(): void {
    if (order.length === 0) {
      setWarning("请先勾选");
      return;
    }
    onConfirm(order);
  }

  // SSR / 无 DOM 环境（renderToString 冒烟测试）下没有 body 可挂，直接不渲染
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.picker}
      style={{ left: placement.left, top: placement.top, maxHeight: placement.maxHeight }}
      ref={rootRef}
      role="dialog"
      aria-label={title ?? confirmLabel}
    >
      {title !== undefined && <div className={styles.title}>{title}</div>}
      <input
        className={`input ${styles.search}`}
        type="text"
        placeholder="搜索…"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.list}>
        {visible.map((item) => (
          <label
            key={item.value}
            className={`${styles.item} ${item.disabled ? styles.disabled : ""}`}
            onClick={() => {
              if (item.disabled) onDisabledPick?.(item);
            }}
          >
            <input
              type="checkbox"
              value={item.value}
              disabled={item.disabled}
              checked={selected.has(item.value)}
              onChange={(event) => toggle(item, event.target.checked)}
            />
            <span>{item.label}</span>
            {item.meta !== undefined && <span className={styles.dtype}>{item.meta}</span>}
          </label>
        ))}
        {visible.length === 0 && <div className={styles.empty}>没有匹配项</div>}
      </div>
      <div className={styles.foot}>
        <button type="button" className="btn btn-ghost" onClick={toggleAll}>
          全选
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setWarning("");
            setOrder([]);
          }}
        >
          取消全选
        </button>
        <span className="tiny">{order.length} 项</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={confirm}>
          {confirmLabel}
        </button>
      </div>
      {warning !== "" && <div className={styles.warning}>{warning}</div>}
    </div>,
    document.body,
  );
}

export default Picker;
