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

const state = { data: null, regions: new Set(["Bundestag"]), parties: new Set(Object.keys(PARTY_META)), selectedPollRanks: new Set([0]), averageMode: false, mobileView: false, groupBy: "party", chartLayout: new Map(), perspective: null };
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
  const mode = (state.averageMode ? 1n : 0n) + (state.mobileView ? 2n : 0n) + (state.groupBy === "region" ? 4n : 0n);
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
      const rotate = compact && count === 1;
      const label = svgEl("text", {
        x, y, "text-anchor": "middle",
        class: `${className}${compact ? ` mobile-${className}` : ""}`,
        ...(rotate ? { transform: `rotate(-90 ${x} ${y})` } : {})
      });
      label.textContent = text;
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
  if (mode > 7) throw new Error("Dieser Code gehört nicht zu einer gültigen Konfiguration.");
  state.averageMode = Boolean(mode & 1);
  state.mobileView = Boolean(mode & 2);
  state.groupBy = mode & 4 ? "region" : "party";
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
    document.querySelector("#export-jpeg").addEventListener("click", () => exportChartImage("jpeg").catch(error => { els.exportMessage.textContent = `Export fehlgeschlagen: ${error.message}`; }));
    document.querySelector("#export-png").addEventListener("click", () => exportChartImage("png").catch(error => { els.exportMessage.textContent = `Export fehlgeschlagen: ${error.message}`; }));
    window.addEventListener("resize", () => render(false));
    let perspectiveFrame = 0;
    els.scroll.addEventListener("scroll", () => {
      if (!state.perspective?.floorLines.length && !state.perspective?.bars.length) return;
      cancelAnimationFrame(perspectiveFrame);
      perspectiveFrame = requestAnimationFrame(updatePerspective);
    }, { passive: true });
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });
