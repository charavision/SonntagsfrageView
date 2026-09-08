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

const state = { data: null, region: "Bundestag", parties: new Set(Object.keys(PARTY_META)), selectedPolls: new Set() };
const els = {
  updated: document.querySelector("#updated"), regions: document.querySelector("#region-options"),
  parties: document.querySelector("#party-options"), polls: document.querySelector("#poll-options"), chart: document.querySelector("#chart"),
  scroll: document.querySelector("#chart-scroll"), title: document.querySelector("#chart-title"),
  kicker: document.querySelector("#chart-kicker"), meta: document.querySelector("#chart-meta"),
  description: document.querySelector("#chart-description"), empty: document.querySelector("#empty-state"),
  tooltip: document.querySelector("#tooltip")
};

function makeChoice(container, group, value, checked, color) {
  const wrap = document.createElement("div");
  wrap.className = `choice ${group === "party" ? "party-choice" : ""}`;
  if (color) wrap.style.setProperty("--party-color", color);
  const id = `${group}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  wrap.innerHTML = `<input id="${id}" type="${group === "region" ? "radio" : "checkbox"}" name="${group}" value="${value}" ${checked ? "checked" : ""}><label for="${id}">${value}</label>`;
  container.append(wrap);
  return wrap.querySelector("input");
}

function buildControls() {
  state.data.regions.forEach(region => {
    const input = makeChoice(els.regions, "region", region, region === state.region);
    input.addEventListener("change", () => { state.region = input.value; updatePollOptions(true); render(); });
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
  document.querySelector("#region-toggle").addEventListener("click", () => {
    const inputs = [...els.regions.querySelectorAll("input")];
    const current = inputs.findIndex(input => input.checked);
    inputs[(current + 1) % inputs.length].click();
  });
}

function pollKey(poll) { return `${poll.date}|${poll.institute}|${JSON.stringify(poll.values)}`; }

function updatePollOptions(reset = false) {
  const recent = (state.data.polls[state.region] || []).slice(0, 3);
  if (reset || !state.selectedPolls.size) state.selectedPolls = new Set(recent.length ? [pollKey(recent[0])] : []);
  els.polls.replaceChildren();
  recent.forEach((poll, index) => {
    const key = pollKey(poll);
    const wrap = document.createElement("div");
    wrap.className = "choice poll-choice";
    wrap.style.setProperty("--poll-opacity", [1, .62, .34][index]);
    const id = `poll-${index}`;
    wrap.innerHTML = `<input id="${id}" type="checkbox" value="${index}" ${state.selectedPolls.has(key) ? "checked" : ""}><label for="${id}"><span><strong>${index === 0 ? "Neueste" : `${index + 1}. jüngste`}</strong><small>${poll.institute} · ${formatDate(poll.date)}</small></span></label>`;
    const input = wrap.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPolls.add(key); else state.selectedPolls.delete(key);
      if (!state.selectedPolls.size) {
        state.selectedPolls.add(key);
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

function render() {
  const all = state.data.polls[state.region] || [];
  const polls = all.slice(0, 3).filter(poll => state.selectedPolls.has(pollKey(poll)));
  const parties = Object.keys(PARTY_META).filter(p => state.parties.has(p));
  els.title.textContent = state.region;
  els.kicker.textContent = state.region === "Bundestag" ? "Bundestagswahl" : "Landtagswahl";
  els.meta.textContent = polls.length === 1 ? `${polls[0].institute} · ${formatDate(polls[0].date)}` : `${polls.length} jüngste Umfragen im Vergleich`;
  els.description.textContent = `Nach Parteien gruppiertes Balkendiagramm mit ${polls.length} ausgewählten Umfragen für ${state.region}.`;
  els.chart.replaceChildren();
  els.empty.hidden = Boolean(polls.length && parties.length);
  els.scroll.hidden = !polls.length || !parties.length;
  if (!polls.length || !parties.length) return;

  const compact = window.innerWidth < 700;
  const groupWidth = Math.max(compact ? 58 : 76, polls.length * (compact ? 12 : 16) + 28);
  const margin = { top: 28, right: 24, bottom: 118, left: 50 };
  const width = Math.max(els.scroll.clientWidth - 2, margin.left + margin.right + parties.length * groupWidth);
  const height = compact ? 480 : 560;
  const innerH = height - margin.top - margin.bottom;
  const chartW = width - margin.left - margin.right;
  const maxValue = Math.max(50, ...polls.flatMap(p => parties.map(party => p.values[party] || 0)));
  const yMax = Math.ceil(maxValue / 10) * 10;
  els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.chart.setAttribute("width", width);
  els.chart.setAttribute("height", height);

  for (let tick = 0; tick <= yMax; tick += 10) {
    const y = margin.top + innerH - (tick / yMax) * innerH;
    els.chart.append(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
    const label = svgEl("text", { x: margin.left - 10, y: y + 4, "text-anchor": "end", class: "axis-label" });
    label.textContent = `${tick} %`;
    els.chart.append(label);
  }

  const barGap = 2;
  const barWidth = Math.max(7, Math.min(18, (groupWidth - 20) / polls.length - barGap));
  parties.forEach((party, partyIndex) => {
    const center = margin.left + partyIndex * groupWidth + groupWidth / 2;
    const totalBars = polls.length * barWidth + (polls.length - 1) * barGap;
    const startX = center - totalBars / 2;
    polls.forEach((poll, pollIndex) => {
      const value = Number(poll.values[party] || 0);
      const h = (value / yMax) * innerH;
      const bar = svgEl("rect", { x: startX + pollIndex * (barWidth + barGap), y: margin.top + innerH - h, width: barWidth, height: h, fill: PARTY_META[party].color, opacity: [1, .62, .34][all.indexOf(poll)], class: "bar", rx: 1 });
      bar.addEventListener("pointermove", event => showTooltip(event, poll, party, value));
      bar.addEventListener("pointerleave", hideTooltip);
      els.chart.append(bar);
    });
    const label = svgEl("text", { x: center, y: height - margin.bottom + 23, "text-anchor": "middle", class: "poll-label" });
    label.textContent = party;
    els.chart.append(label);
  });
}

function showTooltip(event, poll, party, value) {
  els.tooltip.innerHTML = `<strong>${party}: ${String(value).replace(".", ",")} %</strong><br>${poll.institute}<br>${formatDate(poll.date)}${poll.client ? `<br>${poll.client}` : ""}`;
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
    state.data = data;
    els.updated.textContent = formatDate(data.updated);
    buildControls();
    updatePollOptions(true);
    render();
    window.addEventListener("resize", render);
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });
