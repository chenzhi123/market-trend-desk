// 增加指数：复制 INDICES 里的一条，改 id / name / code / secid / group / session / sensitivity。
// secid 是东方财富 QuoteID，例如沪深300 为 1.000300，费城半导体为 251.SOX。
// 改完后双击「刷新行情.bat」，或运行 node update.mjs。

export const BULL_AT = 18;
export const LEAN_AT = 8;
export const SOON_DAYS = 21;

export const HORIZONS = [
  {
    key: "current",
    role: "current",
    trend: 1,
    momentum: 1,
    semi: 1,
    macro: 1,
    vol: 1,
    confidence: 1,
    cap: 0.88,
    location: "trend",
    revertScale: 0,
  },
  {
    key: "next",
    role: "scenario",
    trend: 0.72,
    momentum: 0.45,
    semi: 0.7,
    macro: 0.5,
    vol: 1.1,
    confidence: 0.78,
    cap: 0.7,
    location: "revert",
    revertScale: 1,
  },
  {
    key: "far",
    role: "scenario",
    trend: 0.48,
    momentum: 0.22,
    semi: 0.4,
    macro: 0.25,
    vol: 1.2,
    confidence: 0.62,
    cap: 0.56,
    location: "revert",
    revertScale: 1.15,
  },
];

const CN = { timeZone: "Asia/Shanghai", closeHour: 15, closeMinute: 0 };
const US = { timeZone: "America/New_York", closeHour: 16, closeMinute: 0 };
const JP = { timeZone: "Asia/Tokyo", closeHour: 15, closeMinute: 0 };
const KR = { timeZone: "Asia/Seoul", closeHour: 15, closeMinute: 30 };

export const INDICES = [
  {
    id: "csi300",
    name: "沪深300",
    code: "000300",
    secid: "1.000300",
    yahoo: "000300.SS",
    group: "A股",
    session: CN,
    // semi：相对费城半导体趋势的联动强度。rates / dollar：该因子满档加减分。
    sensitivity: { semi: 0.25, rates: 4, dollar: 4 },
    manualBias: 0,
  },
  {
    id: "star",
    name: "科创综指",
    code: "000680",
    secid: "1.000680",
    yahoo: "000680.SS",
    group: "A股",
    session: CN,
    sensitivity: { semi: 0.75, rates: 8, dollar: 3 },
    manualBias: 0,
  },
  {
    id: "chinext",
    name: "创业板指",
    code: "399006",
    secid: "0.399006",
    yahoo: "399006.SZ",
    group: "A股",
    session: CN,
    sensitivity: { semi: 0.5, rates: 6, dollar: 3 },
    manualBias: 0,
  },
  {
    id: "spx",
    name: "标普500",
    code: "SPX",
    secid: "100.SPX",
    yahoo: "^GSPC",
    group: "美股",
    session: US,
    sensitivity: { semi: 0.3, rates: 5, dollar: 3 },
    manualBias: 0,
  },
  {
    id: "ndx",
    name: "纳斯达克100",
    code: "NDX",
    secid: "100.NDX",
    yahoo: "^NDX",
    group: "美股",
    session: US,
    sensitivity: { semi: 0.6, rates: 10, dollar: 2 },
    manualBias: 0,
  },
  {
    id: "dji",
    name: "道琼斯工业指数",
    code: "DJIA",
    secid: "100.DJIA",
    yahoo: "^DJI",
    group: "美股",
    session: US,
    sensitivity: { semi: 0.12, rates: 3, dollar: 4 },
    manualBias: 0,
  },
  {
    id: "sox",
    name: "费城半导体",
    code: "SOX",
    secid: "251.SOX",
    yahoo: "^SOX",
    group: "美股",
    session: US,
    sensitivity: { semi: 0, rates: 8, dollar: 2 },
    manualBias: 0,
  },
  {
    id: "kospi",
    name: "韩国KOSPI",
    code: "KS11",
    secid: "100.KS11",
    yahoo: "^KS11",
    group: "亚太",
    session: KR,
    sensitivity: { semi: 0.7, rates: 4, dollar: 6 },
    manualBias: 0,
  },
  {
    id: "n225",
    name: "日经225",
    code: "N225",
    secid: "100.N225",
    yahoo: "^N225",
    group: "亚太",
    session: JP,
    sensitivity: { semi: 0.45, rates: 3, dollar: 4 },
    manualBias: 0,
  },
];

// 这些序列只参与宏观修正，不单独出卡片。美元和美债取不超过「今天」的最新日线。
export const MACRO_SERIES = [
  { id: "us10y", name: "美债10年收益率", secid: "171.US10Y", yahoo: "^TNX", timeZone: "America/New_York", session: null },
  { id: "dxy", name: "美元指数", secid: "100.UDI", yahoo: "DX-Y.NYB", timeZone: "America/New_York", session: null },
];

export const SCOPE = {
  US: { spx: 1, ndx: 1, dji: 1, sox: 1, csi300: 0.35, star: 0.4, chinext: 0.4, kospi: 0.45, n225: 0.45 },
  JP: { n225: 1, kospi: 0.4, sox: 0.3, ndx: 0.25, spx: 0.2, dji: 0.15, star: 0.2, chinext: 0.15, csi300: 0.15 },
  KR: { kospi: 1, n225: 0.35, sox: 0.45, ndx: 0.3, star: 0.3, chinext: 0.2, spx: 0.15, dji: 0.1, csi300: 0.1 },
  CN: { csi300: 1, star: 1, chinext: 1, kospi: 0.2, n225: 0.2, sox: 0.15, ndx: 0.15, spx: 0.1, dji: 0.1 },
};

export const SCOPE_LABEL = {
  US: "美国",
  JP: "日本",
  KR: "韩国",
  CN: "中国",
};

// 只收录核对过的日期。未公布结果的会议不写成涨或跌。
// LPR 按「每月20日，遇周末顺延」列入，法定假日仍可能再顺延。
// 韩国银行 2027 年日程页面未给出具体日期，因此不编造。
export const EVENTS = [
  { date: "2026-10-14", title: "美国CPI（9月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局日程，已经发布。" },
  { date: "2026-10-22", title: "韩国银行议息", impact: "high", scope: "KR", kind: "policy", note: "韩国银行 2026 年议息日程。" },
  { date: "2026-10-28", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "10月27–28日会议，决议在28日公布。本次不含季度经济预测。" },
  { date: "2026-10-30", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "10月29–30日会议，30日公布政策声明和展望报告。" },
  { date: "2026-11-06", title: "美国非农就业（10月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程，美东 8:30。" },
  { date: "2026-11-10", title: "美国CPI（10月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程，美东 8:30。" },
  { date: "2026-11-20", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "每月20日公布，遇节假日顺延。11月20日为周五。" },
  { date: "2026-11-26", title: "韩国银行议息", impact: "high", scope: "KR", kind: "policy", note: "韩国银行 2026 年议息日程。" },
  { date: "2026-11-30", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。若遇节假日，以国家统计局日历为准。" },
  { date: "2026-12-04", title: "美国非农就业（11月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2026-12-09", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "12月8–9日会议，含经济预测和点阵图。" },
  { date: "2026-12-10", title: "美国CPI（11月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2026-12-18", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "12月17–18日会议。" },
  { date: "2026-12-21", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "12月20日为周日，按遇周末顺延列入21日。法定假日仍可能再顺延。" },
  { date: "2026-12-31", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-01-08", title: "美国非农就业（12月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-01-13", title: "美国CPI（12月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-01-20", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "1月20日为周三。" },
  { date: "2027-01-22", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "1月21–22日会议，含展望报告。" },
  { date: "2027-01-27", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "1月26–27日会议。" },
  { date: "2027-01-31", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-02-05", title: "美国非农就业（1月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-02-11", title: "美国CPI（1月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-02-22", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "2月20日为周六，按遇周末顺延列入22日。若春节假期覆盖，以央行公告为准。" },
  { date: "2027-02-28", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-03-05", title: "美国非农就业（2月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-03-10", title: "美国CPI（2月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-03-17", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "3月16–17日会议，含经济预测。" },
  { date: "2027-03-18", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "3月17–18日会议。" },
  { date: "2027-03-22", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "3月20日为周六，按遇周末顺延列入22日。" },
  { date: "2027-03-31", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-04-02", title: "美国非农就业（3月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-04-13", title: "美国CPI（3月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-04-20", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "4月20日为周二。" },
  { date: "2027-04-28", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "4月27–28日会议。" },
  { date: "2027-04-28", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "4月27–28日会议，含展望报告。" },
  { date: "2027-04-30", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-05-07", title: "美国非农就业（4月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-05-12", title: "美国CPI（4月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-05-20", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "5月20日为周四。" },
  { date: "2027-05-31", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
  { date: "2027-06-04", title: "美国非农就业（5月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局就业形势日程。" },
  { date: "2027-06-09", title: "美联储议息决议", impact: "high", scope: "US", kind: "policy", note: "6月8–9日会议，含经济预测。" },
  { date: "2027-06-10", title: "美国CPI（5月）", impact: "medium", scope: "US", kind: "data", note: "劳工统计局消费者物价日程。" },
  { date: "2027-06-11", title: "日本银行议息", impact: "high", scope: "JP", kind: "policy", note: "6月10–11日会议。" },
  { date: "2027-06-21", title: "中国LPR", impact: "medium", scope: "CN", kind: "policy", note: "6月20日为周日，按遇周末顺延列入21日。" },
  { date: "2027-06-30", title: "中国官方制造业PMI", impact: "low", scope: "CN", kind: "data", note: "按月末发布的惯例列入。" },
];

export const METHOD = [
  "当前季度描述已经走出的结构：收盘相对20/60/120/250日均线、均线排列、MACD柱、RSI(14)、近60日涨跌、近一年区间位置、20日与60日波动。",
  "综合分达到18为看多，低于-18为看空。8到17之间记为震荡，并注明略偏多或略偏空。",
  "未来两个季度是情景，不预测点位。趋势惯性分别保留72%和48%，动量保留45%和22%。价格若已经贴近一年区间的极端位置，会加入向中间回归的分数。",
  "方向上的宏观加减分只来自算得出来的量：费城半导体自身趋势对其他指数的联动、美债10年期近60个交易日的变化（满档约40个基点）、美元指数近60个交易日的变化（满档约3%）。",
  "议息、CPI、非农和LPR写在日历里。未来21天内的事件会降低置信度，更远的重要议息只轻微降低。未公布的决议不会被写成上涨或下跌。",
  "置信度看分项是否同向、日线是否够长、以及临近事件有多少。它不是历史胜率，也不是上涨概率。",
  "红涨绿跌。各市场只用自己已经收盘的最后一根日K。费城半导体在东方财富的历史较短，因此改用雅虎财经日线。增加指数时改 config.mjs，再重新更新行情。",
];

export const SOURCES = [
  { name: "行情", detail: "东方财富日K" },
  { name: "美联储日程", detail: "federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  { name: "日本银行日程", detail: "boj.or.jp 货币政策会议日程" },
  { name: "韩国银行日程", detail: "2026年议息日期；2027年未写入" },
  { name: "美国CPI与非农", detail: "bls.gov 发布日程" },
  { name: "中国LPR", detail: "每月20日，遇节假日顺延" },
];
