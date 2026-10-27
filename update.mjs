import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BULL_AT,
  LEAN_AT,
  SOON_DAYS,
  HORIZONS,
  INDICES,
  MACRO_SERIES,
  SCOPE,
  EVENTS,
  METHOD,
  SOURCES,
} from "./config.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const QNAME = ["", "一", "二", "三", "四"];

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function round(value, digits = 0) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function isoToUtc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtUtc(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  return fmtUtc(new Date(isoToUtc(iso).getTime() + days * 86400000));
}

function daysBetween(fromIso, toIso) {
  return Math.round((isoToUtc(toIso) - isoToUtc(fromIso)) / 86400000);
}

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    hour,
    minute: Number(map.minute),
    iso: `${map.year}-${map.month}-${map.day}`,
  };
}

function lastCompletedSession(now, session) {
  if (!session) return null;
  const z = zonedParts(now, session.timeZone);
  let cursor = isoToUtc(z.iso);
  const minutes = z.hour * 60 + z.minute;
  const close = session.closeHour * 60 + session.closeMinute;
  if (minutes < close) cursor = new Date(cursor.getTime() - 86400000);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return fmtUtc(cursor);
}

function shanghaiToday(now) {
  return zonedParts(now, "Asia/Shanghai").iso;
}

function quarterOf(iso) {
  const [year, month] = iso.split("-").map(Number);
  return { year, q: Math.floor((month - 1) / 3) + 1 };
}

function shiftQuarter(year, q, steps) {
  const index = year * 4 + (q - 1) + steps;
  return { year: Math.floor(index / 4), q: (index % 4) + 1 };
}

function quarterRange(year, q) {
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    id: `${year}Q${q}`,
    label: `${year} 年${QNAME[q]}季度`,
    start: fmtUtc(start),
    end: fmtUtc(end),
  };
}

function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiWilder(values, period = 14) {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macdLast(values) {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const line = [];
  for (let i = 0; i < values.length; i += 1) {
    if (ema12[i] == null || ema26[i] == null) continue;
    line.push(ema12[i] - ema26[i]);
  }
  if (line.length < 15) return null;
  const signal = ema(line, 9);
  const hist = line.map((value, i) => (signal[i] == null ? null : value - signal[i]));
  const last = hist.at(-1);
  const prev = hist.at(-6);
  if (last == null || prev == null) return null;
  return { hist: last, prev };
}

function pctChange(values, bars) {
  if (values.length <= bars) return null;
  const base = values[values.length - 1 - bars];
  if (!base) return null;
  return values.at(-1) / base - 1;
}

function rangePos(values, bars = 252) {
  const window = values.slice(-Math.min(bars, values.length));
  if (window.length < 60) return null;
  const high = Math.max(...window);
  const low = Math.min(...window);
  const pos = high === low ? 0.5 : (window.at(-1) - low) / (high - low);
  return { pos, bars: window.length };
}

function realizedVol(values, bars) {
  if (values.length < bars + 1) return null;
  const returns = [];
  for (let i = values.length - bars; i < values.length; i += 1) {
    returns.push(Math.log(values[i] / values[i - 1]));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function verdictOf(score) {
  if (score >= BULL_AT) return { verdict: "bull", label: "看多", lean: "" };
  if (score <= -BULL_AT) return { verdict: "bear", label: "看空", lean: "" };
  if (score >= LEAN_AT) return { verdict: "range", label: "震荡", lean: "略偏多" };
  if (score <= -LEAN_AT) return { verdict: "range", label: "震荡", lean: "略偏空" };
  return { verdict: "range", label: "震荡", lean: "" };
}

async function fetchSeries(secid) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", secid);
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", "20180101");
  url.searchParams.set("end", "20500101");
  url.searchParams.set("lmt", "2000");
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f53");
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://quote.eastmoney.com/",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const rows = payload?.data?.klines;
      if (!rows?.length) throw new Error("空行情");
      const bars = rows
        .map((row) => {
          const [date, close] = row.split(",");
          return { date, close: Number(close) };
        })
        .filter((bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && Number.isFinite(bar.close) && bar.close > 0);
      if (bars.length < 80) throw new Error(`样本过短 ${bars.length}`);
      return { name: payload.data.name || "", bars };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function dedupeBars(bars) {
  const map = new Map();
  for (const bar of bars) map.set(bar.date, bar);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const bars = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (!Number.isFinite(close) || close <= 0) continue;
    bars.push({ date: zonedParts(new Date(timestamps[i] * 1000), "America/New_York").iso, close });
  }
  const cleaned = dedupeBars(bars);
  if (cleaned.length < 80) throw new Error("雅虎样本过短");
  return { name: result.meta?.longName || symbol, bars: cleaned, source: "雅虎财经" };
}

function trimBars(bars, cutoff) {
  if (!cutoff) return bars;
  return bars.filter((bar) => bar.date <= cutoff);
}

function trendRaw(closes) {
  const last = closes.at(-1);
  const ma = {
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    ma120: sma(closes, 120),
    ma250: sma(closes, 250),
  };
  const checks = [
    [ma.ma20 != null, last > ma.ma20, 6, "收盘高于20日均线"],
    [ma.ma60 != null, last > ma.ma60, 8, "收盘高于60日均线"],
    [ma.ma120 != null, last > ma.ma120, 8, "收盘高于120日均线"],
    [ma.ma250 != null, last > ma.ma250, 6, "收盘高于250日均线"],
    [ma.ma20 != null && ma.ma60 != null, ma.ma20 > ma.ma60, 6, "20日均线高于60日均线"],
    [ma.ma60 != null && ma.ma120 != null, ma.ma60 > ma.ma120, 6, "60日均线高于120日均线"],
  ];
  let score = 0;
  const bits = [];
  for (const [known, ok, points, text] of checks) {
    if (!known) continue;
    score += ok ? points : -points;
    bits.push(`${text}${ok ? "" : "不成立"}`);
  }
  return { score, note: bits.join("；"), ...ma };
}

function momentumRaw(closes) {
  const macd = macdLast(closes);
  const rsi = rsiWilder(closes);
  const ret60 = pctChange(closes, 60);
  let score = 0;
  const bits = [];
  if (macd) {
    score += macd.hist > 0 ? 8 : -8;
    score += macd.hist > macd.prev ? 6 : -6;
    bits.push(
      `MACD柱${macd.hist > 0 ? "在零轴上方" : "在零轴下方"}，较5个交易日前${macd.hist > macd.prev ? "增强" : "转弱"}`,
    );
  }
  if (rsi != null) {
    score += clamp(((rsi - 50) / 50) * 10, -10, 10);
    bits.push(`RSI(14)为${rsi.toFixed(0)}`);
  }
  if (ret60 != null) {
    score += clamp(ret60 / 0.12, -1, 1) * 6;
    bits.push(`近60个交易日${ret60 >= 0 ? "上涨" : "下跌"}${(Math.abs(ret60) * 100).toFixed(1)}%`);
  }
  return { score: clamp(score, -30, 30), note: bits.join("；"), rsi, ret60 };
}

function locationScore(range, mode, revertScale) {
  if (!range) return { score: 0, note: "区间样本不足" };
  const span = range.bars >= 240 ? "近一年" : `近${range.bars}个交易日`;
  const pct = `${Math.round(range.pos * 100)}%`;
  if (mode === "trend") {
    const score = clamp((range.pos - 0.5) * 20, -10, 10);
    const where = range.pos >= 0.6 ? "偏高，当前季度按趋势延续计为偏多" : range.pos <= 0.4 ? "偏低，当前季度按趋势延续计为偏空" : "居中";
    return { score: round(score), note: `收盘位于${span}区间的${pct}分位，位置${where}` };
  }
  let score = 0;
  if (range.pos > 0.72) score = -((range.pos - 0.72) / 0.28) * 16 * revertScale;
  else if (range.pos < 0.28) score = ((0.28 - range.pos) / 0.28) * 12 * revertScale;
  score = clamp(score, -16, 16);
  const where = score < 0 ? "位置过高，未来季度向中间回归" : score > 0 ? "位置过低，未来季度向中间回归" : "位置不极端";
  return { score: round(score), note: `收盘位于${span}区间的${pct}分位，${where}` };
}

function volScore(rv20, rv60, ret20, scale) {
  if (rv20 == null || rv60 == null || rv60 === 0) return { score: 0, note: "波动样本不足" };
  const ratio = rv20 / rv60;
  let score = 0;
  let extra = "波动处于常态";
  if (ratio >= 1.35 && ret20 != null && ret20 < 0) {
    score = -10;
    extra = "下跌同时波动放大";
  } else if (ratio >= 1.35) {
    score = -4;
    extra = "上涨同时波动放大";
  } else if (ratio <= 0.85) {
    score = 3;
    extra = "波动收敛";
  }
  return {
    score: round(clamp(score * scale, -12, 4)),
    note: `20日年化波动${(rv20 * 100).toFixed(0)}%，为60日的${ratio.toFixed(2)}倍，${extra}`,
  };
}

function eventTiming(date, deskDate) {
  if (date < deskDate) return "past";
  if (daysBetween(deskDate, date) <= SOON_DAYS) return "soon";
  return "later";
}

function penaltyFor(indexId, events, quarter, deskDate) {
  let penalty = 0;
  const hits = [];
  for (const event of events) {
    if (event.date < quarter.start || event.date > quarter.end || event.date < deskDate) continue;
    const weight = SCOPE[event.scope]?.[indexId] || 0;
    if (weight <= 0) continue;
    const days = daysBetween(deskDate, event.date);
    let base = 0;
    if (event.impact === "high") base = days <= SOON_DAYS ? 0.05 : 0.02;
    else if (event.impact === "medium" && days <= SOON_DAYS) base = 0.02;
    else if (event.impact === "low" && days <= SOON_DAYS) base = 0.01;
    if (base === 0) continue;
    const hit = base * weight;
    penalty += hit;
    hits.push({ date: event.date, title: event.title, confidenceHit: round(hit, 3) });
  }
  const raw = penalty;
  const capped = Math.min(0.16, penalty);
  const scale = raw > 0 ? capped / raw : 1;
  return {
    penalty: capped,
    hits: hits.map((hit) => ({ ...hit, confidenceHit: round(hit.confidenceHit * scale, 3) })),
  };
}

function confidenceOf({ call, factors, bars, horizon, penalty }) {
  const directional = ["trend", "momentum", "location"]
    .map((id) => factors.find((factor) => factor.id === id))
    .filter(Boolean);
  let agreement;
  if (call.verdict === "range") {
    const energy = directional.reduce((sum, factor) => sum + Math.abs(factor.score), 0);
    agreement = 1 - Math.min(1, energy / 36);
  } else {
    const want = call.verdict === "bull" ? 1 : -1;
    const hits = directional.filter((factor) => Math.sign(factor.score) === want).length;
    agreement = hits / Math.max(1, directional.length);
  }
  let value = 0.34 + agreement * 0.5;
  if (Math.abs(factors.reduce((sum, factor) => sum + factor.score, 0)) >= 35) value += 0.04;
  if (bars < 250) value *= 0.9;
  if (bars < 120) value *= 0.85;
  value *= horizon.confidence;
  value *= 1 - penalty;
  value = clamp(value, 0.22, horizon.cap);
  return round(value, 2);
}

function buildQuarterCall(ctx, horizon, quarter, events, deskDate) {
  const factors = [];
  const trendScore = round(ctx.trend.score * horizon.trend);
  factors.push({
    id: "trend",
    label: "趋势结构",
    score: trendScore,
    note: `${ctx.trend.note}。原始趋势分${round(ctx.trend.score)}，本季按${Math.round(horizon.trend * 100)}%计入`,
  });
  factors.push({
    id: "momentum",
    label: "动量",
    score: round(ctx.momentum.score * horizon.momentum),
    note: `${ctx.momentum.note}。本季按${Math.round(horizon.momentum * 100)}%计入`,
  });
  const location = locationScore(ctx.range, horizon.location, horizon.revertScale);
  factors.push({ id: "location", label: horizon.location === "trend" ? "区间位置" : "位置回归", score: location.score, note: location.note });
  const vol = volScore(ctx.rv20, ctx.rv60, ctx.ret20, horizon.vol);
  factors.push({ id: "volatility", label: "波动状态", score: vol.score, note: vol.note });

  if (ctx.semi != null && ctx.index.sensitivity.semi > 0) {
    const score = round(clamp((ctx.semi.trend / 40) * 12 * ctx.index.sensitivity.semi * horizon.semi, -12, 12));
    factors.push({
      id: "semi",
      label: "半导体联动",
      score,
      note: `费城半导体趋势分${ctx.semi.trend}，${ctx.index.name}联动系数${ctx.index.sensitivity.semi}，本季按${Math.round(horizon.semi * 100)}%计入`,
    });
  }
  if (ctx.rates) {
    const impulse = clamp(ctx.rates.delta / 0.4, -1, 1);
    const score = round(-ctx.index.sensitivity.rates * impulse * horizon.macro);
    factors.push({
      id: "rates",
      label: "美债利率",
      score,
      note: `美债10年期${ctx.rates.last.toFixed(2)}%，近60个交易日${ctx.rates.delta >= 0 ? "上行" : "下行"}${Math.abs(ctx.rates.delta * 100).toFixed(0)}个基点`,
    });
  }
  if (ctx.dollar) {
    const impulse = clamp(ctx.dollar.ret / 0.03, -1, 1);
    const score = round(-ctx.index.sensitivity.dollar * impulse * horizon.macro);
    factors.push({
      id: "dollar",
      label: "美元指数",
      score,
      note: `美元指数${ctx.dollar.last.toFixed(2)}，近60个交易日${ctx.dollar.ret >= 0 ? "上涨" : "下跌"}${(Math.abs(ctx.dollar.ret) * 100).toFixed(1)}%`,
    });
  }
  if (ctx.index.manualBias) {
    const score = clamp(round(ctx.index.manualBias), -15, 15);
    factors.push({ id: "manual", label: "手工偏向", score, note: "来自 config.mjs 的 manualBias，默认是0" });
  }

  const macroIds = new Set(["semi", "rates", "dollar", "manual"]);
  const macroFactors = factors.filter((factor) => macroIds.has(factor.id));
  const macroSum = macroFactors.reduce((sum, factor) => sum + factor.score, 0);
  if (macroSum !== 0 && Math.abs(macroSum) > 12) {
    const scale = 12 / Math.abs(macroSum);
    for (const factor of macroFactors) factor.score = round(factor.score * scale);
    const biggest = [...macroFactors].sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];
    biggest.note += "。利率、美元和半导体联动合计超过12分，已按比例收缩";
  }

  const score = clamp(round(factors.reduce((sum, factor) => sum + factor.score, 0)), -100, 100);
  const call = verdictOf(score);
  const { penalty, hits } = penaltyFor(ctx.index.id, events, quarter, deskDate);
  const confidence = confidenceOf({ call, factors, bars: ctx.closes.length, horizon, penalty });
  const lead = [...factors].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3);
  const leadText = lead
    .filter((factor) => factor.score !== 0)
    .map((factor) => `${factor.label}${factor.score > 0 ? "+" : ""}${factor.score}`)
    .join("，");
  const headline = `${call.label}${call.lean ? `，${call.lean}` : ""}`;
  const prefix = horizon.role === "scenario" ? "情景：" : "";
  let stretch = "";
  if (horizon.role === "current" && ctx.momentum.rsi != null && ctx.momentum.rsi <= 30) {
    stretch = " RSI低于30，短线已经超卖，本季仍按已经走出的结构判断。";
  } else if (horizon.role === "current" && ctx.momentum.rsi != null && ctx.momentum.rsi >= 70) {
    stretch = " RSI高于70，短线已经超买，本季仍按已经走出的结构判断。";
  }
  const summary = `${prefix}综合分${score > 0 ? "+" : ""}${score}，判断为${headline}。主要来自${leadText || "各分项相互抵消"}。${stretch}`;
  return {
    score,
    verdict: call.verdict,
    label: call.label,
    lean: call.lean,
    confidence,
    eventPenalty: round(penalty, 3),
    factors,
    events: hits,
    summary,
  };
}

function quarterReturn(bars, start, end) {
  const inside = bars.filter((bar) => bar.date >= start && bar.date <= end);
  if (inside.length < 2) return null;
  return inside.at(-1).close / inside[0].close - 1;
}

function macroFrom(bars) {
  const closes = bars.map((bar) => bar.close);
  const last = closes.at(-1);
  const prev = closes.at(-61);
  return {
    last,
    asOf: bars.at(-1).date,
    delta: prev == null ? null : last - prev,
    ret: prev == null ? null : last / prev - 1,
  };
}

export async function buildSnapshot(now = new Date()) {
  const deskDate = shanghaiToday(now);
  const targets = [
    ...INDICES.map((item) => ({ secid: item.secid, session: item.session })),
    ...MACRO_SERIES.map((item) => ({ secid: item.secid, session: item.session })),
  ];
  const unique = [...new Map(targets.map((item) => [item.secid, item])).values()];
  const yahooOf = new Map(INDICES.filter((item) => item.yahoo).map((item) => [item.secid, item.yahoo]));
  const loaded = new Map();
  await Promise.all(
    unique.map(async (item) => {
      const cutoff = item.session ? lastCompletedSession(now, item.session) : deskDate;
      try {
        const series = await fetchSeries(item.secid);
        let bars = trimBars(series.bars, cutoff);
        let name = series.name;
        let source = "东方财富";
        if (bars.length < 250 && yahooOf.has(item.secid)) {
          const alt = await fetchYahoo(yahooOf.get(item.secid));
          const altBars = trimBars(alt.bars, cutoff);
          if (altBars.length > bars.length) {
            bars = altBars;
            name = alt.name || name;
            source = alt.source;
          }
        }
        loaded.set(item.secid, { name, bars, cutoff, source });
      } catch (error) {
        if (yahooOf.has(item.secid)) {
          try {
            const alt = await fetchYahoo(yahooOf.get(item.secid));
            const bars = trimBars(alt.bars, cutoff);
            if (bars.length) {
              loaded.set(item.secid, { name: alt.name, bars, cutoff, source: alt.source });
              return;
            }
          } catch {
            // 备用源失败时保留原来的错误。
          }
        }
        loaded.set(item.secid, { name: "", bars: [], error: error.message, cutoff: null, source: "" });
      }
    }),
  );

  const soxBars = loaded.get("251.SOX")?.bars || [];
  const soxCloses = soxBars.map((bar) => bar.close);
  const semi = soxCloses.length ? { trend: round(trendRaw(soxCloses).score), asOf: soxBars.at(-1).date, last: soxCloses.at(-1) } : null;
  const yieldBars = loaded.get("171.US10Y")?.bars || [];
  const rates = yieldBars.length > 61 ? macroFrom(yieldBars) : null;
  const dollarBars = loaded.get("100.UDI")?.bars || [];
  const dollar = dollarBars.length > 61 ? macroFrom(dollarBars) : null;

  const base = quarterOf(deskDate);
  const quarters = [0, 1, 2].map((step, index) => {
    const shifted = shiftQuarter(base.year, base.q, step);
    return { ...quarterRange(shifted.year, shifted.q), role: HORIZONS[index].role, horizon: HORIZONS[index].key };
  });

  const events = EVENTS.map((event) => ({
    ...event,
    timing: eventTiming(event.date, deskDate),
  })).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh-CN"));

  const indices = INDICES.map((index) => {
    const series = loaded.get(index.secid);
    if (!series?.bars?.length) {
      return {
        id: index.id,
        name: index.name,
        code: index.code,
        group: index.group,
        error: series?.error || "没有行情",
      };
    }
    const closes = series.bars.map((bar) => bar.close);
    const last = closes.at(-1);
    const prev = closes.at(-2);
    const trend = trendRaw(closes);
    const momentum = momentumRaw(closes);
    const ctx = {
      index,
      closes,
      trend,
      momentum,
      range: rangePos(closes),
      rv20: realizedVol(closes, 20),
      rv60: realizedVol(closes, 60),
      ret20: pctChange(closes, 20),
      semi,
      rates: rates?.delta == null ? null : rates,
      dollar: dollar?.ret == null ? null : dollar,
    };
    const quarterCalls = {};
    for (let i = 0; i < quarters.length; i += 1) {
      quarterCalls[quarters[i].id] = buildQuarterCall(ctx, HORIZONS[i], quarters[i], events, deskDate);
      quarterCalls[quarters[i].id].quarterReturn = i === 0 ? quarterReturn(series.bars, quarters[i].start, quarters[i].end) : null;
    }
    return {
      id: index.id,
      name: index.name,
      code: index.code,
      group: index.group,
      sourceName: series.name,
      quoteSource: series.source || "东方财富",
      asOf: series.bars.at(-1).date,
      close: round(last, 2),
      changePct: prev ? round((last / prev - 1) * 100, 2) : null,
      spark: closes.slice(-90).map((value) => round(value, 2)),
      facts: {
        rsi: momentum.rsi == null ? null : round(momentum.rsi, 1),
        ret60: momentum.ret60 == null ? null : round(momentum.ret60 * 100, 1),
        ret20: ctx.ret20 == null ? null : round(ctx.ret20 * 100, 1),
        rangePct: ctx.range == null ? null : round(ctx.range.pos * 100),
        rv20: ctx.rv20 == null ? null : round(ctx.rv20 * 100),
        ma60Gap: trend.ma60 ? round((last / trend.ma60 - 1) * 100, 1) : null,
        bars: closes.length,
      },
      warnings: [
        semi || index.sensitivity.semi === 0 ? null : "缺少费城半导体行情，未计半导体联动",
        rates ? null : "缺少美债收益率，未计利率修正",
        dollar ? null : "缺少美元指数，未计美元修正",
        closes.length < 250 ? `日线只有${closes.length}根，更长均线没有纳入` : null,
      ].filter(Boolean),
      quarters: quarterCalls,
    };
  });

  return {
    model: "desk-1",
    generatedAt: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
    deskDate,
    quarters,
    macro: {
      us10y: rates
        ? { last: round(rates.last, 2), asOf: rates.asOf, change60bp: round(rates.delta * 100, 0) }
        : null,
      dxy: dollar
        ? { last: round(dollar.last, 2), asOf: dollar.asOf, change60pct: round(dollar.ret * 100, 1) }
        : null,
      sox: semi
        ? {
            last: round(semi.last, 2),
            asOf: semi.asOf,
            trend: semi.trend,
            label: semi.trend >= BULL_AT ? "偏多" : semi.trend <= -BULL_AT ? "偏空" : "中性",
          }
        : null,
    },
    events,
    indices,
    method: METHOD,
    sources: SOURCES,
    rules: { bullAt: BULL_AT, leanAt: LEAN_AT, soonDays: SOON_DAYS },
  };
}

async function main() {
  const snapshot = await buildSnapshot();
  const dir = path.join(root, "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`已更新 ${snapshot.generatedAt}，基准日 ${snapshot.deskDate}`);
  for (const index of snapshot.indices) {
    if (index.error) {
      console.log(`${index.name}  失败  ${index.error}`);
      continue;
    }
    const parts = snapshot.quarters.map((quarter) => {
      const call = index.quarters[quarter.id];
      return `${quarter.label}${call.label}${call.lean ? call.lean : ""}${call.score > 0 ? "+" : ""}${call.score}`;
    });
    console.log(`${index.name}  ${index.close}  ${index.asOf}  ${parts.join("  |  ")}`);
  }
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
