const state = {
  data: null,
  quarter: null,
  selected: "csi300",
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function signed(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  const number = Number(value);
  const text = number.toFixed(digits);
  return number > 0 ? `+${text}` : text;
}

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function formatPrice(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function spark(values, toneClass) {
  if (!values || values.length < 2) return "";
  const width = 280;
  const height = 42;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - 4) / (values.length - 1);
  const d = values
    .map((value, index) => {
      const x = 2 + index * step;
      const y = 2 + (1 - (value - min) / span) * (height - 4);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark ${toneClass}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}"/></svg>`;
}

function meter(score) {
  const magnitude = Math.max(-100, Math.min(100, score));
  const width = Math.abs(magnitude) / 2;
  const left = magnitude >= 0 ? 50 : 50 - width;
  const cls = magnitude > 0 ? "up" : magnitude < 0 ? "down" : "";
  return `<span class="meter ${cls}"><i style="left:${left}%;width:${width}%"></i></span>`;
}

function callText(call) {
  return call.lean ? `${call.label} · ${call.lean}` : call.label;
}

function renderStamp() {
  const data = state.data;
  $("stamp").textContent = `更新于 ${data.generatedAt} · 基准日 ${data.deskDate} · 红涨绿跌`;
}

function renderMacro() {
  const macro = state.data.macro;
  const items = [
    macro.sox
      ? `<div class="gauge"><span>半导体周期 · 费城半导体</span><strong class="${tone(macro.sox.trend)}">${escapeHtml(macro.sox.label)}</strong><em class="num">${formatPrice(macro.sox.last)} · 截至 ${macro.sox.asOf}</em></div>`
      : `<div class="gauge"><span>半导体周期</span><strong>—</strong><em>行情缺失</em></div>`,
    macro.us10y
      ? `<div class="gauge"><span>美债10年收益率</span><strong class="num">${macro.us10y.last.toFixed(2)}%</strong><em>60日 ${signed(macro.us10y.change60bp)} bp · ${macro.us10y.asOf}</em></div>`
      : `<div class="gauge"><span>美债10年收益率</span><strong>—</strong><em>行情缺失</em></div>`,
    macro.dxy
      ? `<div class="gauge"><span>美元指数</span><strong class="num">${macro.dxy.last.toFixed(2)}</strong><em>60日 ${signed(macro.dxy.change60pct, 1)}% · ${macro.dxy.asOf}</em></div>`
      : `<div class="gauge"><span>美元指数</span><strong>—</strong><em>行情缺失</em></div>`,
  ];
  $("macro").innerHTML = items.join("");
}

function renderSwitcher() {
  const data = state.data;
  $("switcher").innerHTML = data.quarters
    .map((quarter) => {
      const selected = quarter.id === state.quarter;
      const role = quarter.role === "current" ? "当下" : "情景";
      return `<button type="button" role="tab" data-quarter="${quarter.id}" aria-selected="${selected}">${escapeHtml(quarter.label)}<small>${role}</small></button>`;
    })
    .join("");
  const current = data.quarters.find((quarter) => quarter.id === state.quarter);
  const banner = $("banner");
  if (current?.role === "scenario") {
    banner.hidden = false;
    banner.textContent = "这一季是情景：趋势惯性会衰减，一年区间里过于极端的位置会向中间回归。这里没有目标点位。";
  } else {
    banner.hidden = true;
  }
}

function renderCounts() {
  const calls = state.data.indices
    .map((index) => index.quarters?.[state.quarter])
    .filter(Boolean);
  const tally = { bull: 0, bear: 0, range: 0 };
  for (const call of calls) tally[call.verdict] += 1;
  $("counts").innerHTML = `<span>看多 <b class="num">${tally.bull}</b></span><span>震荡 <b class="num">${tally.range}</b></span><span>看空 <b class="num">${tally.bear}</b></span>`;
}

function card(index) {
  if (index.error) {
    return `<button class="card bad" type="button" data-id="${index.id}" aria-pressed="${state.selected === index.id}"><div class="card-top"><h3>${escapeHtml(index.name)}</h3><span>${escapeHtml(index.code)}</span></div><p>${escapeHtml(index.error)}</p></button>`;
  }
  const call = index.quarters[state.quarter];
  const changeClass = tone(index.changePct || 0);
  return `<button class="card ${call.verdict}" type="button" data-id="${index.id}" aria-pressed="${state.selected === index.id}">
    <div class="card-top"><h3>${escapeHtml(index.name)}</h3><span class="num">${escapeHtml(index.code)}</span></div>
    <div class="price-line"><b class="price">${formatPrice(index.close)}</b><span class="chg ${changeClass}">${signed(index.changePct, 2)}%</span></div>
    ${spark(index.spark, changeClass)}
    <div class="card-mid"><b class="verdict ${call.verdict}">${escapeHtml(callText(call))}</b><span class="score ${tone(call.score)}">${signed(call.score)}</span></div>
    <p>把握 ${Math.round(call.confidence * 100)}% · 截至 ${index.asOf}</p>
  </button>`;
}

function renderBoard() {
  const groups = [];
  for (const index of state.data.indices) {
    const found = groups.find((group) => group.name === index.group);
    if (found) found.items.push(index);
    else groups.push({ name: index.group, items: [index] });
  }
  $("board").innerHTML = groups
    .map((group) => {
      const calls = group.items.map((index) => index.quarters?.[state.quarter]).filter(Boolean);
      const brief = `看多 ${calls.filter((call) => call.verdict === "bull").length} · 震荡 ${calls.filter((call) => call.verdict === "range").length} · 看空 ${calls.filter((call) => call.verdict === "bear").length}`;
      return `<section class="group"><div class="group-head"><h2>${escapeHtml(group.name)}</h2><span>${brief}</span></div><div class="cards">${group.items.map(card).join("")}</div></section>`;
    })
    .join("");
}

function renderDetail() {
  const index = state.data.indices.find((item) => item.id === state.selected) || state.data.indices[0];
  state.selected = index.id;
  if (index.error) {
    $("detail").innerHTML = `<p class="kicker">${escapeHtml(index.group)}</p><h2>${escapeHtml(index.name)}</h2><p>${escapeHtml(index.error)}</p>`;
    return;
  }
  const call = index.quarters[state.quarter];
  const facts = [
    ["RSI(14)", index.facts.rsi == null ? "—" : index.facts.rsi.toFixed(0)],
    ["近60日", signed(index.facts.ret60, 1) + "%"],
    ["距60日均线", signed(index.facts.ma60Gap, 1) + "%"],
    ["一年位置", index.facts.rangePct == null ? "—" : `${index.facts.rangePct}%`],
    ["20日波动", index.facts.rv20 == null ? "—" : `${index.facts.rv20}%`],
    ["本季至今", call.quarterReturn == null ? "—" : `${signed(call.quarterReturn * 100, 1)}%`],
  ];
  const factors = call.factors
    .map(
      (factor) => `<div class="factor"><span>${escapeHtml(factor.label)}</span>${meter(factor.score)}<span class="${tone(factor.score)}">${signed(factor.score)}</span></div><p class="note">${escapeHtml(factor.note)}</p>`,
    )
    .join("");
  const visibleHits = call.events.filter((event) => Math.round(event.confidenceHit * 100) >= 1);
  const hits = visibleHits.length
    ? `<h3>压低把握的事件</h3><ul class="hit-list">${visibleHits
        .map((event) => `<li>${escapeHtml(event.date)} ${escapeHtml(event.title)}，把握约 -${Math.round(event.confidenceHit * 100)} 个点</li>`)
        .join("")}</ul>`
    : `<p class="note">${call.eventPenalty > 0 ? `外溢事件合计把把握下调 ${Math.round(call.eventPenalty * 100)} 个点。` : "这一季没有临近到需要压低把握的事件。"}</p>`;
  const warnings = index.warnings.map((warning) => `<p class="warn">${escapeHtml(warning)}</p>`).join("");
  $("detail").innerHTML = `
    <p class="kicker">${escapeHtml(index.group)} · ${escapeHtml(index.code)} · 收盘 ${escapeHtml(index.asOf)} · ${escapeHtml(index.quoteSource || "东方财富")}</p>
    <h2>${escapeHtml(index.name)}</h2>
    <div class="price-line"><b class="price">${formatPrice(index.close)}</b><span class="chg ${tone(index.changePct || 0)}">${signed(index.changePct, 2)}%</span></div>
    <div class="facts">${facts.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join("")}</div>
    <div class="card-mid"><b class="verdict ${call.verdict}">${escapeHtml(callText(call))}</b><span class="score ${tone(call.score)}">${signed(call.score)}</span></div>
    <p class="summary">${escapeHtml(call.summary)} 把握 ${Math.round(call.confidence * 100)}%，其中事件下调 ${Math.round(call.eventPenalty * 100)} 个点。</p>
    ${factors}
    ${hits}
    ${warnings}
  `;
}

function timingTag(event) {
  if (event.timing === "past") return `<span class="tag past">已过</span>`;
  if (event.timing === "soon") return `<span class="tag soon">三周内</span>`;
  return `<span class="tag">本季稍后</span>`;
}

function renderCalendar() {
  const quarter = state.data.quarters.find((item) => item.id === state.quarter);
  const events = state.data.events.filter((event) => event.date >= quarter.start && event.date <= quarter.end);
  $("calendar").innerHTML = events.length
    ? events
        .map(
          (event) => `<article class="event"><div><b class="num">${escapeHtml(event.date)}</b><div>${timingTag(event)}<span class="tag">${escapeHtml(event.scope === "US" ? "美国" : event.scope === "JP" ? "日本" : event.scope === "KR" ? "韩国" : "中国")}</span></div></div><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.note)}</p></div><span class="tag">${event.impact === "high" ? "高影响" : event.impact === "medium" ? "中影响" : "低影响"}</span></article>`,
        )
        .join("")
    : `<p>这一季没有写入日历的事件。</p>`;
}

function renderMethod() {
  $("method").innerHTML = state.data.method.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  $("sources").innerHTML = state.data.sources
    .map((source) => `<span><b>${escapeHtml(source.name)}</b> ${escapeHtml(source.detail)}</span>`)
    .join("");
}

function render() {
  if (!state.quarter || !state.data.quarters.some((quarter) => quarter.id === state.quarter)) {
    state.quarter = state.data.quarters[0].id;
  }
  if (!state.data.indices.some((index) => index.id === state.selected)) {
    state.selected = state.data.indices[0]?.id;
  }
  renderStamp();
  renderMacro();
  renderSwitcher();
  renderCounts();
  renderBoard();
  renderDetail();
  renderCalendar();
  renderMethod();
}

async function loadSnapshot() {
  const response = await fetch("./data/snapshot.json", { cache: "no-store" });
  if (!response.ok) throw new Error("还没有行情文件");
  state.data = await response.json();
  render();
}

async function refresh() {
  const button = $("refresh");
  button.disabled = true;
  button.textContent = "正在更新";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error("更新失败");
    state.data = await response.json();
    render();
  } catch (error) {
    $("stamp").textContent = "页面里更新失败。请双击「刷新行情.bat」。";
  } finally {
    button.disabled = false;
    button.textContent = "更新行情";
  }
}

document.addEventListener("click", (event) => {
  const quarter = event.target.closest("[data-quarter]");
  if (quarter) {
    state.quarter = quarter.dataset.quarter;
    render();
    return;
  }
  const cardButton = event.target.closest("[data-id]");
  if (cardButton) {
    state.selected = cardButton.dataset.id;
    render();
  }
});

if (!["localhost", "127.0.0.1"].includes(location.hostname)) $("refresh").hidden = true;
$("refresh").addEventListener("click", refresh);

loadSnapshot().catch(() => {
  $("stamp").textContent = "还没有行情。请双击同目录的「刷新行情.bat」。";
});
