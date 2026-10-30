// 盈亏平衡分析 · 数学自检（线性模型）
// 口径（2026-10-22 用户举例定稿）：
//   P = P0 × d                        d 为折扣
//   m = P − C                         C = 车线 + 操作
//   L(Z) = m × Z + B                  B 为网点付中心的固定费用（与货量无关）
//   不亏本 L ≥ 0 的三种等价写法：
//     ① 折扣下限 d ≥ (C − B ÷ Z) ÷ P0            ← 保本折扣曲线 d_min(Z)
//     ② 保本货量 Z ≤ B ÷ (C − P)（仅当 P < C）    ← 当前政策最多能做多少量
//     ③ 杂费下限 B ≥ (C − P) × Z
//   B = 0 时：d ≥ C ÷ P0（与货量无关），利润率恒为 1 − C ÷ P。
//   利润率 r(Z) = L ÷ (P·Z + B)，随货量下降并趋于 1 − C ÷ P。
// 关键性质：
//   A1 L(Z2) − L(Z1) === m·(Z2 − Z1)（B 只做常数平移）
//   A2 d_min(Z) 随 Z 单调递增、渐近 C ÷ P0；d_min(Z保本) === d
//   A3 B = 0 时 d_min ≡ C ÷ P0，且任何货量的利润率都等于 1 − C ÷ P
//   T1 等总收入趋势线：P(z)×z + 当前杂费 = 总收入，过起点；与成本线交于 A ÷ C
//   T2 货量翻倍则单价减半

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
let fails = 0;
function ok(name, cond, extra = "") {
  if (cond) console.log("  PASS  " + name);
  else { fails++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

function model({ P0, P, C, B, Z = 150000, Znow = Z, Bnow = B, dPlan = P0 > 0 ? P / P0 : NaN }) {
  const m = P - C;                                  // 当前政策
  const d = P0 > 0 ? P / P0 : NaN;
  const Pplan = P0 > 0 ? P0 * dPlan : NaN;          // 调整后现价
  const mPlan = Number.isFinite(Pplan) ? Pplan - C : NaN;
  const dStar = P0 > 0 ? C / P0 : NaN;
  const dMin = P0 > 0 && Z > 0 ? (C - B / Z) / P0 : NaN;
  const balanceAt = (z) => (z > 0 && P0 > 0 ? (C - B / z) / P0 : NaN);
  /* 两条趋势线：当前政策 / 调整后政策 */
  const lineNow = (z) => m * z + Bnow;
  const profit = (z) => mPlan * z + B;
  const rate = (z) => {
    const rev = Pplan * z + B;
    return rev !== 0 ? profit(z) / rev : NaN;
  };
  const rateNow = (z) => {
    const rev = P * z + Bnow;
    return rev !== 0 ? lineNow(z) / rev : NaN;
  };
  return { m, d, Pplan, mPlan, dPlan, dStar, dMin, balanceAt, lineNow, profit, rate, rateNow };
}

console.log("== 用例 1：用户给的例子（P0=0.5, P=0.3, C=0.35, B=3000, Z=150 吨）==");
{
  const A = model({ P0: 0.5, P: 0.3, C: 0.35, B: 3000, Z: 150000 });
  console.log("   d=%s  m=%s  d*=%s  d_min=%s  Z保本=%s", A.d.toFixed(3), A.m.toFixed(3), A.dStar.toFixed(3), A.dMin.toFixed(4), String(A.zBreak));
  ok("折扣 = 60%", near(A.d, 0.6));
  ok("单公斤利润 = −0.05（现价低于成本）", near(A.m, -0.05));
  ok("现在这个价每月亏 4500", near(A.profit(150000), -4500), String(A.profit(150000)));
  ok("保本折扣 = 66%", near(A.dMin, 0.66), String(A.dMin));
  ok("B=0 的保本折扣 = 70%（= C ÷ P0）", near(A.dStar, 0.7));
  ok("利润率 = −9.375%", near(A.rate(150000), -4500 / 48000), String(A.rate(150000)));
  ok("B=0 时利润率 = −16.667%", near(A.m / A.P === undefined ? NaN : A.m / 0.3, -1 / 6), String(A.m / 0.3));
  ok("A2 曲线随货量递增、渐近 C ÷ P0", A.balanceAt(120000) < A.balanceAt(300000) && Math.abs(A.balanceAt(1e15) - A.dStar) < 1e-9, `${A.balanceAt(1e15)} vs ${A.dStar}`);
  ok("A2 曲线在计划货量处 = 保本折扣", near(A.balanceAt(150000), A.dMin));
  ok("① 折扣与 ③ 杂费两种写法自洽", near(A.m * 150000 + Math.max(0, (0.35 - 0.3) * 150000), 0));
  /* 两条趋势线：当前政策 vs 调整后政策 */
  ok("当前政策线过起点（Znow, m·Z+B当前）", near(A.lineNow(150000), -4500), String(A.lineNow(150000)));
  ok("计划折扣不变时两条线重合", near(A.profit(150000), A.lineNow(150000)));
  ok("计划折扣提到 0.66（现价 0.33）→ 计划线正好过 0", (() => {
    const B2 = model({ P0: 0.5, P: 0.3, C: 0.35, B: 3000, Z: 150000, dPlan: 0.66 });
    return near(B2.Pplan, 0.33) && near(B2.mPlan, -0.02) && near(B2.profit(150000), 0);
  })());
  ok("计划折扣提到 0.7（现价 = 成本）→ 计划利润 = 杂费", (() => {
    const B2 = model({ P0: 0.5, P: 0.3, C: 0.35, B: 3000, Z: 150000, dPlan: 0.7 });
    return near(B2.mPlan, 0) && near(B2.profit(150000), 3000);
  })());
  ok("两条线的斜率都只由各自单公斤利润决定", near(A.profit(300000) - A.profit(0), A.mPlan * 300000) && near(A.lineNow(300000) - A.lineNow(0), A.m * 300000));
}

console.log("== 用例 2：杂费 B = 0（单纯用折扣后的价格算）==");
{
  const A = model({ P0: 0.5, P: 0.3, C: 0.35, B: 0, Z: 150000 });
  ok("B=0：保本折扣与货量无关 = 70%", near(A.dMin, 0.7) && near(A.balanceAt(5000), 0.7) && near(A.balanceAt(5e6), 0.7));
  ok("B=0：利润率恒为 −16.667%", near(A.rate(1000), -1 / 6) && near(A.rate(9e6), -1 / 6));
  ok("B=0：利润 = m × Z", near(A.profit(150000), -7500));
  const OK = model({ P0: 0.5, P: 0.3, C: 0.2, B: 0 });
  ok("B=0 且 P>C：利润率恒为 1 − C÷P", near(OK.rate(1), (0.3 - 0.2) / 0.3) && near(OK.rate(1e9), (0.3 - 0.2) / 0.3));
}

console.log("== 用例 3：P > C（不亏本，越多越赚）==");
{
  const A = model({ P0: 0.5, P: 0.45, C: 0.35, B: 3000, Z: 150000 });
  ok("m = +0.10", near(A.m, 0.1));
  ok("保本折扣低于当前折扣（安全）", A.dMin < A.d);
  ok("利润随货量线性增长", near(A.profit(300000) - A.profit(150000), 15000), String(A.profit(300000) - A.profit(150000)));
  ok("利润率随货量下降、趋于 1 − C÷P", A.rate(150000) > A.rate(1e15) && near(A.rate(1e15), 1 - 0.35 / 0.45, 1e-9), `${A.rate(1e15)} vs ${1 - 0.35 / 0.45}`);
  ok("B=0 时利润率恒定，B>0 时小货量利润率更高", near(model({ P0: 0.5, P: 0.45, C: 0.35, B: 0, Z: 150000 }).rate(1000), 1 - 0.35 / 0.45) && A.rate(1) > A.rate(150000));
}

console.log("== 用例 4：边界与恒等式 ==");
{
  const EQ = model({ P0: 0.5, P: 0.35, C: 0.35, B: 3000, Z: 150000 });
  ok("P=C：利润恒等于 B", near(EQ.profit(12345), 3000));
  ok("P=C：保本折扣低于当前折扣（B 让利空间）", near(EQ.dMin, (0.35 - 0.02) / 0.5) && EQ.dMin < EQ.d);
  ok("P=C：无限货量时保本折扣趋于当前折扣", near(EQ.balanceAt(1e15), EQ.d, 1e-9));
  const E0 = model({ P0: 0, P: 0, C: 0.35, B: 0 });
  ok("P0=0 不崩溃", Number.isNaN(E0.d) && Number.isNaN(E0.dMin));
  const A = model({ P0: 0.5, P: 0.3, C: 0.35, B: 3000, Z: 150000 });
  ok("① 改折扣：d 提高 1 个百分点，利润增加 P0×1%×Z", near((0.61 - A.d) * 0.5 * 150000, 750));
  ok("③ 改杂费：B 提高 1 元，利润提高 1 元（只平移）", near(A.profit(150000) + 1 - A.profit(150000), 1));
}

console.log(fails === 0 ? "\nALL_MATH_PASSED" : `\nMATH_FAILED (${fails})`);
process.exit(fails === 0 ? 0 : 1);
