const PARTY_META = {
  "CDU/CSU": { color: "var(--cdu)", label: "CDU/CSU" },
  "SPD": { color: "var(--spd)", label: "SPD" },
  "GRÜNE": { color: "var(--gruene)", label: "GRÜNE" },
  "FDP": { color: "var(--fdp)", label: "FDP" },
  "LINKE": { color: "var(--linke)", label: "LINKE" },
  "AfD": { color: "var(--afd)", label: "AfD" },
  "BSW": { color: "var(--bsw)", label: "BSW" },
  "FW": { color: "var(--fw)", label: "FW" },
  "Sonstige": { color: "var(--sonstige)", label: "Sonstige" }
};

const REGION_CODES = {
  "Bundestag": "BUND", "Baden-Württemberg": "BW", "Bayern": "BY", "Berlin": "BE",
  "Brandenburg": "BB", "Bremen": "HB", "Hamburg": "HH", "Hessen": "HE",
  "Mecklenburg-Vorpommern": "MV", "Niedersachsen": "NI", "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP", "Saarland": "SL", "Sachsen": "SN", "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH", "Thüringen": "TH"
};

const state = { data: null, regions: new Set(["Bundestag"]), parties: new Set(Object.keys(PARTY_META)), selectedPollRanks: new Set([0]), chartLayout: new Map() };
const els = {
  updated: document.querySelector("#updated"), regions: document.querySelector("#region-options"),
  parties: document.querySelector("#party-options"), polls: document.querySelector("#poll-options"), chart: document.querySelector("#chart"),
  scroll: document.querySelector("#chart-scroll"), title: document.querySelector("#chart-title"),
  kicker: document.querySelector("#chart-kicker"), meta: document.querySelector("#chart-meta"),
  description: document.querySelector("#chart-description"), empty: document.querySelector("#empty-state"),
  tooltip: document.querySelector("#tooltip")
};

function makeChoice(container, group, value, checked, color, code, nextElection) {
  const wrap = document.createElement("div");
  wrap.className = `choice ${group === "party" ? "party-choice" : ""} ${group === "region" ? "region-choice" : ""}`;
  if (color) wrap.style.setProperty("--party-color", color);
  const id = `${group}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const label = code ? `<span class="region-name"><strong class="region-code">${code}</strong><span>${value}</span></span><small class="next-election">Nächste Wahl: ${nextElection || "noch offen"}</small>` : value;
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

function formatPercent(value, signed = false) {
  const absolute = Math.abs(Number(value)).toFixed(1).replace(".", ",");
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
  const selectedRegions = [...state.regions];
  const series = selectedRegions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank, poll } : null;
  }).filter(Boolean));
  const parties = [...state.parties];
  const motionEnabled = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const oldLayout = state.chartLayout;
  const nextLayout = new Map();
  const hasExistingBars = [...oldLayout.keys()].some(key => !key.startsWith("party:"));
  const newBarDelay = hasExistingBars ? 820 : 80;
  const newLabelDelay = hasExistingBars ? 1220 : 430;
  const oneRegion = selectedRegions.length === 1;
  els.title.textContent = oneRegion ? selectedRegions[0] : `${selectedRegions.length} Parlamente im Vergleich`;
  els.kicker.textContent = oneRegion ? (selectedRegions[0] === "Bundestag" ? "Bundestagswahl" : "Landtagswahl") : "Bund & Länder";
  els.meta.textContent = series.length === 1 ? `${series[0].poll.institute} · ${formatDate(series[0].poll.date)}` : `${series.length} Umfragen aus ${selectedRegions.length} Parlamenten`;
  els.description.textContent = `Nach Parteien gruppiertes Balkendiagramm mit ${series.length} Umfragen aus ${selectedRegions.length} Parlamenten.`;
  els.chart.replaceChildren();
  els.empty.hidden = Boolean(series.length && parties.length);
  els.scroll.hidden = !series.length || !parties.length;
  if (!series.length || !parties.length) {
    state.chartLayout = new Map();
    return;
  }

  const compact = window.innerWidth < 900;
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
  const chartW = width - margin.left - margin.right;
  const groupWidth = chartW / parties.length;
  const maxValue = Math.max(50, ...series.flatMap(item => parties.map(party => item.poll.values[party] || 0)));
  const yMax = Math.ceil(maxValue / 10) * 10;
  els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.chart.setAttribute("width", width);
  els.chart.setAttribute("height", height);

  const defs = svgEl("defs");
  defs.innerHTML = `<filter id="bar-glow" x="-80%" y="-30%" width="260%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  els.chart.append(defs);

  for (let tick = 0; tick <= yMax; tick += 10) {
    const y = margin.top + innerH - (tick / yMax) * innerH;
    els.chart.append(svgEl("line", { x1: axisX, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const label = svgEl("text", { x: compact ? axisX + 7 : axisX - 10, y: y + 4, "text-anchor": compact ? "start" : "end", class: "axis-label" });
    label.textContent = `${tick} %`;
    els.chart.append(label);
  }
  els.chart.append(svgEl("line", { x1: axisX, x2: axisX, y1: margin.top, y2: height - 18, class: "axis-line" }));

  const availablePerBar = (groupWidth - Math.min(30, groupWidth * .12)) / series.length;
  const barGap = series.length === 1 ? 0 : Math.max(5, Math.min(20, 23 - totalBarCount * 1.35));
  const maxBarWidth = totalBarCount === 1 ? 280 : totalBarCount <= 3 ? 150 : totalBarCount <= 6 ? 92 : totalBarCount <= 10 ? 58 : totalBarCount <= 20 ? 38 : 34;
  const barWidth = Math.max(totalBarCount <= 10 ? 10 : 4, Math.min(maxBarWidth, availablePerBar - barGap));
  const displayedBars = [];
  parties.forEach((party, partyIndex) => {
    const center = margin.left + partyIndex * groupWidth + groupWidth / 2;
    const totalBars = series.length * barWidth + (series.length - 1) * barGap;
    const startX = center - totalBars / 2;
    series.forEach((item, seriesIndex) => {
      const key = `${party}|${item.region}|${item.rank}`;
      const old = oldLayout.get(key);
      const value = Number(item.poll.values[party] || 0);
      const election = state.data.elections?.[item.region];
      const baseline = Number(election?.values?.[party] || 0);
      const delta = value - baseline;
      const isNew = !election?.represented?.includes(party) && value >= 5 && party !== "Sonstige";
      const h = (value / yMax) * innerH;
      const x = startX + seriesIndex * (barWidth + barGap);
      const y = margin.top + innerH - h;
      const fillOpacity = [.68, .34, .16][item.rank];
      const strokeOpacity = [1, .78, .56][item.rank];
      const bar = svgEl("rect", {
        x, y, width: barWidth, height: h,
        fill: PARTY_META[party].color,
        stroke: PARTY_META[party].color,
        "fill-opacity": fillOpacity,
        "stroke-opacity": strokeOpacity,
        class: "bar", rx: 3
      });
      bar.addEventListener("pointermove", event => showTooltip(event, item.region, item.poll, partyDisplayLabel(party, item.region), value));
      bar.addEventListener("pointerleave", hideTooltip);
      els.chart.append(bar);
      old ? animateX(bar, old.x, x, motionEnabled) : growBar(bar, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay);
      const valueLabel = svgEl("text", { x: x + barWidth / 2, y: Math.max(margin.top - 9, y - 10), "text-anchor": "middle", class: "bar-value" });
      valueLabel.textContent = formatPercent(value);
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
      displayedBars.push({ region: item.region, center: x + barWidth / 2 });
      nextLayout.set(key, { x, center: x + barWidth / 2 });
    });

    // A multi-parliament Union comparison shares CDU/CSU. With one parliament,
    // the label is CDU, CSU for Bavaria, or CDU/CSU for the Bundestag.
    const partyLabelY = height - margin.bottom + (compact ? 96 : 82);
    const sharedUnionLabel = party === "CDU/CSU" && selectedRegions.length > 1;
    let labelStart = 0;
    while (labelStart < series.length) {
      const displayLabel = sharedUnionLabel ? "CDU/CSU" : partyDisplayLabel(party, series[labelStart].region);
      let labelEnd = labelStart + 1;
      while (labelEnd < series.length && (sharedUnionLabel || partyDisplayLabel(party, series[labelEnd].region) === displayLabel)) labelEnd += 1;
      const firstCenter = startX + labelStart * (barWidth + barGap) + barWidth / 2;
      const lastCenter = startX + (labelEnd - 1) * (barWidth + barGap) + barWidth / 2;
      const labelCenter = (firstCenter + lastCenter) / 2;
      const rotatePartyLabel = compact;
      const label = svgEl("text", {
        x: labelCenter,
        y: partyLabelY,
        "text-anchor": rotatePartyLabel ? "end" : "middle",
        class: `poll-label${compact ? " mobile-party-label" : ""}`,
        ...(rotatePartyLabel ? { transform: `rotate(-90 ${labelCenter} ${partyLabelY})` } : {})
      });
      label.textContent = displayLabel;
      const partyLabelGroup = svgEl("g");
      partyLabelGroup.append(label);
      els.chart.append(partyLabelGroup);
      fadeIn(partyLabelGroup, motionEnabled, newLabelDelay);
      labelStart = labelEnd;
    }
    nextLayout.set(`party:${party}`, { center });
  });

  // Parliament labels follow the complete visual bar sequence, not individual
  // party groups. Any adjacent bars from one parliament therefore share one label.
  let regionStart = 0;
  while (regionStart < displayedBars.length) {
    let regionEnd = regionStart + 1;
    while (regionEnd < displayedBars.length && displayedBars[regionEnd].region === displayedBars[regionStart].region) regionEnd += 1;
    const count = regionEnd - regionStart;
    const regionLabelX = (displayedBars[regionStart].center + displayedBars[regionEnd - 1].center) / 2;
    const regionLabelY = margin.top + innerH + 51;
    const rotateRegionLabel = compact && count === 1;
    const regionLabel = svgEl("text", {
      x: regionLabelX,
      y: regionLabelY,
      "text-anchor": rotateRegionLabel ? "end" : "middle",
      class: `region-label${compact ? " mobile-region-label" : ""}`,
      ...(rotateRegionLabel ? { transform: `rotate(-90 ${regionLabelX} ${regionLabelY})` } : {})
    });
    regionLabel.textContent = REGION_CODES[displayedBars[regionStart].region] || displayedBars[regionStart].region;
    const regionLabelGroup = svgEl("g");
    regionLabelGroup.append(regionLabel);
    els.chart.append(regionLabelGroup);
    fadeIn(regionLabelGroup, motionEnabled, newLabelDelay);
    regionStart = regionEnd;
  }
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
  state.chartLayout = nextLayout;
}

function showTooltip(event, region, poll, party, value) {
  els.tooltip.innerHTML = `<strong>${region}</strong><br>${party}: ${String(value).replace(".", ",")} %<br>${poll.institute} · ${formatDate(poll.date)}${poll.client ? `<br>${poll.client}` : ""}`;
  els.tooltip.hidden = false;
  const left = Math.min(window.innerWidth - 280, event.clientX + 14);
  els.tooltip.style.left = `${Math.max(8, left)}px`;
  els.tooltip.style.top = `${Math.max(8, event.clientY - 70)}px`;
}
function hideTooltip() { els.tooltip.hidden = true; }
function formatDate(value) { return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`)); }

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
    window.addEventListener("resize", () => render(false));
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });
