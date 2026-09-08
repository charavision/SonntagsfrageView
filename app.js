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

const state = { data: null, regions: new Set(["Bundestag"]), parties: new Set(Object.keys(PARTY_META)), selectedPollRanks: new Set([0]) };
const els = {
  updated: document.querySelector("#updated"), regions: document.querySelector("#region-options"),
  parties: document.querySelector("#party-options"), polls: document.querySelector("#poll-options"), chart: document.querySelector("#chart"),
  scroll: document.querySelector("#chart-scroll"), title: document.querySelector("#chart-title"),
  kicker: document.querySelector("#chart-kicker"), meta: document.querySelector("#chart-meta"),
  description: document.querySelector("#chart-description"), empty: document.querySelector("#empty-state"),
  tooltip: document.querySelector("#tooltip")
};

function makeChoice(container, group, value, checked, color, code) {
  const wrap = document.createElement("div");
  wrap.className = `choice ${group === "party" ? "party-choice" : ""}`;
  if (color) wrap.style.setProperty("--party-color", color);
  const id = `${group}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const label = code ? `<strong class="region-code">${code}</strong><span>${value}</span>` : value;
  wrap.innerHTML = `<input id="${id}" type="checkbox" name="${group}" value="${value}" ${checked ? "checked" : ""}><label for="${id}">${label}</label>`;
  container.append(wrap);
  return wrap.querySelector("input");
}

function buildControls() {
  state.data.regions.forEach(region => {
    const input = makeChoice(els.regions, "region", region, state.regions.has(region), null, REGION_CODES[region]);
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

function render() {
  const selectedRegions = [...state.regions];
  const series = selectedRegions.flatMap(region => [...state.selectedPollRanks].sort().map(rank => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank, poll } : null;
  }).filter(Boolean));
  const parties = [...state.parties];
  const oneRegion = selectedRegions.length === 1;
  els.title.textContent = oneRegion ? selectedRegions[0] : `${selectedRegions.length} Parlamente im Vergleich`;
  els.kicker.textContent = oneRegion ? (selectedRegions[0] === "Bundestag" ? "Bundestagswahl" : "Landtagswahl") : "Bund & Länder";
  els.meta.textContent = series.length === 1 ? `${series[0].poll.institute} · ${formatDate(series[0].poll.date)}` : `${series.length} Umfragen aus ${selectedRegions.length} Parlamenten`;
  els.description.textContent = `Nach Parteien gruppiertes Balkendiagramm mit ${series.length} Umfragen aus ${selectedRegions.length} Parlamenten.`;
  els.chart.replaceChildren();
  els.empty.hidden = Boolean(series.length && parties.length);
  els.scroll.hidden = !series.length || !parties.length;
  if (!series.length || !parties.length) return;

  const compact = window.innerWidth < 700;
  const slotWidth = compact ? 38 : 48;
  const groupWidth = Math.max(compact ? 76 : 96, series.length * slotWidth + 30);
  const margin = { top: 62, right: 34, bottom: 142, left: 64 };
  const width = Math.max(els.scroll.clientWidth - 2, margin.left + margin.right + parties.length * groupWidth);
  const height = compact ? 480 : 560;
  const innerH = height - margin.top - margin.bottom;
  const chartW = width - margin.left - margin.right;
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
    els.chart.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const label = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis-label" });
    label.textContent = `${tick} %`;
    els.chart.append(label);
  }

  const barGap = compact ? 8 : 12;
  const barWidth = compact ? 28 : 34;
  parties.forEach((party, partyIndex) => {
    const center = margin.left + partyIndex * groupWidth + groupWidth / 2;
    const totalBars = series.length * barWidth + (series.length - 1) * barGap;
    const startX = center - totalBars / 2;
    series.forEach((item, seriesIndex) => {
      const value = Number(item.poll.values[party] || 0);
      const election = state.data.elections?.[item.region];
      const baseline = Number(election?.values?.[party] || 0);
      const delta = value - baseline;
      const isNew = !election?.represented?.includes(party) && value >= 5 && party !== "Sonstige";
      const h = (value / yMax) * innerH;
      const x = startX + seriesIndex * (barWidth + barGap);
      const y = margin.top + innerH - h;
      const bar = svgEl("rect", { x, y, width: barWidth, height: h, fill: PARTY_META[party].color, opacity: [1, .72, .46][item.rank], class: "bar", rx: 3 });
      bar.addEventListener("pointermove", event => showTooltip(event, item.region, item.poll, party, value));
      bar.addEventListener("pointerleave", hideTooltip);
      els.chart.append(bar);
      const valueLabel = svgEl("text", { x: x + barWidth / 2, y: Math.max(margin.top - 9, y - 10), "text-anchor": "middle", class: "bar-value" });
      valueLabel.textContent = formatPercent(value);
      els.chart.append(valueLabel);
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
      const regionLabel = svgEl("text", { x: x + barWidth / 2, y: margin.top + innerH + 51, "text-anchor": "middle", class: "region-label" });
      regionLabel.textContent = REGION_CODES[item.region] || item.region;
      els.chart.append(regionLabel);
    });
    const label = svgEl("text", { x: center, y: height - margin.bottom + 82, "text-anchor": "middle", class: "poll-label" });
    label.textContent = party;
    els.chart.append(label);
  });
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
    window.addEventListener("resize", render);
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });
