const PARTY_META = {
  "CDU/CSU": { color: "var(--cdu)", glow: "#aab1ba", label: "CDU/CSU" },
  "SPD": { color: "var(--spd)", glow: "#ff4c56", label: "SPD" },
  "GRÜNE": { color: "var(--gruene)", glow: "#55e878", label: "GRÜNE" },
  "FDP": { color: "var(--fdp)", glow: "#ffe66a", label: "FDP" },
  "LINKE": { color: "var(--linke)", glow: "#c96bff", label: "LINKE" },
  "AfD": { color: "var(--afd)", glow: "#58b5ff", label: "AfD" },
  "BSW": { color: "var(--bsw)", glow: "#e05282", label: "BSW" },
  "FW": { color: "var(--fw)", glow: "#ffb25e", label: "FW" },
  "Sonstige": { color: "var(--sonstige)", glow: "#d9e0e8", label: "Sonstige" }
};

const REGION_CODES = {
  "Bundestag": "BUND", "Baden-Württemberg": "BW", "Bayern": "BY", "Berlin": "BE",
  "Brandenburg": "BB", "Bremen": "HB", "Hamburg": "HH", "Hessen": "HE",
  "Mecklenburg-Vorpommern": "MV", "Niedersachsen": "NI", "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP", "Saarland": "SL", "Sachsen": "SN", "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH", "Thüringen": "TH"
};

const state = { data: null, regions: new Set(["Bundestag"]), parties: new Set(Object.keys(PARTY_META)), selectedPollRanks: new Set([0]), averageMode: false, mobileView: false, groupBy: "party", a4Mode: false, chartLayout: new Map(), perspective: null };
const els = {
  updated: document.querySelector("#updated"), regions: document.querySelector("#region-options"),
  parties: document.querySelector("#party-options"), polls: document.querySelector("#poll-options"), chart: document.querySelector("#chart"),
  scroll: document.querySelector("#chart-scroll"), title: document.querySelector("#chart-title"),
  meta: document.querySelector("#chart-meta"),
  description: document.querySelector("#chart-description"), empty: document.querySelector("#empty-state"),
  chartSection: document.querySelector(".chart-section"), mobileView: document.querySelector("#mobile-view"),
  tooltip: document.querySelector("#tooltip"), inputCode: document.querySelector("#input-code"),
  outputCode: document.querySelector("#output-code"), codeMessage: document.querySelector("#code-message"),
  exportMessage: document.querySelector("#export-message")
};

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function permutations(n, k) { let result = 1n; for (let i = 0; i < k; i += 1) result *= BigInt(n - i); return result; }
function orderedChoiceCount(n) { let total = 0n; for (let k = 1; k <= n; k += 1) total += permutations(n, k); return total; }
function rankOrdered(items, universe) {
  let rank = 0n;
  for (let k = 1; k < items.length; k += 1) rank += permutations(universe.length, k);
  const remaining = [...universe];
  items.forEach((item, index) => {
    const choice = remaining.indexOf(item);
    rank += BigInt(choice) * permutations(remaining.length - 1, items.length - index - 1);
    remaining.splice(choice, 1);
  });
  return rank;
}
function unrankOrdered(rank, universe) {
  let length = 1;
  while (length <= universe.length && rank >= permutations(universe.length, length)) rank -= permutations(universe.length, length++);
  if (length > universe.length) throw new Error("Ungültiger Code");
  const remaining = [...universe], result = [];
  for (let index = 0; index < length; index += 1) {
    const block = permutations(remaining.length - 1, length - index - 1);
    const choice = Number(rank / block);
    rank %= block;
    if (choice >= remaining.length) throw new Error("Ungültiger Code");
    result.push(remaining.splice(choice, 1)[0]);
  }
  return result;
}
function base62Encode(value) { let text = ""; do { text = CODE_ALPHABET[Number(value % 62n)] + text; value /= 62n; } while (value); return text.padStart(13, "0"); }
function base62Decode(text) { return [...text].reduce((value, char) => { const digit = CODE_ALPHABET.indexOf(char); if (digit < 0) throw new Error("Ungültiger Code"); return value * 62n + BigInt(digit); }, 0n); }
function configurationCode() {
  const partyUniverse = Object.keys(PARTY_META);
  const partyCount = orderedChoiceCount(partyUniverse.length);
  const pollMask = [...state.selectedPollRanks].reduce((mask, rank) => mask | (1 << rank), 0);
  let value = rankOrdered([...state.regions], state.data.regions);
  value = value * partyCount + rankOrdered([...state.parties], partyUniverse);
  value = value * 7n + BigInt(pollMask - 1);
  const mode = (state.averageMode ? 1n : 0n) + (state.mobileView ? 2n : 0n) + (state.groupBy === "region" ? 4n : 0n) + (state.a4Mode ? 8n : 0n);
  value += mode * orderedChoiceCount(state.data.regions.length) * partyCount * 7n;
  return base62Encode(value);
}

function makeChoice(container, group, value, checked, color, code, nextElection) {
  const wrap = document.createElement("div");
  wrap.className = `choice ${group === "party" ? "party-choice" : ""} ${group === "region" ? "region-choice" : ""}`;
  if (color) wrap.style.setProperty("--party-color", color);
  const id = `${group}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const label = code ? `<span class="region-name"><span class="region-title">${value}</span><strong class="region-code">${code}</strong></span><small class="next-election"><span aria-hidden="true">📅</span> ${nextElection || "noch offen"}</small>` : value;
  wrap.innerHTML = `<input id="${id}" type="checkbox" name="${group}" value="${value}" ${checked ? "checked" : ""}><label for="${id}">${label}</label>`;
  container.append(wrap);
  return wrap.querySelector("input");
}

function buildControls() {
  state.data.regions.forEach(region => {
    const input = makeChoice(els.regions, "region", region, state.regions.has(region), null, REGION_CODES[region], state.data.nextElections?.[region]);
    input.addEventListener("change", () => {
      if (input.checked) state.regions.add(region); else state.regions.delete(region);
      if (!state.regions.size) {
        state.regions.add(region);
        input.checked = true;
      }
      updatePollOptions(false);
      render();
    });
  });
  Object.entries(PARTY_META).forEach(([party, meta]) => {
    const input = makeChoice(els.parties, "party", party, true, meta.color);
    input.addEventListener("change", () => {
      input.checked ? state.parties.add(party) : state.parties.delete(party);
      render();
    });
  });
  document.querySelector("#party-toggle").addEventListener("click", event => {
    const select = state.parties.size !== Object.keys(PARTY_META).length;
    state.parties = new Set(select ? Object.keys(PARTY_META) : []);
    els.parties.querySelectorAll("input").forEach(input => input.checked = select);
    event.currentTarget.textContent = select ? "Alle abwählen" : "Alle auswählen";
    render();
  });
  document.querySelector("#region-toggle").addEventListener("click", event => {
    const inputs = [...els.regions.querySelectorAll("input")];
    const selectAll = state.regions.size !== state.data.regions.length;
    state.regions = new Set(selectAll ? state.data.regions : ["Bundestag"]);
    inputs.forEach(input => input.checked = state.regions.has(input.value));
    event.currentTarget.textContent = selectAll ? "Nur Bundestag" : "Alle auswählen";
    updatePollOptions(false);
    render();
  });
}

function updatePollOptions(reset = false) {
  if (reset || !state.selectedPollRanks.size) state.selectedPollRanks = new Set([0]);
  els.polls.replaceChildren();
  const singleRegion = state.regions.size === 1 ? [...state.regions][0] : null;
  const recent = singleRegion ? (state.data.polls[singleRegion] || []).slice(0, 3) : [];
  [0, 1, 2].forEach(index => {
    const poll = recent[index];
    const wrap = document.createElement("div");
    wrap.className = "choice poll-choice";
    wrap.style.setProperty("--poll-opacity", [1, .62, .34][index]);
    const id = `poll-${index}`;
    const detail = poll ? `${poll.institute} · ${formatDate(poll.date)}` : `für jedes ausgewählte Parlament`;
    wrap.innerHTML = `<input id="${id}" type="checkbox" value="${index}" ${state.selectedPollRanks.has(index) ? "checked" : ""}><label for="${id}"><span><strong>${index === 0 ? "Neueste" : `${index + 1}. jüngste`}</strong><small>${detail}</small></span></label>`;
    const input = wrap.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPollRanks.add(index); else state.selectedPollRanks.delete(index);
      if (!state.selectedPollRanks.size) {
        state.selectedPollRanks.add(index);
        input.checked = true;
      }
      render();
    });
    els.polls.append(wrap);
  });
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function updatePerspective() {
  const scene = state.perspective;
  if (!scene) return;
  const center = els.scroll.scrollLeft + els.scroll.clientWidth / 2;
  const visibleLeft = els.scroll.scrollLeft + 1;
  const visibleRight = els.scroll.scrollLeft + els.scroll.clientWidth - 12;
  scene.floorLines.forEach(({ line, axisX, ratio }) => {
    if (scene.staticFloor) axisX = visibleLeft + ratio * (visibleRight - visibleLeft);
    line.setAttribute("x1", center + (axisX - center) * scene.backScale);
    line.setAttribute("x2", center + (axisX - center) * scene.frontScale);
  });
  scene.floorRows.forEach(({ line, scale }) => {
    const left = scene.staticFloor ? visibleLeft : scene.floorLeft;
    const right = scene.staticFloor ? visibleRight : scene.floorRight;
    line.setAttribute("x1", center + (left - center) * scale);
    line.setAttribute("x2", center + (right - center) * scale);
  });
  scene.bars.forEach(({ top, side, x, y, width, baseline, maxDepth }) => {
    const barCenter = x + width / 2;
    const distance = Math.min(1, Math.abs(center - barCenter) / Math.max(1, els.scroll.clientWidth / 2));
    const dx = Math.sign(center - barCenter || 1) * maxDepth * (.35 + distance * .65);
    const dy = Math.min(6, Math.max(2.5, width * .11));
    top.setAttribute("points", `${x},${y} ${x + dx},${y - dy} ${x + width + dx},${y - dy} ${x + width},${y}`);
    const edgeX = dx >= 0 ? x + width : x;
    side.setAttribute("points", `${edgeX},${y} ${edgeX + dx},${y - dy} ${edgeX + dx},${baseline - dy} ${edgeX},${baseline}`);
  });
}

function formatPercent(value, signed = false, omitZeroDecimal = false) {
  const numeric = Math.abs(Number(value));
  const absolute = (omitZeroDecimal && Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)).replace(".", ",");
  if (!signed) return `${absolute} %`;
  if (Math.abs(value) < .05) return "±0,0";
  return `${value > 0 ? "+" : "−"}${absolute}`;
}

function partyDisplayLabel(party, region) {
  if (party !== "CDU/CSU") return party;
  if (region === "Bundestag") return "CDU/CSU";
  return region === "Bayern" ? "CSU" : "CDU";
}

function animateX(element, from, to, enabled) {
  if (!enabled || from == null || Math.abs(from - to) < .5 || !element.animate) return;
  element.animate(
    [{ transform: `translateX(${from - to}px)` }, { transform: "translateX(0)" }],
    { duration: 780, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "both" }
  );
}

function fadeIn(element, enabled, delay = 180) {
  if (!enabled || !element.animate) return;
  element.animate(
    [{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }],
    { duration: 460, delay, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" }
  );
}

function growBar(element, center, baseline, opacity, enabled, delay) {
  if (!enabled || !element.animate) return;
  element.style.transformBox = "view-box";
  element.style.transformOrigin = `${center}px ${baseline}px`;
  element.animate(
    [{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity }],
    { duration: 820, delay, easing: "cubic-bezier(.16, 1, .3, 1)", fill: "both" }
  );
}

function render(animate = true) {
  els.chartSection.classList.toggle("mobile-view", state.mobileView);
  const selectedRegions = [...state.regions];
  const rawSeries = selectedRegions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank, poll } : null;
  }).filter(Boolean));
  const series = state.averageMode ? selectedRegions.map(region => {
    const items = rawSeries.filter(item => item.region === region);
    if (!items.length) return null;
    const values = Object.fromEntries(Object.keys(PARTY_META).map(party => [party, items.reduce((sum, item) => sum + Number(item.poll.values[party] || 0), 0) / items.length]));
    return { region, rank: 0, average: true, poll: { institute: `Ø ${items.length} Umfragen`, date: items[0].poll.date, client: "", values, sourcePolls: items.map(item => item.poll) } };
  }).filter(Boolean) : rawSeries;
  const parties = [...state.parties];
  const motionEnabled = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const oldLayout = state.chartLayout;
  const nextLayout = new Map();
  const hasExistingBars = [...oldLayout.keys()].some(key => !key.startsWith("party:"));
  const newBarDelay = hasExistingBars ? 820 : 80;
  const newLabelDelay = hasExistingBars ? 1220 : 430;
  const oneRegion = selectedRegions.length === 1;
  els.title.textContent = oneRegion ? selectedRegions[0] : `${selectedRegions.length} Parlamente im Vergleich`;
  els.meta.textContent = state.averageMode ? `Durchschnitt aus ${rawSeries.length} Umfragen` : series.length === 1 ? `${series[0].poll.institute} · ${formatDate(series[0].poll.date)}` : `${series.length} Umfragen aus ${selectedRegions.length} Parlamenten`;
  els.description.textContent = state.averageMode ? `Nach Parteien gruppiertes Balkendiagramm mit Durchschnittswerten aus ${rawSeries.length} Umfragen.` : `Nach Parteien gruppiertes Balkendiagramm mit ${series.length} Umfragen aus ${selectedRegions.length} Parlamenten.`;
  els.chart.replaceChildren();
  els.empty.hidden = Boolean(series.length && parties.length);
  els.scroll.hidden = !series.length || !parties.length;
  if (!series.length || !parties.length) {
    state.chartLayout = new Map();
    return;
  }

  const compact = state.mobileView || window.innerWidth < 900;
  // On phones the scale sits on the actual edge while the bars retain a small
  // inset, so the first bar never collides with the tick labels.
  const axisX = compact ? 1 : 160;
  const margin = { top: 62, right: compact ? 12 : 34, bottom: 176, left: compact ? 48 : 160 };
  const totalBarCount = parties.length * series.length;
  const availableWidth = Math.max(320, els.scroll.clientWidth - 2);
  const visibleBarLimit = compact ? 9 : 20;
  const visiblePlotWidth = availableWidth - margin.left - margin.right;
  const width = totalBarCount <= visibleBarLimit
    ? availableWidth
    : Math.max(availableWidth, margin.left + margin.right + visiblePlotWidth * (totalBarCount / visibleBarLimit));
  const height = compact ? 520 : 590;
  const innerH = height - margin.top - margin.bottom;
  const baselineY = margin.top + innerH;
  const floorBackY = baselineY - (compact ? 18 : 44);
  const floorFrontY = Math.min(height - 2, baselineY + (compact ? 72 : 142));
  const chartW = width - margin.left - margin.right;
  const groupedBars = state.groupBy === "region"
    ? selectedRegions.map(region => ({ key: `region:${region}`, bars: parties.flatMap(party => series.filter(item => item.region === region).map(item => ({ party, item }))) })).filter(group => group.bars.length)
    : parties.map(party => ({ key: `party:${party}`, bars: series.map(item => ({ party, item })) }));
  const groupWidth = chartW / groupedBars.length;
  const maxValue = Math.max(50, ...series.flatMap(item => parties.map(party => item.poll.values[party] || 0)));
  const yMax = Math.ceil(maxValue / 10) * 10;
  els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.chart.setAttribute("width", width);
  els.chart.setAttribute("height", height);

  const defs = svgEl("defs");
  defs.innerHTML = `<linearGradient id="floor-line-fade" x1="0" y1="${floorBackY}" x2="0" y2="${floorFrontY}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#65b6ff" stop-opacity=".08"/>
      <stop offset=".22" stop-color="#65b6ff" stop-opacity=".34"/>
      <stop offset=".68" stop-color="#65b6ff" stop-opacity=".2"/>
      <stop offset="1" stop-color="#65b6ff" stop-opacity=".04"/>
    </linearGradient>
    <filter id="floor-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.25"/></filter>
    <filter id="star-soft" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="star-wide" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="4.8"/></filter>` + parties.map((party, index) => {
    const glow = PARTY_META[party].glow;
    const union = party === "CDU/CSU";
    return `<filter id="bar-glow-${index}" x="-100%" y="-45%" width="300%" height="210%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${union ? 6 : 9}" result="wide-blur"/>
      <feFlood flood-color="${glow}" flood-opacity="${union ? ".34" : ".62"}" result="wide-color"/>
      <feComposite in="wide-color" in2="wide-blur" operator="in" result="wide-glow"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="${union ? 2.5 : 3.5}" result="close-blur"/>
      <feFlood flood-color="${glow}" flood-opacity="${union ? ".72" : "1"}" result="close-color"/>
      <feComposite in="close-color" in2="close-blur" operator="in" result="close-glow"/>
      <feMerge><feMergeNode in="wide-glow"/><feMergeNode in="close-glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  }).join("");
  els.chart.append(defs);

  const stars = svgEl("g", { class: "depth-stars", "aria-hidden": "true" });
  const starPalette = ["#89cfff", "#d8efff", "#65b6ff"];
  const starCount = compact ? 24 : 42;
  for (let index = 0; index < starCount; index += 1) {
    const x = axisX + ((index * 83 + 29) % 997) / 997 * (width - margin.right - axisX);
    const y = 14 + ((index * 137 + 47) % 991) / 991 * Math.max(30, baselineY - 34);
    const depth = (index * 41 % 100) / 100;
    const radius = .45 + depth * 1.75;
    stars.append(svgEl("circle", {
      cx: x, cy: y, r: radius,
      fill: starPalette[index % starPalette.length],
      "fill-opacity": .08 + depth * .22,
      ...(depth > .76 ? { filter: "url(#star-wide)" } : depth > .38 ? { filter: "url(#star-soft)" } : {})
    }));
  }
  els.chart.append(stars);

  const floor = svgEl("g", { class: "perspective-floor", "aria-hidden": "true" });
  const floorLeft = axisX;
  const floorRight = width - margin.right;
  const floorCenter = (floorLeft + floorRight) / 2;
  const floorBackScale = compact ? .86 : .82;
  const floorFrontScale = compact ? 1.62 : 1.4;
  const perspectiveFloorLines = [];
  const perspectiveFloorRows = [];
  for (let index = 0; index <= 18; index += 1) {
    const axisPointX = floorLeft + ((floorRight - floorLeft) * index) / 18;
    const backgroundX = floorCenter + (axisPointX - floorCenter) * floorBackScale;
    const foregroundX = floorCenter + (axisPointX - floorCenter) * floorFrontScale;
    const line = svgEl("line", {
      x1: backgroundX, y1: floorBackY, x2: foregroundX, y2: floorFrontY,
      stroke: "url(#floor-line-fade)", "stroke-width": compact ? .8 : 1
    });
    floor.append(line);
    perspectiveFloorLines.push({ line, axisX: axisPointX, ratio: index / 18 });
  }
  const floorRows = [
    [floorBackY, floorBackScale],
    [baselineY - (compact ? 12 : 29), compact ? .91 : .88],
    [baselineY - (compact ? 6 : 14), compact ? .955 : .94],
    [baselineY, 1],
    [baselineY + (compact ? 36 : 50), compact ? 1.31 : 1.14],
    [floorFrontY, floorFrontScale]
  ];
  floorRows.forEach(([y, scale], index) => {
    const rowLeft = floorCenter + (floorLeft - floorCenter) * scale;
    const rowRight = floorCenter + (floorRight - floorCenter) * scale;
    const line = svgEl("line", {
      x1: rowLeft, y1: y, x2: rowRight, y2: y,
      stroke: "url(#floor-line-fade)", "stroke-width": compact ? .8 : 1,
      ...(index === 0 || index === floorRows.length - 1 ? { filter: "url(#floor-soft)" } : {})
    });
    floor.append(line);
    perspectiveFloorRows.push({ line, scale });
  });
  if (compact) {
    // On phones the floor is a single static background asset. Keeping these
    // arrays empty also removes all grid work from the horizontal scroll path.
    perspectiveFloorLines.length = 0;
    perspectiveFloorRows.length = 0;
  } else {
    els.chart.append(floor);
  }

  for (let tick = 0; tick <= yMax; tick += 10) {
    const y = margin.top + innerH - (tick / yMax) * innerH;
    els.chart.append(svgEl("line", { x1: axisX, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const label = svgEl("text", { x: compact ? axisX + 7 : axisX - 10, y: y + 4, "text-anchor": compact ? "start" : "end", class: "axis-label" });
    label.textContent = `${tick} %`;
    els.chart.append(label);
  }
  els.chart.append(svgEl("line", { x1: axisX, x2: axisX, y1: margin.top, y2: height - 18, class: "axis-line" }));

  const maxBarsPerGroup = Math.max(...groupedBars.map(group => group.bars.length));
  const availablePerBar = (groupWidth - Math.min(30, groupWidth * .12)) / maxBarsPerGroup;
  const barGap = maxBarsPerGroup === 1 ? 0 : Math.max(5, Math.min(20, 23 - totalBarCount * 1.35));
  const maxBarWidth = totalBarCount === 1 ? 280 : totalBarCount <= 3 ? 150 : totalBarCount <= 6 ? 92 : totalBarCount <= 10 ? 58 : totalBarCount <= 20 ? 38 : availablePerBar - barGap;
  const barWidth = Math.max(totalBarCount <= 10 ? 10 : 4, Math.min(maxBarWidth, availablePerBar - barGap));
  const displayedBars = [];
  const perspectiveBars = [];
  groupedBars.forEach((group, groupIndex) => {
    const center = margin.left + groupIndex * groupWidth + groupWidth / 2;
    const totalBars = group.bars.length * barWidth + (group.bars.length - 1) * barGap;
    const startX = center - totalBars / 2;
    group.bars.forEach(({ party, item }, barIndex) => {
      const partyIndex = parties.indexOf(party);
      const key = `${party}|${item.region}|${item.average ? "average" : item.rank}`;
      const old = oldLayout.get(key);
      const value = Number(item.poll.values[party] || 0);
      const election = state.data.elections?.[item.region];
      const baseline = Number(election?.values?.[party] || 0);
      const delta = value - baseline;
      const isNew = !election?.represented?.includes(party) && value >= 5 && party !== "Sonstige";
      const h = (value / yMax) * innerH;
      const x = startX + barIndex * (barWidth + barGap);
      const y = margin.top + innerH - h;
      const fillOpacity = item.average ? .68 : [.68, .34, .16][item.rank];
      const strokeOpacity = item.average ? 1 : [1, .78, .56][item.rank];
      const glowOutline = svgEl("rect", {
        x, y, width: barWidth, height: h,
        fill: "none",
        stroke: PARTY_META[party].glow,
        "stroke-opacity": strokeOpacity,
        filter: `url(#bar-glow-${partyIndex})`,
        class: "bar-glow", rx: 3
      });
      const depthX = Math.min(8, Math.max(4, barWidth * .16));
      const depthY = Math.min(6, Math.max(2.5, barWidth * .11));
      const faces = compact || h <= 0 ? [] : [
        svgEl("polygon", {
          points: `${x + barWidth},${y} ${x + barWidth + depthX},${y - depthY} ${x + barWidth + depthX},${margin.top + innerH - depthY} ${x + barWidth},${margin.top + innerH}`,
          fill: PARTY_META[party].color, stroke: PARTY_META[party].glow,
          "fill-opacity": fillOpacity * .42, "stroke-opacity": strokeOpacity * .72,
          "stroke-width": 1.1, class: "bar-side"
        }),
        svgEl("polygon", {
          points: `${x},${y} ${x + depthX},${y - depthY} ${x + barWidth + depthX},${y - depthY} ${x + barWidth},${y}`,
          fill: PARTY_META[party].glow, stroke: PARTY_META[party].glow,
          "fill-opacity": fillOpacity * .62, "stroke-opacity": strokeOpacity * .86,
          "stroke-width": 1.1, class: "bar-top"
        })
      ];
      if (faces.length) perspectiveBars.push({ top: faces[1], side: faces[0], x, y, width: barWidth, baseline: margin.top + innerH, maxDepth: depthX });
      const bar = svgEl("rect", {
        x, y, width: barWidth, height: h,
        fill: PARTY_META[party].color,
        stroke: PARTY_META[party].glow,
        "fill-opacity": fillOpacity,
        "stroke-opacity": strokeOpacity,
        class: "bar", rx: 3
      });
      bar.addEventListener("pointermove", event => showTooltip(event, item.region, item.poll, partyDisplayLabel(party, item.region), value));
      bar.addEventListener("pointerleave", hideTooltip);
      els.chart.append(glowOutline, ...faces, bar);
      if (old) {
        animateX(glowOutline, old.x, x, motionEnabled);
        faces.forEach(face => animateX(face, old.x, x, motionEnabled));
        animateX(bar, old.x, x, motionEnabled);
      } else {
        growBar(glowOutline, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay);
        faces.forEach(face => growBar(face, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay));
        growBar(bar, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay);
      }
      const valueLabel = svgEl("text", { x: x + barWidth / 2, y: Math.max(margin.top - 9, y - 10), "text-anchor": "middle", class: "bar-value" });
      valueLabel.textContent = `${item.average ? "Ø " : ""}${formatPercent(value, false, compact).replace(" %", "")}`;
      els.chart.append(valueLabel);
      old ? animateX(valueLabel, old.center, x + barWidth / 2, motionEnabled) : fadeIn(valueLabel, motionEnabled, newLabelDelay);
      const deltaLabel = svgEl("text", { x: x + barWidth / 2, y: margin.top + innerH + 20, "text-anchor": "middle", class: `bar-delta ${delta >= 0 ? "positive" : "negative"}` });
      const deltaLine = svgEl("tspan", { x: x + barWidth / 2 });
      deltaLine.textContent = formatPercent(delta, true);
      deltaLabel.append(deltaLine);
      if (isNew) {
        const newLine = svgEl("tspan", { x: x + barWidth / 2, dy: 13, class: "new-label" });
        newLine.textContent = "NEW";
        deltaLabel.append(newLine);
      }
      els.chart.append(deltaLabel);
      old ? animateX(deltaLabel, old.center, x + barWidth / 2, motionEnabled) : fadeIn(deltaLabel, motionEnabled, newLabelDelay);
      displayedBars.push({ region: item.region, party, center: x + barWidth / 2 });
      nextLayout.set(key, { x, center: x + barWidth / 2 });
    });
    nextLayout.set(group.key, { center });
  });

  const appendGroupedLabels = (labelFor, y, className) => {
    let start = 0;
    while (start < displayedBars.length) {
      const text = labelFor(displayedBars[start]);
      let end = start + 1;
      while (end < displayedBars.length && labelFor(displayedBars[end]) === text) end += 1;
      const count = end - start;
      const x = (displayedBars[start].center + displayedBars[end - 1].center) / 2;
      const stackedUnion = !compact && text === "CDU/CSU" && count === 1 && parties.length > 1;
      const rotate = compact && count === 1 && !stackedUnion;
      const label = svgEl("text", {
        x, y: stackedUnion ? y - 5 : y, "text-anchor": "middle",
        class: `${className}${compact ? ` mobile-${className}` : ""}`,
        ...(rotate ? { transform: `rotate(-90 ${x} ${y})` } : {})
      });
      if (stackedUnion) {
        const firstLine = svgEl("tspan", { x }); firstLine.textContent = "CDU/";
        const secondLine = svgEl("tspan", { x, dy: 11 }); secondLine.textContent = "CSU";
        label.append(firstLine, secondLine);
      } else label.textContent = text;
      const labelGroup = svgEl("g");
      labelGroup.append(label);
      els.chart.append(labelGroup);
      fadeIn(labelGroup, motionEnabled, newLabelDelay);
      start = end;
    }
  };
  appendGroupedLabels(bar => REGION_CODES[bar.region] || bar.region, margin.top + innerH + 51, "region-label");
  appendGroupedLabels(bar => bar.party === "CDU/CSU" && selectedRegions.length > 1 ? "CDU/CSU" : partyDisplayLabel(bar.party, bar.region), height - margin.bottom + (compact ? 96 : 82), "party-label");
  const legendX = compact ? margin.left / 2 : margin.left - 10;
  [
    ["Veränderung", margin.top + innerH + 20],
    ["Parlament", margin.top + innerH + 51],
    ["Partei", height - margin.bottom + (compact ? 96 : 82)]
  ].forEach(([text, y]) => {
    const legend = svgEl("text", { x: legendX, y, "text-anchor": compact ? "middle" : "end", class: "chart-legend" });
    legend.textContent = text;
    els.chart.append(legend);
  });
  const unitLabel = svgEl("text", { x: (axisX + width - margin.right) / 2, y: height - 6, "text-anchor": "middle", class: "chart-unit-label" });
  unitLabel.textContent = "Werte in %";
  els.chart.append(unitLabel);
  state.chartLayout = nextLayout;
  state.perspective = {
    floorLines: perspectiveFloorLines, floorRows: perspectiveFloorRows, bars: perspectiveBars,
    floorLeft, floorRight, backScale: floorBackScale, frontScale: floorFrontScale, staticFloor: compact
  };
  updatePerspective();
  els.outputCode.textContent = configurationCode();
}

function showTooltip(event, region, poll, party, value) {
  const pollDetail = poll.sourcePolls
    ? `Durchschnitt aus ${poll.sourcePolls.length} Umfragen<br>${poll.sourcePolls.map(item => `${item.institute} · ${formatDate(item.date)}`).join("<br>")}`
    : `${poll.institute} · ${formatDate(poll.date)}${poll.client ? `<br>${poll.client}` : ""}`;
  els.tooltip.innerHTML = `<strong>${region}</strong><br>${party}: ${String(Math.round(value * 10) / 10).replace(".", ",")} %<br>${pollDetail}`;
  els.tooltip.hidden = false;
  const left = Math.min(window.innerWidth - 280, event.clientX + 14);
  els.tooltip.style.left = `${Math.max(8, left)}px`;
  els.tooltip.style.top = `${Math.max(8, event.clientY - 70)}px`;
}
function hideTooltip() { els.tooltip.hidden = true; }
function formatDate(value) { return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`)); }

function applyConfigurationCode(text) {
  if (!/^[0-9A-Za-z]{13}$/.test(text)) throw new Error("Bitte einen gültigen 13-stelligen Code eingeben.");
  const partyUniverse = Object.keys(PARTY_META);
  const partyCount = orderedChoiceCount(partyUniverse.length);
  const regionCount = orderedChoiceCount(state.data.regions.length);
  let value = base62Decode(text);
  const legacySpace = regionCount * partyCount * 7n;
  const mode = Number(value / legacySpace);
  if (mode > 15) throw new Error("Dieser Code gehört nicht zu einer gültigen Konfiguration.");
  state.averageMode = Boolean(mode & 1);
  state.mobileView = Boolean(mode & 2);
  state.groupBy = mode & 4 ? "region" : "party";
  state.a4Mode = Boolean(mode & 8);
  value %= legacySpace;
  const pollMask = Number(value % 7n) + 1;
  value /= 7n;
  const partyRank = value % partyCount;
  const regionRank = value / partyCount;
  if (regionRank >= regionCount) throw new Error("Dieser Code gehört nicht zu einer gültigen Konfiguration.");
  state.regions = new Set(unrankOrdered(regionRank, state.data.regions));
  state.parties = new Set(unrankOrdered(partyRank, partyUniverse));
  state.selectedPollRanks = new Set([0, 1, 2].filter(rank => pollMask & (1 << rank)));
  document.querySelector("#average-mode").checked = state.averageMode;
  els.mobileView.checked = state.mobileView;
  document.querySelector(`#cluster-${state.groupBy}`).checked = true;
  document.querySelector("#a4-mode").checked = state.a4Mode;
  els.regions.querySelectorAll("input").forEach(input => input.checked = state.regions.has(input.value));
  els.parties.querySelectorAll("input").forEach(input => input.checked = state.parties.has(input.value));
  updatePollOptions(false);
  render(false);
}

async function exportChartImage(format = "jpeg") {
  const isPng = format === "png";
  const formatLabel = isPng ? "PNG" : "JPEG";
  els.exportMessage.textContent = `${formatLabel} wird erstellt …`;
  const clone = els.chart.cloneNode(true);
  const originalTexts = [...els.chart.querySelectorAll("text")];
  const clonedTexts = [...clone.querySelectorAll("text")];
  clonedTexts.forEach((text, index) => {
    const computed = getComputedStyle(originalTexts[index]);
    text.style.fontFamily = computed.fontFamily;
    text.style.fontSize = computed.fontSize;
    text.style.fontWeight = computed.fontWeight;
    text.style.fontStyle = computed.fontStyle;
    text.style.letterSpacing = computed.letterSpacing;
  });
  const viewBox = els.chart.viewBox.baseVal;
  const selectedRegions = [...state.regions];
  const selectedParties = [...state.parties];
  const selectedPolls = selectedRegions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? `${REGION_CODES[region]} · ${rank === 0 ? "Neueste" : `${rank + 1}. jüngste`} · ${poll.institute} · ${formatDate(poll.date)}${poll.client ? ` · ${poll.client}` : ""}` : null;
  }).filter(Boolean));
  const partyColumns = selectedParties.length > 5 ? 2 : 1;
  const regionColumns = selectedRegions.length > 8 ? 2 : 1;
  const pollColumns = selectedPolls.length > 10 ? 2 : 1;
  const legendRows = Math.max(
    Math.ceil(selectedParties.length / partyColumns),
    Math.ceil(selectedRegions.length / regionColumns),
    Math.ceil(selectedPolls.length / pollColumns)
  );
  const exportBarCount = selectedParties.length * (state.averageMode ? selectedRegions.length : selectedPolls.length);
  const headerScale = Math.min(2.2, Math.max(1, exportBarCount / 22));
  const headerOffsetY = 50;
  const headerHeight = Math.max(150, 100 + legendRows * 10) * headerScale;
  const footerHeight = 66;
  const documentWidth = Math.max(1600, viewBox.width);
  const documentHeight = headerHeight + viewBox.height + footerHeight;
  const exportHeight = 2160;
  const exportWidth = Math.min(16000, Math.max(1728, Math.round(exportHeight * documentWidth / documentHeight)));
  const documentSvg = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${documentWidth} ${documentHeight}`,
    width: exportWidth, height: exportHeight
  });
  const css = [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; } }).join("\n");
  const style = svgEl("style");
  style.textContent = `svg, text { font-family: ${getComputedStyle(document.body).fontFamily}; }\n${css}`;
  documentSvg.append(style, svgEl("rect", { x: 0, y: 0, width: documentWidth, height: documentHeight, fill: "#081326" }));

  const addText = (text, attrs = {}) => {
    const node = svgEl("text", { fill: "#f4f8ff", ...attrs });
    node.textContent = text;
    documentSvg.append(node);
    return node;
  };
  const headerGroup = svgEl("g", { transform: `scale(${headerScale})` });
  documentSvg.append(headerGroup);
  const addHeaderText = (text, attrs = {}) => {
    const node = svgEl("text", { fill: "#f4f8ff", ...attrs });
    node.textContent = text;
    headerGroup.append(node);
    return node;
  };
  const now = new Date();
  const minuteStamp = new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(now);
  const secondStamp = new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short"
  }).format(now);
  const headerX = 18;
  const headerMetaX = 565;
  addHeaderText("Sonntagsfragen", { x: headerX, y: 66 + headerOffsetY, style: "font-family: Georgia, serif", "font-size": 64, "font-weight": 500, "letter-spacing": "-.06em" });
  const creator = addHeaderText("", { x: headerX + 108, y: 84 + headerOffsetY, "text-anchor": "middle", fill: "#7f95b2", "font-size": 6.5, "font-weight": 400, "letter-spacing": ".04em", style: 'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  const creatorPrefix = svgEl("tspan");
  creatorPrefix.textContent = "visualizer by ";
  const creatorName = svgEl("tspan", { fill: "#b9dff1", "font-weight": 800 });
  creatorName.textContent = "charavision";
  creator.append(creatorPrefix, creatorName);
  addHeaderText(minuteStamp, { x: headerMetaX, y: 54 + headerOffsetY, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 8 });
  addHeaderText(configurationCode(), { x: headerMetaX, y: 70 + headerOffsetY, "text-anchor": "middle", fill: "#b9cee5", "font-size": 7, style: "font-family: ui-monospace, SFMono-Regular, Menlo, monospace", "letter-spacing": ".05em" });
  addHeaderText(state.mobileView || window.innerWidth < 900 ? "(mobil)" : "(desktop)", { x: headerMetaX, y: 84 + headerOffsetY, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 7, "font-weight": 400 });

  clone.setAttribute("x", (documentWidth - viewBox.width) / 2);
  clone.setAttribute("y", headerHeight);
  clone.setAttribute("width", viewBox.width);
  clone.setAttribute("height", viewBox.height);
  documentSvg.append(clone);

  const addLegendSection = (x, width, title, items, columns = 1, swatches = false) => {
    addHeaderText(title, { x, y: 27 + headerOffsetY, fill: "#59d9ff", "font-size": 11, "font-weight": 800, "letter-spacing": ".08em" });
    const rows = Math.ceil(items.length / columns);
    const columnWidth = width / columns;
    items.forEach((item, index) => {
      const column = Math.floor(index / rows);
      const row = index % rows;
      const itemX = x + column * columnWidth;
      const y = 43 + headerOffsetY + row * 10;
      if (swatches) headerGroup.append(svgEl("rect", { x: itemX, y: y - 6, width: 3, height: 7, fill: PARTY_META[item].color }));
      addHeaderText(item, { x: itemX + (swatches ? 7 : 0), y, fill: "#dce8f7", "font-size": 7 });
    });
  };
  addLegendSection(700, 145, "PARTEIEN", selectedParties, partyColumns, true);
  addLegendSection(865, 235, "PARLAMENTE", selectedRegions.map(region => `${region} (${REGION_CODES[region]})`), regionColumns);
  addLegendSection(1120, 460, "UMFRAGEDATEN", selectedPolls, pollColumns);

  const footerCenter = documentWidth / 2;
  const footerY = headerHeight + viewBox.height + 8;
  addText(secondStamp, { x: footerCenter, y: footerY, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 9 });
  addText("Quelle der Daten: Wahlrecht.de", { x: footerCenter, y: footerY + 15, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 8 });
  addText("© charavision", { x: footerCenter, y: footerY + 30, "text-anchor": "middle", fill: "#dce8f7", "font-size": 8, "font-weight": 700 });

  const rootStyle = getComputedStyle(document.documentElement);
  let source = new XMLSerializer().serializeToString(documentSvg).replace(/var\((--[\w-]+)\)/g, (_, name) => rootStyle.getPropertyValue(name).trim());
  const blobUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#081326";
    context.fillRect(0, 0, exportWidth, exportHeight);
    context.drawImage(image, 0, 0, exportWidth, exportHeight);
    const imageBlob = await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Die Bildgröße konnte nicht verarbeitet werden.")),
      isPng ? "image/png" : "image/jpeg", isPng ? undefined : .94
    ));
    const downloadUrl = URL.createObjectURL(imageBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `sonntagsfragen-${configurationCode()}.${isPng ? "png" : "jpg"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    els.exportMessage.textContent = `${exportWidth} × ${exportHeight} Pixel`;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function a4ExportClusters() {
  const regions = [...state.regions];
  const parties = [...state.parties];
  const raw = regions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank, poll } : null;
  }).filter(Boolean));
  const series = state.averageMode ? regions.map(region => {
    const items = raw.filter(item => item.region === region);
    if (!items.length) return null;
    const values = Object.fromEntries(Object.keys(PARTY_META).map(party => [party, items.reduce((sum, item) => sum + Number(item.poll.values[party] || 0), 0) / items.length]));
    return { region, rank: 0, average: true, poll: { values } };
  }).filter(Boolean) : raw;
  if (state.groupBy === "region") return regions.map(region => ({
    title: `${region} (${REGION_CODES[region]})`,
    bars: parties.flatMap(party => series.filter(item => item.region === region).map(item => ({ party, item })))
  })).filter(cluster => cluster.bars.length);
  return parties.map(party => ({
    title: party === "CDU/CSU" && regions.length === 1 ? partyDisplayLabel(party, regions[0]) : party,
    bars: series.map(item => ({ party, item }))
  }));
}

function a4LayoutFor(clusters) {
  const largestCluster = Math.max(0, ...clusters.map(cluster => cluster.bars.length));
  if (largestCluster > 34) return { width: 1754, height: 1240, columns: 1, rows: 2, capacity: 2, landscape: true };
  if (largestCluster > 17) return { width: 1240, height: 1754, columns: 1, rows: 4, capacity: 4, landscape: false };
  return { width: 1240, height: 1754, columns: 3, rows: 4, capacity: 12, landscape: false };
}

function buildA4Page(clusters, pageNumber, pageCount, layout) {
  const { width, height, columns, rows } = layout;
  const page = svgEl("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${width} ${height}`, width, height });
  const defs = svgEl("defs");
  const pageBase = svgEl("linearGradient", { id: "page-base", x1: "0", y1: "0", x2: "1", y2: "1" });
  pageBase.append(svgEl("stop", { offset: "0", "stop-color": "#172744" }), svgEl("stop", { offset: ".7", "stop-color": "#081326" }), svgEl("stop", { offset: "1", "stop-color": "#050d1b" }));
  const pageGlow = svgEl("radialGradient", { id: "page-glow", cx: "50%", cy: "28%", r: "68%" });
  pageGlow.append(svgEl("stop", { offset: "0", "stop-color": "#2a67a4", "stop-opacity": ".28" }), svgEl("stop", { offset: ".58", "stop-color": "#17385e", "stop-opacity": ".12" }), svgEl("stop", { offset: "1", "stop-color": "#081326", "stop-opacity": "0" }));
  defs.append(pageBase, pageGlow);
  page.append(defs);
  page.append(svgEl("rect", { width, height, fill: "url(#page-base)" }));
  page.append(svgEl("rect", { width, height, fill: "url(#page-glow)" }));
  const text = (value, attrs = {}) => { const node = svgEl("text", { fill: "#f4f8ff", style: 'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', ...attrs }); node.textContent = value; page.append(node); return node; };
  const now = new Date();
  const landscapeHeader = width > 1400;
  const brandSize = landscapeHeader ? 104 : 72;
  const brandY = landscapeHeader ? 116 : 92;
  const legendStart = landscapeHeader ? 880 : 520;
  text("Sonntagsfragen", { x: 42, y: brandY, style: "font-family: Georgia, serif", "font-size": brandSize, "font-weight": 500, "letter-spacing": "-.06em" });
  const creator = text("", { x: 42 + brandSize * 1.55, y: brandY + brandSize * .2, "text-anchor": "middle", fill: "#7f95b2", "font-size": brandSize * .096, "font-weight": 400, "letter-spacing": ".04em" });
  const creatorPrefix = svgEl("tspan"); creatorPrefix.textContent = "visualizer by ";
  const creatorName = svgEl("tspan", { fill: "#b9dff1", "font-weight": 800 }); creatorName.textContent = "charavision";
  creator.append(creatorPrefix, creatorName);
  const minuteStamp = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now);
  const introY = brandY + brandSize * .48;
  const metaY = introY + 27;
  text("Die aktuellen Sonntagsfragen von Bund & Ländern im Vergleich.", { x: 42, y: introY, fill: "#8fa6c1", "font-size": landscapeHeader ? 20 : 15, "font-weight": 400 });
  text(minuteStamp, { x: 42, y: metaY, fill: "#8fa6c1", "font-size": 9 });
  text(configurationCode(), { x: 208, y: metaY, fill: "#b9cee5", "font-size": 9, style: "font-family: ui-monospace, SFMono-Regular, Menlo, monospace", "letter-spacing": ".05em" });
  text(state.mobileView || window.innerWidth < 900 ? "(mobil)" : "(desktop)", { x: 315, y: metaY, fill: "#8fa6c1", "font-size": 8.5 });
  text(`Gruppiert nach ${state.groupBy === "party" ? "Partei" : "Parlament"}${state.averageMode ? " · Durchschnitt" : ""}`, { x: 42, y: metaY + 27, fill: "#59d9ff", "font-size": 11, "font-weight": 700 });
  const selectedRegions = [...state.regions], selectedParties = [...state.parties];
  const selectedPolls = selectedRegions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? `${REGION_CODES[region]} · ${rank + 1}. · ${poll.institute} · ${formatDate(poll.date)}` : null;
  }).filter(Boolean));
  const headerLegend = (x, title, items, columns, columnWidth, colorItems = false) => {
    text(title, { x, y: 54, fill: "#59d9ff", "font-size": 11, "font-weight": 800, "letter-spacing": ".06em" });
    const rows = Math.ceil(items.length / columns);
    items.forEach((item, index) => {
      const column = Math.floor(index / rows), row = index % rows, itemX = x + column * columnWidth, itemY = 70 + row * 9;
      if (colorItems) page.append(svgEl("rect", { x: itemX, y: itemY - 6, width: 4, height: 7, fill: getComputedStyle(document.documentElement).getPropertyValue(PARTY_META[item].color.match(/--[\w-]+/)?.[0] || "").trim() || PARTY_META[item].glow }));
      text(item, { x: itemX + (colorItems ? 8 : 0), y: itemY, fill: "#dce8f7", "font-size": colorItems ? 7.5 : 7 });
    });
  };
  const partyX = legendStart;
  const regionX = partyX + 105;
  const pollsX = regionX + (landscapeHeader ? 190 : 185);
  const pollWidth = Math.max(105, (width - pollsX - 42) / (selectedPolls.length > 20 ? 3 : 2));
  headerLegend(partyX, "PARTEIEN", selectedParties, 1, 0, true);
  headerLegend(regionX, "PARLAMENTE", selectedRegions.map(region => `${region} (${REGION_CODES[region]})`), 1, 0);
  headerLegend(pollsX, "UMFRAGEDATEN", selectedPolls, selectedPolls.length > 20 ? 3 : 2, pollWidth);
  text("TRANSPARENZ", { x: partyX, y: 232, fill: "#59d9ff", "font-size": 9, "font-weight": 800, "letter-spacing": ".06em" });
  [
    { label: "Neueste", fill: .68, stroke: 1 },
    { label: "2. jüngste", fill: .34, stroke: .7 },
    { label: "3. jüngste", fill: .14, stroke: .4 }
  ].forEach((entry, index) => {
    const itemX = partyX + index * 82;
    page.append(svgEl("rect", { x: itemX, y: 241, width: 18, height: 9, rx: 1, fill: "#dce8f7", "fill-opacity": entry.fill, stroke: "#dce8f7", "stroke-opacity": entry.stroke, "stroke-width": 1 }));
    text(entry.label, { x: itemX + 24, y: 249, fill: "#dce8f7", "font-size": 7.5 });
  });
  const gapX = 18, gapY = 18, left = 42, top = 280;
  const tileWidth = (width - left * 2 - gapX * (columns - 1)) / columns;
  const tileHeight = (height - top - 100 - gapY * (rows - 1)) / rows;
  const allValues = clusters.flatMap(cluster => cluster.bars.map(({ party, item }) => Number(item.poll.values[party] || 0)));
  const yMax = Math.max(50, Math.ceil(Math.max(0, ...allValues) / 10) * 10);
  const rootStyle = getComputedStyle(document.documentElement);
  clusters.forEach((cluster, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const x = left + column * (tileWidth + gapX), y = top + row * (tileHeight + gapY);
    text(cluster.title, { x: x + 16, y: y + 27, fill: "#dce8f7", "font-size": 15, "font-weight": 800 });
    const plot = { left: x + 34, right: x + tileWidth - 12, top: y + 48, bottom: y + tileHeight - (cluster.bars.length > 34 ? 96 : 72) };
    page.append(svgEl("line", { x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, stroke: "#9bb4d0", "stroke-opacity": .58, "stroke-width": 1.2 }));
    page.append(svgEl("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: "#9bb4d0", "stroke-opacity": .58, "stroke-width": 1.2 }));
    [0, .5, 1].forEach(fraction => {
      const lineY = plot.bottom - fraction * (plot.bottom - plot.top);
      page.append(svgEl("line", { x1: plot.left, x2: plot.right, y1: lineY, y2: lineY, stroke: "#9bb4d0", "stroke-opacity": .2 }));
      text(`${Math.round(yMax * fraction)}`, { x: plot.left - 6, y: lineY + 4, "text-anchor": "end", fill: "#8fa6c1", "font-size": 8 });
    });
    const slot = (plot.right - plot.left) / Math.max(1, cluster.bars.length);
    const barWidth = Math.max(2, Math.min(34, slot * .68));
    cluster.bars.forEach(({ party, item }, barIndex) => {
      const value = Number(item.poll.values[party] || 0);
      const barHeight = value / yMax * (plot.bottom - plot.top);
      const barX = plot.left + slot * barIndex + (slot - barWidth) / 2;
      const barY = plot.bottom - barHeight;
      const color = rootStyle.getPropertyValue(PARTY_META[party].color.match(/--[\w-]+/)?.[0] || "").trim() || PARTY_META[party].glow;
      const fillOpacity = item.average ? .72 : [.68, .34, .14][item.rank] ?? .14;
      const strokeOpacity = item.average ? 1 : [1, .7, .4][item.rank] ?? .4;
      page.append(svgEl("rect", { x: barX, y: barY, width: barWidth, height: barHeight, rx: 2, fill: color, "fill-opacity": fillOpacity, stroke: PARTY_META[party].glow, "stroke-opacity": strokeOpacity, "stroke-width": 1.5 }));
      text(`${item.average ? "Ø " : ""}${formatPercent(value, false, true).replace(" %", "")}`, { x: barX + barWidth / 2, y: Math.max(plot.top + 8, barY - 5), "text-anchor": "middle", fill: "#f4f8ff", "font-size": cluster.bars.length > 18 ? 6 : 8, "font-weight": 700 });
      const label = `${partyDisplayLabel(party, item.region)}${item.average ? "" : ` ${item.rank + 1}`}`;
      const partyBarCount = cluster.bars.filter(bar => bar.party === party).length;
      if (state.groupBy === "region" && party === "CDU/CSU" && partyBarCount === 1 && new Set(cluster.bars.map(bar => bar.party)).size > 1) {
        text("CDU/", { x: barX + barWidth / 2, y: plot.bottom + 14, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 7 });
        text("CSU", { x: barX + barWidth / 2, y: plot.bottom + 24, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 7 });
      } else if (state.groupBy === "region") text(label, { x: barX + barWidth / 2, y: plot.bottom + 12, "text-anchor": "end", transform: `rotate(-90 ${barX + barWidth / 2} ${plot.bottom + 12})`, fill: "#a8bfd9", "font-size": cluster.bars.length > 18 ? 6 : 8 });
    });
    if (state.groupBy === "party") {
      let runStart = 0;
      while (runStart < cluster.bars.length) {
        let runEnd = runStart;
        while (runEnd + 1 < cluster.bars.length && cluster.bars[runEnd + 1].item.region === cluster.bars[runStart].item.region) runEnd += 1;
        const runCenter = plot.left + slot * ((runStart + runEnd + 1) / 2);
        text(REGION_CODES[cluster.bars[runStart].item.region], { x: runCenter, y: plot.bottom + 15, "text-anchor": "middle", fill: "#a8bfd9", "font-size": cluster.bars.length > 34 ? 6 : 7.5, "font-weight": 700 });
        runStart = runEnd + 1;
      }
    }
    const pollNotes = [...new Map(cluster.bars.map(({ item }) => {
      const key = `${item.region}|${item.average ? "average" : item.rank}`;
      const label = item.average ? `${REGION_CODES[item.region]} · Durchschnitt` : `${REGION_CODES[item.region]} ${item.rank + 1} · ${item.poll.institute} · ${formatDate(item.poll.date)}`;
      return [key, label];
    })).values()];
    const noteColumns = Math.max(1, Math.min(6, Math.ceil(pollNotes.length / 6)));
    const noteRows = Math.ceil(pollNotes.length / noteColumns);
    const noteColumnWidth = (plot.right - plot.left) / noteColumns;
    pollNotes.forEach((note, noteIndex) => {
      const noteColumn = Math.floor(noteIndex / noteRows), noteRow = noteIndex % noteRows;
      text(note, { x: plot.left + noteColumn * noteColumnWidth, y: plot.bottom + 31 + noteRow * 6.5, fill: "#7f95b2", "font-size": 5.2 });
    });
  });
  text("Werte in %", { x: width / 2, y: height - 92, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 11 });
  const footerStamp = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(now);
  text(footerStamp, { x: width / 2, y: height - 62, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 10 });
  text("Quelle der Daten: Wahlrecht.de", { x: width / 2, y: height - 46, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 9 });
  text("© charavision", { x: width / 2, y: height - 30, "text-anchor": "middle", fill: "#dce8f7", "font-size": 9, "font-weight": 700 });
  text(`Seite ${pageNumber} / ${pageCount}`, { x: width - 42, y: height - 30, "text-anchor": "end", fill: "#dce8f7", "font-size": 12, "font-weight": 700 });
  return page;
}

async function rasterizeA4Page(svg, mimeType, quality, layout) {
  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = layout.width * 2; canvas.height = layout.height * 2;
    const context = canvas.getContext("2d"); context.fillStyle = "#081326"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("A4-Seite konnte nicht erstellt werden.")), mimeType, quality));
  } finally { URL.revokeObjectURL(url); }
}

function pdfFromJpegs(images, layout) {
  const encoder = new TextEncoder(), chunks = [], offsets = [0]; let length = 0;
  const push = value => { const bytes = typeof value === "string" ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
  push("%PDF-1.4\n");
  const objectCount = 2 + images.length * 3;
  const object = (number, body, binary) => { offsets[number] = length; push(`${number} 0 obj\n${body}`); if (binary) { push("\nstream\n"); push(binary); push("\nendstream"); } push("\nendobj\n"); };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageRefs = images.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageRefs}] >>`);
  images.forEach((image, index) => {
    const pageObject = 3 + index * 3, contentObject = pageObject + 1, imageObject = pageObject + 2;
    const pageWidth = layout.landscape ? 841.89 : 595.28, pageHeight = layout.landscape ? 595.28 : 841.89;
    object(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    const drawing = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
    object(contentObject, `<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`);
    object(imageObject, `<< /Type /XObject /Subtype /Image /Width ${layout.width * 2} /Height ${layout.height * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`, image);
  });
  const xref = length; push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index <= objectCount; index += 1) push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

async function exportA4(format) {
  const clusters = a4ExportClusters();
  if (!clusters.length) throw new Error("Bitte mindestens eine Partei und ein Parlament auswählen.");
  const layout = a4LayoutFor(clusters);
  const pageCount = Math.ceil(clusters.length / layout.capacity);
  const pages = Array.from({ length: pageCount }, (_, index) => buildA4Page(clusters.slice(index * layout.capacity, index * layout.capacity + layout.capacity), index + 1, pageCount, layout));
  els.exportMessage.textContent = `${format === "pdf" ? "PDF" : "A4-PNG"} mit ${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"} wird erstellt …`;
  if (format === "pdf") {
    const jpegs = [];
    for (const page of pages) jpegs.push(new Uint8Array(await (await rasterizeA4Page(page, "image/jpeg", .94, layout)).arrayBuffer()));
    downloadBlob(pdfFromJpegs(jpegs, layout), `sonntagsfragen-${configurationCode()}.pdf`);
  } else {
    for (let index = 0; index < pages.length; index += 1) {
      const mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const extension = format === "jpeg" ? "jpg" : "png";
      downloadBlob(await rasterizeA4Page(pages[index], mime, format === "jpeg" ? .94 : undefined, layout), `sonntagsfragen-${configurationCode()}-seite-${index + 1}.${extension}`);
      await new Promise(resolve => setTimeout(resolve, 180));
    }
  }
  els.exportMessage.textContent = `${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"} erstellt`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
}

fetch("data/polls.json", { cache: "no-store" })
  .then(response => { if (!response.ok) throw new Error("Daten konnten nicht geladen werden"); return response.json(); })
  .then(data => {
    data.polls = Object.fromEntries(Object.entries(data.polls).map(([region, rows]) => [region, rows.map(row => ({
      date: row[0], institute: row[1], client: row[2],
      values: Object.fromEntries(data.parties.map((party, index) => [party, row[3][index] || 0]))
    }))]));
    data.elections = Object.fromEntries(Object.entries(data.elections || {}).map(([region, row]) => [region, {
      date: row[0], values: Object.fromEntries(data.parties.map((party, index) => [party, row[1][index] || 0])), represented: row[2] || []
    }]));
    state.data = data;
    els.updated.textContent = formatDate(data.updated);
    buildControls();
    updatePollOptions(true);
    render();
    document.querySelector("#code-input").addEventListener("submit", event => {
      event.preventDefault();
      try { applyConfigurationCode(els.inputCode.value.trim()); els.codeMessage.textContent = "Konfiguration übernommen."; }
      catch (error) { els.codeMessage.textContent = error.message; }
    });
    document.querySelector("#copy-code").addEventListener("click", async () => {
      await navigator.clipboard.writeText(els.outputCode.textContent);
      els.codeMessage.textContent = "Code kopiert.";
    });
    document.querySelector("#average-mode").addEventListener("change", event => {
      state.averageMode = event.currentTarget.checked;
      render();
    });
    els.mobileView.addEventListener("change", event => {
      state.mobileView = event.currentTarget.checked;
      render(false);
    });
    document.querySelectorAll('input[name="cluster-mode"]').forEach(input => input.addEventListener("change", event => {
      if (!event.currentTarget.checked) return;
      state.groupBy = event.currentTarget.value;
      render();
    }));
    const exportFormat = document.querySelector("#export-format");
    const a4Mode = document.querySelector("#a4-mode");
    a4Mode.addEventListener("change", event => { state.a4Mode = event.currentTarget.checked; render(false); });
    exportFormat.addEventListener("change", event => {
      if (event.currentTarget.value !== "pdf" || state.a4Mode) return;
      state.a4Mode = true; a4Mode.checked = true; render(false);
    });
    document.querySelector("#export-file").addEventListener("click", () => {
      const format = exportFormat.value;
      if (format === "pdf" && !state.a4Mode) { state.a4Mode = true; a4Mode.checked = true; render(false); }
      const operation = state.a4Mode || format === "pdf" ? exportA4(format) : exportChartImage(format);
      operation.catch(error => { els.exportMessage.textContent = `Export fehlgeschlagen: ${error.message}`; });
    });
    window.addEventListener("resize", () => render(false));
    let perspectiveFrame = 0;
    els.scroll.addEventListener("scroll", () => {
      if (!state.perspective?.floorLines.length && !state.perspective?.bars.length) return;
      cancelAnimationFrame(perspectiveFrame);
      perspectiveFrame = requestAnimationFrame(updatePerspective);
    }, { passive: true });
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });
