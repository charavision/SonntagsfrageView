const PARTY_META = {
  "CDU/CSU": { color: "var(--cdu)", glow: "#aab1ba", label: "CDU/CSU" },
  "SPD": { color: "var(--spd)", glow: "#ff4c56", label: "SPD" },
  "GRÜNE": { color: "var(--gruene)", glow: "#55e878", label: "GRÜNE" },
  "FDP": { color: "var(--fdp)", glow: "#ffe66a", label: "FDP" },
  "LINKE": { color: "var(--linke)", glow: "#c96bff", label: "LINKE" },
  "AfD": { color: "var(--afd)", glow: "#58b5ff", label: "AfD" },
  "BSW": { color: "var(--bsw)", glow: "#e05282", label: "BSW" },
  "FW": { color: "var(--fw)", glow: "#ffb25e", label: "FW" },
  "Sonstige": { color: "var(--sonstige)", glow: "#d9e0e8", label: "Sonstiges" }
};
const OTHER_PARTIES = {
  "Piraten": { color: "#e76f00", label: "Piraten" },
  "NPD": { color: "#7a3e2e", label: "NPD" },
  "Die PARTEI": { color: "#e30613", label: "Die PARTEI" },
  "Volt": { color: "#502379", label: "Volt" }
};
const MATTE_PARTY_COLORS = {
  "CDU/CSU": { dark: "#20252b", base: "#353c44", light: "#626c76" },
  "SPD": { dark: "#5d2026", base: "#873139", light: "#bd5c63" },
  "GRÜNE": { dark: "#214b31", base: "#346a45", light: "#67a777" },
  "FDP": { dark: "#695d28", base: "#93843d", light: "#c6b968" },
  "LINKE": { dark: "#492c59", base: "#68417b", light: "#9870a8" },
  "AfD": { dark: "#244b6c", base: "#376b91", light: "#72a1c2" },
  "BSW": { dark: "#4f2634", base: "#71384b", light: "#9f6979" },
  "FW": { dark: "#674326", base: "#91613a", light: "#c18e61" },
  "Sonstige": { dark: "#3f464e", base: "#59636d", light: "#89939d" }
};

const REGION_CODES = {
  "Bundestag": "BUND", "Baden-Württemberg": "BW", "Bayern": "BY", "Berlin": "BE",
  "Brandenburg": "BB", "Bremen": "HB", "Hamburg": "HH", "Hessen": "HE",
  "Mecklenburg-Vorpommern": "MV", "Niedersachsen": "NI", "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP", "Saarland": "SL", "Sachsen": "SN", "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH", "Thüringen": "TH"
};

const startsMobile = window.matchMedia("(max-width: 900px)").matches;
let storedViewScales = { mobile: { x: 1, y: 1 }, desktop: { x: 1, y: 1 } };
try {
  const saved = JSON.parse(localStorage.getItem("view-scales") || "{}");
  ["mobile", "desktop"].forEach(platform => {
    const value = saved[platform];
    if (typeof value === "number") storedViewScales[platform] = { x: value, y: value };
    else if (value && typeof value === "object") storedViewScales[platform] = { x: Number(value.x) || 1, y: Number(value.y) || 1 };
  });
} catch (error) { /* Ungültigen lokalen Wert ignorieren. */ }
const state = { data: null, regions: new Set(["Bundestag"]), parties: new Set(Object.keys(PARTY_META)), otherParties: new Set(), selectedPollRanks: new Set([0]), pollTimeMode: "current", pollDateMode: false, pollRankOverrides: [0, 1, 2], pollDateLabels: [null, null, null], averageMode: false, mobileView: startsMobile, electionDates: !startsMobile, fullRegionNames: false, showSinceElection: true, sinceElectionMode: "color", showBrackets: true, showLabels: true, regionLabelMode: "auto", partyLabelMode: "auto", barColors: true, barColorMode: "party", barNeon: true, showPercentValues: true, percentLabelMode: "without", showLut: true, showBackground: true, viewSizeEnabled: true, viewZoomEnabled: true, fullscreenEnabled: true, fullscreenDefault: true, viewScales: storedViewScales, export3d: false, tabMode: false, selectionTab: "regions", groupBy: "party", a4Mode: true, a4Orientation: "auto", chartLayout: new Map(), perspective: null };
let savedProjectConfiguration = null;
function currentPlatformLabel() {
  if (window.AndroidApp) return "Android";
  if (window.MacApp) return "macOS";
  return state.mobileView ? "Web (Mobil)" : "Web (Desktop)";
}
function currentOutputPlatformLabel() {
  const target = document.querySelector("#report-current-version");
  const version = window.MacApp ? target?.dataset.macVersion : target?.dataset.androidVersion;
  return version ? `Version ${version} · ${currentPlatformLabel()}` : currentPlatformLabel();
}
function updateReportVersionLabel() {
  const target = document.querySelector("#report-current-version");
  if (!target?.dataset.androidVersion) return;
  const version = window.MacApp ? target.dataset.macVersion : target.dataset.androidVersion;
  target.textContent = `${version} · ${currentPlatformLabel()}`;
}
let fullscreenPreviousTabMode = null;
function setFullscreenView(active) {
  const wasActive = document.body.classList.contains("view-fullscreen-active");
  document.body.classList.toggle("view-fullscreen-active", active);
  const panel = document.querySelector("#chart-view-settings");
  if (panel) panel.hidden = active || state.mobileView;
  if (els?.fullscreenSettings) els.fullscreenSettings.setAttribute("aria-expanded", "false");
  if (active) {
    if (!wasActive) fullscreenPreviousTabMode = state.tabMode;
    state.tabMode = true;
  } else if (!active && wasActive && fullscreenPreviousTabMode !== null) {
    state.tabMode = fullscreenPreviousTabMode;
    fullscreenPreviousTabMode = null;
    document.body.classList.remove("fullscreen-selection-open", "fullscreen-output-open");
    els?.fullscreenSelection?.setAttribute("aria-expanded", "false");
    els?.fullscreenOutput?.setAttribute("aria-expanded", "false");
  }
  updateSelectionTabMode();
  if (state.data) requestAnimationFrame(() => render(false));
}
const els = {
  updated: document.querySelector("#updated"), regions: document.querySelector("#region-options"),
  parties: document.querySelector("#party-options"), polls: document.querySelector("#poll-options"), chart: document.querySelector("#chart"),
  scroll: document.querySelector("#chart-scroll"), title: document.querySelector("#chart-title"),
  meta: document.querySelector("#chart-meta"),
  description: document.querySelector("#chart-description"), empty: document.querySelector("#empty-state"),
  chartSection: document.querySelector(".chart-section"), mobileView: document.querySelector("#mobile-view"), fullRegionNames: document.querySelector("#full-region-names"), abbreviationMode: document.querySelector("#abbreviation-mode"), showSinceElection: document.querySelector("#show-since-election"), sinceElectionMode: document.querySelector("#since-election-mode"), showBrackets: document.querySelector("#show-brackets"), showLabels: document.querySelector("#show-labels"), labelsMenuToggle: document.querySelector("#labels-menu-toggle"), regionLabelMode: document.querySelector("#region-label-mode"), partyLabelMode: document.querySelector("#party-label-mode"), showBarColors: document.querySelector("#show-bar-colors"), barMenuToggle: document.querySelector("#bar-menu-toggle"), barColorMode: document.querySelector("#bar-color-mode"), barNeonMode: document.querySelector("#bar-neon-mode"), showPercentValues: document.querySelector("#show-percent-values"), percentLabelMode: document.querySelector("#percent-label-mode"), showLut: document.querySelector("#show-lut"), showBackground: document.querySelector("#show-background"), viewZoomEnabled: document.querySelector("#view-zoom-enabled"), viewZoomControls: document.querySelector("#view-zoom-controls"), fullscreenEnabled: document.querySelector("#fullscreen-enabled"), fullscreenEnter: document.querySelector("#view-fullscreen-enter"), fullscreenExit: document.querySelector("#view-fullscreen-exit"), fullscreenSettings: document.querySelector("#fullscreen-view-settings-toggle"), fullscreenSelection: document.querySelector("#fullscreen-selection-toggle"), fullscreenOutput: document.querySelector("#fullscreen-output-toggle"), fullscreenHelp: document.querySelector("#fullscreen-help"), reportMobileView: document.querySelector("#report-mobile-view"), reportUpdateData: document.querySelector("#report-update-data"), reportDataStand: document.querySelector("#report-data-stand"), viewSizeDown: document.querySelector("#view-size-down"), viewSizeUp: document.querySelector("#view-size-up"), viewWidthDown: document.querySelector("#view-width-down"), viewWidthUp: document.querySelector("#view-width-up"),
  electionDates: document.querySelector("#election-dates"),
  tooltip: document.querySelector("#tooltip"), inputCode: document.querySelector("#input-code"),
  outputCode: document.querySelector("#output-code"), codeMessage: document.querySelector("#code-message"),
  exportMessage: document.querySelector("#export-message"), exportSummary: document.querySelector("#export-summary"), updatedTime: document.querySelector("#updated-time"), updateMessage: document.querySelector("#update-message"), updateData: document.querySelector("#update-data"), previewDialog: document.querySelector("#export-preview-dialog"), previewPages: document.querySelector("#preview-pages"), previewPageStatus: document.querySelector("#preview-page-status"), previewZoom: document.querySelector("#preview-zoom"), previewZoomValue: document.querySelector("#preview-zoom-value")
};

document.body.classList.toggle("physical-mobile", startsMobile);
function applyViewMode() {
  document.body.classList.toggle("mobile-mode", state.mobileView);
  const viewport = document.querySelector('meta[name="viewport"]');
  const content = state.mobileView ? "width=device-width, initial-scale=1" : "width=1200";
  if (viewport.getAttribute("content") !== content) viewport.setAttribute("content", content);
  if (state.mobileView) {
    state.electionDates = false;
    els.electionDates.checked = false;
  }
  els.electionDates.disabled = state.mobileView;
  updateReportVersionLabel();
}

function updateComparisonButtons() {
  document.querySelectorAll(".cluster-mode-button").forEach(button => {
    const active = button.dataset.group === state.groupBy;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("#selection-tabs button").forEach(button => {
    const grouped = (button.dataset.panel === "regions" && state.groupBy === "party") || (button.dataset.panel === "parties" && state.groupBy === "region");
    button.classList.toggle("grouped", grouped);
  });
  const groupingSwitch = document.querySelector("#tab-grouping-switch");
  if (groupingSwitch) groupingSwitch.checked = state.groupBy === "party";
}

function updateSelectionTabMode() {
  document.body.classList.toggle("selection-tab-mode", state.tabMode);
  document.querySelector("#selection-tabs").hidden = !state.tabMode;
  document.querySelector("#tab-grouping").hidden = !state.tabMode;
  document.querySelectorAll("[data-selection-panel]").forEach(panel => { panel.hidden = state.tabMode && panel.dataset.selectionPanel !== state.selectionTab; });
  document.querySelectorAll("#selection-tabs button").forEach(button => button.classList.toggle("active", button.dataset.panel === state.selectionTab));
  const headerToggle = document.querySelector("#header-tab-mode");
  if (headerToggle) headerToggle.checked = state.tabMode;
  const averageToggle = document.querySelector("#tab-average-switch");
  if (averageToggle) averageToggle.checked = state.averageMode;
  updateComparisonButtons();
}

function updateElectionVisibility() {
  document.body.classList.toggle("hide-election-dates", !state.electionDates);
}

function barVisual(party) {
  if (!state.barNeon && (!state.barColors || state.barColorMode === "gray")) return { dark: "#343a42", base: "#555e68", light: "#8b949e", fill: "#555e68", stroke: "none" };
  if (!state.barNeon && state.barColorMode === "lightblue") return { dark: "#31536a", base: "#527b96", light: "#91b3c8", fill: "#527b96", stroke: "none" };
  if (!state.barNeon) {
    const matte = MATTE_PARTY_COLORS[party] || MATTE_PARTY_COLORS.Sonstige;
    return { ...matte, fill: matte.base, stroke: "none" };
  }
  if (!state.barColors || state.barColorMode === "gray") return { fill: "#7d8794", stroke: "#b8c2cf" };
  if (state.barColorMode === "lightblue") return { fill: "#77bce8", stroke: "#bce8ff" };
  return { fill: PARTY_META[party].color, stroke: PARTY_META[party].glow };
}

function mixHexColors(first, second, amount = .5) {
  const channels = color => [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  const a = channels(first), b = channels(second);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

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
const CONFIG_DATE_EPOCH = Date.UTC(1996, 0, 1);
const CONFIG_DATE_RADIX = 16384n;
function encodeCalendarConfiguration() {
  if (state.pollTimeMode === "current" && !state.pollDateLabels.some(Boolean)) return "";
  let payload = BigInt({ current: 0, free: 1, from: 2 }[state.pollTimeMode] ?? 0);
  state.pollDateLabels.forEach(date => {
    const timestamp = date ? Date.parse(`${date}T00:00:00Z`) : NaN;
    const days = Number.isFinite(timestamp) ? Math.max(0, Math.round((timestamp - CONFIG_DATE_EPOCH) / 86400000) + 1) : 0;
    payload = payload * CONFIG_DATE_RADIX + BigInt(Math.min(16383, days));
  });
  let encoded = "";
  do { encoded = CODE_ALPHABET[Number(payload % 62n)] + encoded; payload /= 62n; } while (payload);
  return encoded.padStart(8, "0");
}
function decodeCalendarConfiguration(encoded) {
  let payload = base62Decode(encoded);
  const dates = Array(3).fill(null);
  for (let index = 2; index >= 0; index -= 1) {
    const days = Number(payload % CONFIG_DATE_RADIX);
    payload /= CONFIG_DATE_RADIX;
    if (days > 0) dates[index] = new Date(CONFIG_DATE_EPOCH + (days - 1) * 86400000).toISOString().slice(0, 10);
  }
  const mode = ["current", "free", "from"][Number(payload)] || (Boolean(payload % 2n) ? "free" : "current");
  return { enabled: mode !== "current", mode, dates };
}
function configurationCode() {
  const partyUniverse = Object.keys(PARTY_META);
  const partyCount = orderedChoiceCount(partyUniverse.length);
  const pollMask = [...state.selectedPollRanks].reduce((mask, rank) => mask | (1 << rank), 0);
  let value = rankOrdered([...state.regions], state.data.regions);
  value = value * partyCount + rankOrdered([...state.parties], partyUniverse);
  value = value * 7n + BigInt(pollMask - 1);
  const orientationBits = state.a4Orientation === "portrait" ? 64n : state.a4Orientation === "landscape" ? 128n : 0n;
  const regionLabelBits = BigInt({ auto: 0, 0: 1, 90: 2, off: 3 }[state.regionLabelMode] || 0) << 16n;
  const partyLabelBits = BigInt({ auto: 0, 0: 1, 90: 2, off: 3 }[state.partyLabelMode] || 0) << 18n;
  const percentLabelBits = BigInt({ without: 0, with: 1, off: 2 }[state.percentLabelMode] || 0) << 20n;
  const sinceElectionBits = BigInt({ color: 0, gray: 1, off: 2 }[state.sinceElectionMode] || 0) << 22n;
  const yAxisBits = BigInt({ dynamic: 0, static: 1, off: 2 }[yAxisMode] || 0) << 24n;
  const barColorBits = BigInt({ party: 0, lightblue: 1, gray: 2 }[state.barColorMode] || 0) << 26n;
  const barNeonBits = (state.barNeon ? 0n : 1n) << 28n;
  const mode = (state.averageMode ? 1n : 0n) + (state.mobileView ? 2n : 0n) + (state.groupBy === "region" ? 4n : 0n) + (state.a4Mode ? 8n : 0n) + (state.fullRegionNames ? 16n : 0n) + (!state.electionDates ? 32n : 0n) + orientationBits + (!state.showSinceElection ? 256n : 0n) + (!state.showBrackets ? 512n : 0n) + (!state.showLabels ? 1024n : 0n) + (!state.barColors ? 2048n : 0n) + (!state.showPercentValues ? 4096n : 0n) + (!state.showLut ? 8192n : 0n) + (!state.showBackground ? 16384n : 0n) + (!state.export3d ? 32768n : 0n) + regionLabelBits + partyLabelBits + percentLabelBits + sinceElectionBits + yAxisBits + barColorBits + barNeonBits;
  value += mode * orderedChoiceCount(state.data.regions.length) * partyCount * 7n;
  return base62Encode(value) + encodeCalendarConfiguration();
}

function updateConfigurationCode() {
  const code = configurationCode();
  els.outputCode.textContent = code;
  const projectOutput = document.querySelector("#project-output-code");
  if (projectOutput) projectOutput.textContent = code;
  if (savedProjectConfiguration && code !== savedProjectConfiguration && els.exportMessage.textContent === "Projekt zentral gespeichert.") {
    els.exportMessage.textContent = "";
    savedProjectConfiguration = null;
  }
  return code;
}

function makeChoice(container, group, value, checked, color, code, nextElection, displayLabel) {
  const wrap = document.createElement("div");
  wrap.className = `choice ${group.includes("party") ? "party-choice" : ""} ${group === "region" ? "region-choice" : ""}`;
  if (color) wrap.style.setProperty("--party-color", color);
  const id = `${group}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const label = code ? `<span class="region-name"><span class="region-title">${value}</span><strong class="region-code">${code}</strong></span><small class="next-election"><span aria-hidden="true">📅</span> ${nextElection || "noch offen"}</small>` : (displayLabel || value);
  const orderBadge = group === "region" || group === "party" ? '<span class="selection-order-badge" aria-hidden="true" hidden></span>' : "";
  wrap.innerHTML = `<input id="${id}" type="checkbox" name="${group}" value="${value}" ${checked ? "checked" : ""}><label for="${id}">${label}</label>${orderBadge}`;
  container.append(wrap);
  return wrap.querySelector("input");
}

function updateSelectionOrderBadges() {
  [[els.regions, state.regions], [els.parties, state.parties]].forEach(([container, selected]) => {
    const positions = new Map([...selected].map((value, index) => [value, index + 1]));
    container.querySelectorAll(":scope > .choice").forEach(choice => {
      const input = choice.querySelector(":scope > input");
      const badge = choice.querySelector(":scope > .selection-order-badge");
      if (!input || !badge) return;
      const position = positions.get(input.value);
      badge.hidden = !position;
      badge.textContent = position ? String(position) : "";
    });
  });
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
      updatePollOptions(true);
      render();
    });
  });
  Object.entries(PARTY_META).forEach(([party, meta]) => {
    const input = makeChoice(els.parties, "party", party, true, meta.color, null, null, meta.label);
    input.addEventListener("change", () => {
      input.checked ? state.parties.add(party) : state.parties.delete(party);
      if (party === "Sonstige") document.querySelector("#other-party-popover")?.removeAttribute("hidden");
      render();
    });
    if (party === "Sonstige") {
      const choice = input.closest(".choice");
      choice.classList.add("other-party-trigger");
      const panel = document.createElement("div");
      panel.id = "other-party-popover";
      panel.className = "other-party-popover";
      panel.hidden = true;
      Object.entries(OTHER_PARTIES).forEach(([extraParty, extraMeta]) => {
        const extraInput = makeChoice(panel, "other-party", extraParty, state.otherParties.has(extraParty), extraMeta.color, null, null, extraMeta.label);
        extraInput.addEventListener("change", () => {
          extraInput.checked ? state.otherParties.add(extraParty) : state.otherParties.delete(extraParty);
          render();
        });
      });
      choice.append(panel);
      choice.querySelector("label").setAttribute("aria-haspopup", "true");
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".other-party-trigger")) document.querySelector("#other-party-popover")?.setAttribute("hidden", "");
  });
  document.querySelector("#party-toggle").addEventListener("click", event => {
    const select = state.parties.size !== Object.keys(PARTY_META).length;
    state.parties = new Set(select ? Object.keys(PARTY_META) : []);
    els.parties.querySelectorAll('input[name="party"]').forEach(input => input.checked = select);
    event.currentTarget.textContent = select ? "Alle abwählen" : "Alle auswählen";
    render();
  });
  document.querySelector("#region-toggle").addEventListener("click", event => {
    const inputs = [...els.regions.querySelectorAll("input")];
    const selectAll = state.regions.size !== state.data.regions.length;
    state.regions = new Set(selectAll ? state.data.regions : ["Bundestag"]);
    inputs.forEach(input => input.checked = state.regions.has(input.value));
    event.currentTarget.textContent = selectAll ? "Nur Bundestag" : "Alle auswählen";
    updatePollOptions(true);
    render();
  });
}

function setPollTimeMode(mode) {
  state.pollTimeMode = ["current", "from", "free"].includes(mode) ? mode : "current";
  state.pollDateMode = state.pollTimeMode !== "current";
  const picker = document.querySelector(".poll-picker");
  picker?.classList.toggle("date-mode", state.pollDateMode);
  picker?.setAttribute("data-poll-time-mode", state.pollTimeMode);
  document.querySelectorAll("[data-poll-time-mode]").forEach(button => {
    if (button.tagName !== "BUTTON") return;
    const active = button.dataset.pollTimeMode === state.pollTimeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updatePollOptions(reset = false) {
  if (reset) {
    state.pollRankOverrides = [0, 1, 2];
    state.pollDateLabels = [null, null, null];
  }
  if (reset || !state.selectedPollRanks.size) state.selectedPollRanks = new Set([0]);
  els.polls.replaceChildren();
  const singleRegion = state.regions.size === 1 ? [...state.regions][0] : null;
  const referenceRegion = [...state.regions][0];
  const regionPolls = referenceRegion ? (state.data.polls[referenceRegion] || []) : [];
  [0, 1, 2].forEach(index => {
    const matchingBaseRank = state.pollDateLabels[0] ? regionPolls.findIndex(item => item.date <= state.pollDateLabels[0]) : 0;
    const baseRank = matchingBaseRank < 0 ? Math.max(0, regionPolls.length - 1) : matchingBaseRank;
    const rank = state.pollTimeMode === "from"
      ? baseRank + index
      : state.pollTimeMode === "free"
        ? (state.pollRankOverrides[index] ?? index)
        : index;
    const poll = regionPolls[rank];
    const wrap = document.createElement("div");
    wrap.className = "poll-option-row";
    wrap.style.setProperty("--poll-opacity", [1, .62, .34][index]);
    const id = `poll-${index}`;
    const detail = singleRegion && poll ? `${poll.institute} · ${formatDate(poll.date)}` : `für jedes ausgewählte Parlament`;
    const expandedDetail = singleRegion && poll ? [poll.client, poll.institute, formatDate(poll.date)].filter(Boolean).join(" · ") : detail;
    const heading = state.pollTimeMode === "free" && poll
      ? formatDate(state.pollDateLabels[index] || poll.date)
      : state.pollTimeMode === "from"
        ? (index === 0 ? "Jüngste ab Stichtag" : `${index + 1}. jüngste ab Stichtag`)
        : index === 0 ? "Neueste" : `${index + 1}. jüngste`;
    const calendarValue = state.pollDateLabels[index] || poll?.date || "";
    const calendarEnabled = regionPolls.length && (state.pollTimeMode === "free" || (state.pollTimeMode === "from" && index === 0));
    wrap.innerHTML = `<div class="poll-calendar-wrap"><button class="poll-calendar-button" type="button" aria-label="Datum für ${index === 0 ? "neueste" : `${index + 1}. jüngste`} Umfrage wählen" ${calendarEnabled ? "" : "disabled"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z"/></svg></button><div class="poll-calendar-popover" hidden><input class="poll-date-input" type="date" min="1996-01-01" max="${regionPolls[0]?.date || ""}" value="${calendarValue}"></div></div><div class="choice poll-choice"><input id="${id}" type="checkbox" value="${index}" ${state.selectedPollRanks.has(index) ? "checked" : ""}><label for="${id}"><span><strong>${heading}</strong><small class="poll-basic-detail">${detail}</small><small class="poll-tab-detail">${expandedDetail}</small></span></label></div>`;
    const input = wrap.querySelector(".poll-choice > input");
    input.addEventListener("change", () => {
      if (input.checked) state.selectedPollRanks.add(index); else state.selectedPollRanks.delete(index);
      if (!state.selectedPollRanks.size) {
        state.selectedPollRanks.add(index);
        input.checked = true;
      }
      render();
    });
    const calendarButton = wrap.querySelector(".poll-calendar-button");
    const popover = wrap.querySelector(".poll-calendar-popover");
    calendarButton.addEventListener("click", event => {
      event.stopPropagation();
      document.querySelectorAll(".poll-calendar-popover").forEach(panel => { if (panel !== popover) panel.hidden = true; });
      popover.hidden = !popover.hidden;
      calendarButton.setAttribute("aria-expanded", String(!popover.hidden));
    });
    popover.addEventListener("click", event => event.stopPropagation());
    const dateInput = wrap.querySelector(".poll-date-input");
    dateInput.addEventListener("change", event => {
      const chosen = event.currentTarget.value;
      const matchingRank = regionPolls.findIndex(item => item.date <= chosen);
      const nextRank = matchingRank < 0 ? regionPolls.length - 1 : matchingRank;
      if (nextRank < 0) return;
      if (state.pollTimeMode === "from") {
        state.pollRankOverrides = [nextRank, nextRank + 1, nextRank + 2];
        state.pollDateLabels = [chosen, null, null];
      } else {
        state.pollRankOverrides[index] = nextRank;
        state.pollDateLabels[index] = chosen;
      }
      updatePollOptions(false);
      render();
      if (state.pollTimeMode === "free" && index === 0) {
        const firstPopover = els.polls.querySelector(".poll-calendar-popover");
        const firstButton = els.polls.querySelector(".poll-calendar-button");
        if (firstPopover) firstPopover.hidden = false;
        firstButton?.setAttribute("aria-expanded", "true");
      }
    });
    els.polls.append(wrap);
  });
}

function selectedPollEntries(region = null) {
  const polls = region ? (state.data?.polls?.[region] || []) : null;
  return [...state.selectedPollRanks].sort().map(slot => {
    let rank = slot;
    const chosenDate = state.pollTimeMode === "from" ? state.pollDateLabels[0] : state.pollDateLabels[slot];
    if (state.pollTimeMode !== "current" && polls && chosenDate) {
      const matchingRank = polls.findIndex(poll => poll.date <= chosenDate);
      const baseRank = matchingRank < 0 ? Math.max(0, polls.length - 1) : matchingRank;
      rank = state.pollTimeMode === "from" ? baseRank + slot : baseRank;
    } else if (state.pollTimeMode === "free") rank = state.pollRankOverrides[slot] ?? slot;
    return { slot, rank };
  });
}

function savedPollSelection() {
  return {
    mode: state.pollTimeMode,
    dateMode: state.pollDateMode,
    rankOverrides: state.pollRankOverrides.slice(0, 3),
    dateLabels: state.pollDateLabels.slice(0, 3)
  };
}

function restoreSavedPollSelection(selection) {
  if (!selection || typeof selection !== "object") return;
  setPollTimeMode(selection.mode || (selection.dateMode ? "free" : "current"));
  state.pollRankOverrides = [0, 1, 2].map((fallback, index) => {
    const rank = Number(selection.rankOverrides?.[index]);
    return Number.isInteger(rank) && rank >= 0 ? rank : fallback;
  });
  state.pollDateLabels = [0, 1, 2].map(index => /^\d{4}-\d{2}-\d{2}$/.test(selection.dateLabels?.[index] || "") ? selection.dateLabels[index] : null);
  updatePollOptions(false);
  render(false);
}

function pollSelectionLabel(slot, rank, plural = false) {
  if (state.pollTimeMode !== "current") {
    const referenceRegion = [...state.regions][0];
    const poll = (state.data?.polls?.[referenceRegion] || [])[rank];
    const date = state.pollTimeMode === "from" ? state.pollDateLabels[0] : state.pollDateLabels[slot] || poll?.date;
    if (!date) return "Gewählter Zeitpunkt";
    if (state.pollTimeMode === "from") {
      const rankLabel = slot === 0 ? "Jüngste" : `${slot + 1}. jüngste`;
      return `${rankLabel}${plural ? " Umfragen" : " Umfrage"} ab ${formatDate(date)}`;
    }
    return `${plural ? "Umfragen vom" : "Umfrage vom"} ${formatDate(date)}`;
  }
  if (slot === 0) return plural ? "Neueste Umfragen" : "Neueste";
  return plural ? `${slot + 1}. jüngste Umfragen` : `${slot + 1}. jüngste`;
}

function pollValueKeys() {
  return [...new Set([...(state.data?.parties || []), ...state.otherParties])];
}

function selectedOtherPartyValues(poll) {
  return [...state.otherParties]
    .map(party => ({ party, value: Number(poll?.values?.[party] || 0) }))
    .filter(entry => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.party.localeCompare(b.party, "de"));
}

document.addEventListener("click", () => {
  document.querySelectorAll(".poll-calendar-popover").forEach(panel => { panel.hidden = true; });
});

document.querySelectorAll("[data-poll-time-mode]").forEach(button => button.addEventListener("click", event => {
  setPollTimeMode(event.currentTarget.dataset.pollTimeMode);
  if (state.data) {
    updatePollOptions(false);
    render();
  }
}));

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
  scene.bars.forEach(({ top, side, shadow, x, y, width, baseline, maxDepth, value }) => {
    const barCenter = x + width / 2;
    const distance = Math.min(1, Math.abs(center - barCenter) / Math.max(1, els.scroll.clientWidth / 2));
    const dx = Math.sign(center - barCenter || 1) * maxDepth * (.35 + distance * .65);
    const dy = Math.min(6, Math.max(2.5, width * .11));
    const topDepthY = !scene.desktopVanishingPoint
      ? -dy
      : value <= 10
        ? -dy
        : value < 18
          ? 0
          : value < 25
            ? dy
            : dy * 1.45;
    const baselineDepthY = scene.desktopVanishingPoint ? Math.sign(scene.vanishY - baseline) * dy : -dy;
    if (shadow) {
      shadow.setAttribute("cx", x + width / 2 + dx * 1.25);
      shadow.setAttribute("cy", baseline + Math.max(2, Math.abs(baselineDepthY) * .8));
    }
    top.setAttribute("points", `${x},${y} ${x + dx},${y + topDepthY} ${x + width + dx},${y + topDepthY} ${x + width},${y}`);
    const edgeX = dx >= 0 ? x + width : x;
    side.setAttribute("points", `${edgeX},${y} ${edgeX + dx},${y + topDepthY} ${edgeX + dx},${baseline + baselineDepthY} ${edgeX},${baseline}`);
  });
}

function exportDepthY(value, depth) {
  if (value <= 10) return -depth;
  if (value < 18) return 0;
  if (value < 25) return depth;
  return depth * 1.45;
}

function prepareChartExport3d(chart) {
  const tops = [...chart.querySelectorAll(".bar-top")];
  const sides = [...chart.querySelectorAll(".bar-side")];
  if (!state.export3d) {
    [...tops, ...sides].forEach(face => face.remove());
    return chart;
  }
  tops.forEach((top, index) => {
    const side = sides[index];
    if (!side) return;
    const x = Number(top.dataset.barX), y = Number(top.dataset.barY), width = Number(top.dataset.barWidth);
    const baseline = Number(top.dataset.baseline), value = Number(top.dataset.value), clusterCenter = Number(top.dataset.clusterCenter);
    const depthX = Math.min(8, Math.max(4, width * .16));
    const dx = Math.max(-depthX, Math.min(depthX, (clusterCenter - (x + width / 2)) * .12));
    const depth = Math.min(6, Math.max(2.5, width * .11));
    const topDepthY = exportDepthY(value, depth);
    const baselineDepthY = -depth;
    top.setAttribute("points", `${x},${y} ${x + dx},${y + topDepthY} ${x + width + dx},${y + topDepthY} ${x + width},${y}`);
    const edgeX = dx >= 0 ? x + width : x;
    side.setAttribute("points", `${edgeX},${y} ${edgeX + dx},${y + topDepthY} ${edgeX + dx},${baseline + baselineDepthY} ${edgeX},${baseline}`);
  });
  return chart;
}

function formatPercent(value, signed = false, omitZeroDecimal = false) {
  const numeric = Math.abs(Number(value));
  const absolute = (omitZeroDecimal && Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)).replace(".", ",");
  if (!signed) return `${absolute} %`;
  if (Math.abs(value) < .05) return "±0,0";
  return `${value > 0 ? "+" : "−"}${absolute}`;
}

const labelModeOptions = {
  rotation: [["0", "0°"], ["90", "90°"], ["auto", "Auto"], ["off", "Aus"]],
  percent: [["with", "Mit %"], ["without", "Ohne %"], ["off", "Aus"]],
  since: [["color", "Farbig"], ["gray", "Grau"], ["off", "Aus"]]
};
let yAxisMode = "dynamic";
function updateYAxisPosition() {
  const layer = els.chart.querySelector(".y-axis-layer");
  const overlay = document.querySelector("#static-y-axis");
  if (!layer || !overlay) return;
  const staticMode = yAxisMode === "static";
  layer.style.visibility = staticMode ? "hidden" : "visible";
  overlay.hidden = !staticMode;
  if (!staticMode) {
    overlay.replaceChildren();
    return;
  }
  const chartHeight = Number(layer.dataset.chartHeight);
  const visibleWidth = Math.max(1, els.scroll.clientWidth);
  overlay.style.width = `${visibleWidth}px`;
  overlay.style.height = `${chartHeight}px`;
  const frameRect = overlay.parentElement.getBoundingClientRect();
  const scrollRect = els.scroll.getBoundingClientRect();
  overlay.style.left = `${scrollRect.left - frameRect.left}px`;
  overlay.style.top = `${scrollRect.top - frameRect.top}px`;
  const axisX = Number(layer.dataset.axisX);
  const axisTop = Number(layer.dataset.axisTop);
  const axisBottom = Number(layer.dataset.axisBottom);
  const innerHeight = Number(layer.dataset.innerHeight);
  const yMax = Number(layer.dataset.yMax);
  const compact = layer.dataset.compact === "true";
  overlay.classList.toggle("is-compact", compact);
  overlay.style.setProperty("--axis-x", `${axisX}px`);
  overlay.style.setProperty("--axis-label-x", `${compact ? axisX + 7 : axisX - 10}px`);
  overlay.style.setProperty("--axis-top", `${axisTop}px`);
  overlay.style.setProperty("--axis-bottom", `${Math.max(0, chartHeight - axisBottom)}px`);
  overlay.style.setProperty("--axis-font-size", compact ? "10px" : "12px");
  const line = document.createElement("span");
  line.className = "static-y-axis-line";
  const labels = [];
  for (let tick = 0; tick <= yMax; tick += 10) {
    const label = document.createElement("span");
    label.className = "static-y-axis-label";
    label.style.top = `${axisTop + innerHeight - (tick / yMax) * innerHeight}px`;
    label.textContent = `${tick} %`;
    labels.push(label);
  }
  const legends = [...layer.querySelectorAll(".chart-legend")].map(source => {
    const legend = document.createElement("span");
    legend.className = "static-y-axis-legend";
    legend.style.left = `${Number(source.getAttribute("x"))}px`;
    legend.style.top = `${Number(source.getAttribute("y"))}px`;
    legend.style.transform = compact ? "translate(-50%, -50%)" : "translate(-100%, -50%)";
    legend.textContent = source.textContent;
    return legend;
  });
  overlay.replaceChildren(line, ...labels, ...legends);
}
function setCycleButton(button, value, options) {
  const option = options.find(([key]) => key === value) || options[0];
  button.dataset.value = option[0];
  const valueNode = button.querySelector(".label-option-value");
  if (valueNode) valueNode.textContent = option[1];
  else button.textContent = option[1];
}

function setLabelsEnabled(enabled) {
  state.showLabels = Boolean(enabled);
  if (els?.showLabels) els.showLabels.checked = state.showLabels;
  if (!state.showLabels) {
    state.showSinceElection = false;
    state.sinceElectionMode = "off";
    if (els?.showSinceElection) els.showSinceElection.checked = false;
    if (els?.sinceElectionMode) setCycleButton(els.sinceElectionMode, "off", labelModeOptions.since);
  }
}
function advanceCycleButton(button, options) {
  const index = options.findIndex(([key]) => key === button.dataset.value);
  const option = options[(index + 1 + options.length) % options.length];
  setCycleButton(button, option[0], options);
  return option[0];
}

function partyDisplayLabel(party, region, poll = null) {
  if (party === "LINKE") {
    const pollDate = typeof poll === "string" ? poll : poll?.date;
    return pollDate && pollDate < "2007-06-16" ? "PDS (LINKE)" : "LINKE";
  }
  if (party !== "CDU/CSU") return party;
  if (region === "Bundestag") return "CDU/CSU";
  return region === "Bayern" ? "CSU" : "CDU";
}

function partyDisplayLabelForPolls(party, polls) {
  return party === "LINKE" && polls.length && polls.every(poll => poll?.date && poll.date < "2007-06-16")
    ? "PDS (LINKE)"
    : party;
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

let barVisibilityAnimation = 0;
function setBarsEnabled(enabled) {
  if (state.barColors === enabled) return;
  const animation = ++barVisibilityAnimation;
  state.barColors = enabled;
  els.showBarColors.checked = enabled;
  if (enabled) {
    state.chartLayout = new Map();
    render(true);
    return;
  }
  const shapes = [...els.chart.querySelectorAll(".bar, .bar-glow, .bar-side, .bar-top")];
  if (!shapes.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    render(false);
    return;
  }
  shapes.forEach(shape => {
    shape.style.transformBox = "fill-box";
    shape.style.transformOrigin = "center bottom";
    shape.animate(
      [{ transform: "scaleY(1)", opacity: 1 }, { transform: "scaleY(0)", opacity: 0 }],
      { duration: 620, easing: "cubic-bezier(.55, 0, .84, .18)", fill: "forwards" }
    );
  });
  window.setTimeout(() => { if (animation === barVisibilityAnimation && !state.barColors) render(false); }, 640);
}

function currentViewScale(axis = "y") {
  const value = Number(state.viewScales[state.mobileView ? "mobile" : "desktop"]?.[axis]);
  const minimum = axis === "x" ? .4 : .6;
  const maximum = axis === "x" ? 3 : 1.8;
  return state.viewSizeEnabled && state.viewZoomEnabled && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : 1;
}

function setViewScale(axis, next) {
  const platform = state.mobileView ? "mobile" : "desktop";
  const minimum = axis === "x" ? .4 : .6;
  const maximum = axis === "x" ? 3 : 1.8;
  state.viewScales[platform][axis] = Math.max(minimum, Math.min(maximum, Math.round(next * 10) / 10));
  localStorage.setItem("view-scales", JSON.stringify(state.viewScales));
  render(false);
}

function render(animate = true) {
  applyViewMode();
  updateSelectionOrderBadges();
  const backgroundVisible = state.showLut && state.showBackground;
  els.chartSection.classList.toggle("mobile-view", state.mobileView);
  els.chartSection.classList.toggle("hide-chart-background", !backgroundVisible);
  els.chartSection.classList.toggle("view-3d-active", state.export3d);
  updateComparisonButtons();
  updateElectionVisibility();
  const selectedRegions = [...state.regions];
  const rawSeries = selectedRegions.flatMap(region => selectedPollEntries(region).map(({ slot, rank }) => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank: slot, sourceRank: rank, poll } : null;
  }).filter(Boolean));
  const series = state.averageMode ? selectedRegions.map(region => {
    const items = rawSeries.filter(item => item.region === region);
    if (!items.length) return null;
    const values = Object.fromEntries(pollValueKeys().map(party => [party, items.reduce((sum, item) => sum + Number(item.poll.values[party] || 0), 0) / items.length]));
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

  const compact = state.mobileView;
  const regionRunCounts = selectedRegions.map(region => series.filter(item => item.region === region).length);
  const needsVerticalRegionNames = state.fullRegionNames && selectedRegions.length > 1 && state.groupBy === "party" && regionRunCounts.some(count => compact ? count < 3 : count === 1);
  // On phones the scale sits on the actual edge while the bars retain a small
  // inset, so the first bar never collides with the tick labels.
  const axisX = compact ? 1 : 160;
  const longestRegion = Math.max(0, ...selectedRegions.map(region => (state.fullRegionNames ? region : REGION_CODES[region]).replace("-", "").length));
  const regionSpace = needsVerticalRegionNames ? Math.max(58, Math.min(126, longestRegion * (compact ? 4.1 : 5.2))) : 24;
  const partySpace = compact ? 54 : 38;
  const margin = { top: 62, right: compact ? 12 : 34, bottom: 58 + regionSpace + partySpace, left: compact ? 48 : 160 };
  const totalBarCount = parties.length * series.length;
  const desktopModeOnMobileDevice = startsMobile && !state.mobileView;
  const availableWidth = Math.max(desktopModeOnMobileDevice ? 1500 : 320, els.scroll.clientWidth - 2);
  const visibleBarLimit = compact ? 9 : 20;
  const visiblePlotWidth = availableWidth - margin.left - margin.right;
  const baseWidth = totalBarCount <= visibleBarLimit
    ? availableWidth
    : Math.max(availableWidth, margin.left + margin.right + visiblePlotWidth * (totalBarCount / visibleBarLimit));
  const horizontalScale = currentViewScale("x");
  const width = Math.max(availableWidth, margin.left + margin.right + (baseWidth - margin.left - margin.right) * horizontalScale);
  const fullscreenHeight = document.body.classList.contains("view-fullscreen-active") ? window.innerHeight : 0;
  const height = Math.max(compact ? 520 : 590, fullscreenHeight);
  const innerH = height - margin.top - margin.bottom;
  const baselineY = margin.top + innerH;
  const floorBackY = baselineY - (compact ? 18 : 44);
  const floorFrontY = Math.min(height - 2, baselineY + (compact ? 72 : 142));
  if (compact) els.scroll.style.setProperty("--mobile-floor-y", `${baselineY - 55}px`);
  else els.scroll.style.removeProperty("--mobile-floor-y");
  const chartW = width - margin.left - margin.right;
  const groupedBars = state.groupBy === "region"
    ? selectedRegions.map(region => ({ key: `region:${region}`, bars: parties.flatMap(party => series.filter(item => item.region === region).map(item => ({ party, item }))) })).filter(group => group.bars.length)
    : parties.map(party => ({ key: `party:${party}`, bars: series.map(item => ({ party, item })) }));
  const groupWidth = chartW / groupedBars.length;
  const maxValue = Math.max(50, ...series.flatMap(item => parties.map(party => item.poll.values[party] || 0)));
  const verticalScale = currentViewScale("y");
  const yMax = Math.ceil(maxValue / 10) * 10 / verticalScale;
  els.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.chart.setAttribute("width", Math.round(width));
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
    <filter id="star-wide" x="-300%" y="-300%" width="700%" height="700%"><feGaussianBlur stdDeviation="4.8"/></filter>
    <filter id="bar-floor-shadow" x="-80%" y="-500%" width="260%" height="1100%"><feGaussianBlur stdDeviation="4.5"/></filter>` + parties.map((party, index) => {
    const glow = barVisual(party).stroke;
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
  if (!state.barNeon) defs.innerHTML += parties.map((party, index) => {
    const visual = barVisual(party);
    const softLight = mixHexColors(visual.base, visual.light, .34);
    return `<radialGradient id="matte-bar-${index}" cx="15%" cy="-8%" r="190%" fx="15%" fy="-8%"><stop offset="0" stop-color="${softLight}"/><stop offset=".58" stop-color="${visual.base}"/><stop offset=".82" stop-color="${visual.base}"/><stop offset="1" stop-color="${visual.dark}"/></radialGradient>`;
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
  if (backgroundVisible) els.chart.append(stars);

  const use3dGrid = state.export3d && backgroundVisible;
  const floor = svgEl("g", { class: "perspective-floor", "aria-hidden": "true" });
  const floorLeft = axisX;
  const floorRight = width - margin.right;
  const floorCenter = (floorLeft + floorRight) / 2;
  const floorBackScale = use3dGrid ? .82 : compact ? .86 : .82;
  const floorFrontScale = use3dGrid ? 1.4 : compact ? 1.62 : 1.4;
  const perspectiveFloorLines = [];
  const perspectiveFloorRows = [];
  for (let index = 0; index <= 18; index += 1) {
    const axisPointX = floorLeft + ((floorRight - floorLeft) * index) / 18;
    const backgroundX = floorCenter + (axisPointX - floorCenter) * floorBackScale;
    const foregroundX = floorCenter + (axisPointX - floorCenter) * floorFrontScale;
    const line = svgEl("line", {
      x1: backgroundX, y1: floorBackY, x2: foregroundX, y2: floorFrontY,
      stroke: "url(#floor-line-fade)", "stroke-width": use3dGrid ? 1 : compact ? .8 : 1
    });
    floor.append(line);
    perspectiveFloorLines.push({ line, axisX: axisPointX, ratio: index / 18 });
  }
  const floorRows = [
    [floorBackY, floorBackScale],
    [baselineY - (use3dGrid ? 29 : compact ? 12 : 29), use3dGrid ? .88 : compact ? .91 : .88],
    [baselineY - (use3dGrid ? 14 : compact ? 6 : 14), use3dGrid ? .94 : compact ? .955 : .94],
    [baselineY, 1],
    [baselineY + (use3dGrid ? 50 : compact ? 36 : 50), use3dGrid ? 1.14 : compact ? 1.31 : 1.14],
    [floorFrontY, floorFrontScale]
  ];
  floorRows.forEach(([y, scale], index) => {
    const rowLeft = floorCenter + (floorLeft - floorCenter) * scale;
    const rowRight = floorCenter + (floorRight - floorCenter) * scale;
    const line = svgEl("line", {
      x1: rowLeft, y1: y, x2: rowRight, y2: y,
      stroke: "url(#floor-line-fade)", "stroke-width": use3dGrid ? 1 : compact ? .8 : 1,
      ...(index === 0 || index === floorRows.length - 1 ? { filter: "url(#floor-soft)" } : {})
    });
    floor.append(line);
    perspectiveFloorRows.push({ line, scale });
  });
  if (!use3dGrid) {
    perspectiveFloorLines.length = 0;
    perspectiveFloorRows.length = 0;
  } else {
    els.chart.append(floor);
  }

  let yAxisLayer = null;
  if (state.showLut) {
    yAxisLayer = svgEl("g", { class: "y-axis-layer", "data-axis-x": axisX, "data-axis-top": margin.top, "data-axis-bottom": height - 18, "data-inner-height": innerH, "data-y-max": yMax, "data-chart-height": height, "data-compact": compact });
    for (let tick = 0; tick <= yMax; tick += 10) {
      const y = margin.top + innerH - (tick / yMax) * innerH;
      els.chart.append(svgEl("line", { x1: axisX, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgEl("text", { x: compact ? axisX + 7 : axisX - 10, y: y + 4, "text-anchor": compact ? "start" : "end", class: "axis-label" });
      label.textContent = `${tick} %`;
      if (yAxisMode !== "off") yAxisLayer.append(label);
    }
    if (yAxisMode !== "off") {
      yAxisLayer.append(svgEl("line", { x1: axisX, x2: axisX, y1: margin.top, y2: height - 18, class: "axis-line" }));
      els.chart.append(yAxisLayer);
    }
  }

  const maxBarsPerGroup = Math.max(...groupedBars.map(group => group.bars.length));
  const secondaryBlockKey = ({ party, item }) => state.groupBy === "party" ? item.region : party;
  const blockBreakCount = bars => bars.slice(1).reduce((count, bar, index) => count + (secondaryBlockKey(bar) !== secondaryBlockKey(bars[index]) ? 1 : 0), 0);
  const maxBlockBreaks = Math.max(0, ...groupedBars.map(group => blockBreakCount(group.bars)));
  const blockGap = maxBlockBreaks ? Math.max(6, Math.min(14, groupWidth * .022)) : 0;
  const availablePerBar = (groupWidth - Math.min(30, groupWidth * .12) - maxBlockBreaks * blockGap) / maxBarsPerGroup;
  const barGap = maxBarsPerGroup === 1 ? 0 : Math.max(5, Math.min(20, 23 - totalBarCount * 1.35));
  const maxBarWidth = totalBarCount === 1 ? 280 : totalBarCount <= 3 ? 150 : totalBarCount <= 6 ? 92 : totalBarCount <= 10 ? 58 : totalBarCount <= 20 ? 38 : availablePerBar - barGap;
  const barWidth = Math.max(totalBarCount <= 10 ? 10 : 4, Math.min(maxBarWidth * horizontalScale, availablePerBar - barGap));
  const displayedBars = [];
  const perspectiveBars = [];
  groupedBars.forEach((group, groupIndex) => {
    const center = margin.left + groupIndex * groupWidth + groupWidth / 2;
    const groupBlockBreaks = blockBreakCount(group.bars);
    const totalBars = group.bars.length * barWidth + (group.bars.length - 1) * barGap + groupBlockBreaks * blockGap;
    const startX = center - totalBars / 2;
    const sonstigeBars = group.bars.filter(entry => entry.party === "Sonstige");
    const sonstigeTop = sonstigeBars.length ? Math.min(...sonstigeBars.map(entry => margin.top + innerH - (Number(entry.item.poll.values.Sonstige || 0) / yMax) * innerH)) : 0;
    let passedBlockBreaks = 0;
    group.bars.forEach(({ party, item }, barIndex) => {
      const partyIndex = parties.indexOf(party);
      const key = `${party}|${item.region}|${item.average ? "average" : item.rank}`;
      const old = oldLayout.get(key);
      const value = Number(item.poll.values[party] || 0);
      const election = state.data.elections?.[item.region];
      const baseline = Number(election?.values?.[party] || 0);
      const delta = value - baseline;
      const isNew = !election?.represented?.includes(party) && value >= 5 && party !== "Sonstige";
      const h = state.barColors ? (value / yMax) * innerH : 0;
      if (barIndex > 0 && secondaryBlockKey(group.bars[barIndex]) !== secondaryBlockKey(group.bars[barIndex - 1])) passedBlockBreaks += 1;
      const x = startX + barIndex * (barWidth + barGap) + passedBlockBreaks * blockGap;
      const y = margin.top + innerH - h;
      const fillOpacity = item.average ? (state.barNeon ? .68 : 1) : (state.barNeon ? [.68, .34, .16][item.rank] : [1, .46, .24][item.rank]);
      const strokeOpacity = item.average ? 1 : [1, .78, .56][item.rank];
      const visual = barVisual(party);
      const frontFill = state.barNeon ? visual.fill : `url(#matte-bar-${partyIndex})`;
      const glowOutline = svgEl("rect", {
        x, y, width: barWidth, height: h,
        fill: "none",
        stroke: state.barNeon ? visual.stroke : "none",
        "stroke-opacity": state.barNeon ? strokeOpacity : 0,
        ...(state.barNeon ? { filter: `url(#bar-glow-${partyIndex})` } : {}),
        class: "bar-glow", rx: 3
      });
      const depthX = Math.min(8, Math.max(4, barWidth * .16));
      const depthY = Math.min(6, Math.max(2.5, barWidth * .11));
      const shadow = h > 0 && state.export3d ? svgEl("ellipse", {
        cx: x + barWidth / 2 + depthX, cy: margin.top + innerH + depthY * .8,
        rx: Math.max(7, barWidth * .82), ry: Math.max(2.2, barWidth * .13),
        fill: "#010611", "fill-opacity": state.barNeon ? Math.max(.18, fillOpacity * .48) : .34,
        filter: "url(#bar-floor-shadow)", class: "bar-floor-shadow"
      }) : null;
      const faces = h <= 0 || !state.export3d ? [] : [
        svgEl("polygon", {
          points: `${x + barWidth},${y} ${x + barWidth + depthX},${y - depthY} ${x + barWidth + depthX},${margin.top + innerH - depthY} ${x + barWidth},${margin.top + innerH}`,
          fill: state.barNeon ? visual.fill : visual.dark, stroke: state.barNeon ? visual.stroke : "#f4f7fb",
          "fill-opacity": state.barNeon ? fillOpacity * .42 : 1, "stroke-opacity": state.barNeon ? strokeOpacity * .72 : .16,
          "stroke-width": state.barNeon ? 1.1 : .01, class: "bar-side"
        }),
        svgEl("polygon", {
          points: `${x},${y} ${x + depthX},${y - depthY} ${x + barWidth + depthX},${y - depthY} ${x + barWidth},${y}`,
          fill: state.barNeon ? visual.stroke : visual.light, stroke: state.barNeon ? visual.stroke : "#f4f7fb",
          "fill-opacity": state.barNeon ? fillOpacity * .62 : 1, "stroke-opacity": state.barNeon ? strokeOpacity * .86 : .16,
          "stroke-width": state.barNeon ? 1.1 : .01, class: "bar-top",
          "data-bar-x": x, "data-bar-y": y, "data-bar-width": barWidth,
          "data-baseline": margin.top + innerH, "data-value": value, "data-cluster-center": center
        })
      ];
      if (faces.length) {
        ["barX", "barY", "barWidth", "baseline", "value", "clusterCenter"].forEach(key => { faces[0].dataset[key] = faces[1].dataset[key]; });
      }
      if (faces.length) perspectiveBars.push({ top: faces[1], side: faces[0], shadow, x, y, width: barWidth, baseline: margin.top + innerH, maxDepth: depthX, value });
      const bar = svgEl("rect", {
        x, y, width: barWidth, height: h,
        fill: frontFill,
        stroke: state.barNeon ? visual.stroke : "#f4f7fb",
        "fill-opacity": fillOpacity,
        "stroke-opacity": state.barNeon ? strokeOpacity : .16,
        "stroke-width": state.barNeon ? 1 : .025,
        class: `bar${state.barNeon ? "" : " matte-bar"}`, rx: state.barNeon ? 3 : 0
      });
      bar.addEventListener("pointermove", event => showTooltip(event, item.region, item.poll, partyDisplayLabel(party, item.region, item.poll), value));
      bar.addEventListener("pointerleave", hideTooltip);
      els.chart.append(...(shadow ? [shadow] : []), glowOutline, ...faces, bar);
      if (old) {
        if (shadow) animateX(shadow, old.x, x, motionEnabled);
        animateX(glowOutline, old.x, x, motionEnabled);
        faces.forEach(face => animateX(face, old.x, x, motionEnabled));
        animateX(bar, old.x, x, motionEnabled);
      } else {
        if (shadow) fadeIn(shadow, motionEnabled, newBarDelay);
        growBar(glowOutline, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay);
        faces.forEach(face => growBar(face, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay));
        growBar(bar, x + barWidth / 2, margin.top + innerH, 1, motionEnabled, newBarDelay);
      }
      if (party === "Sonstige" && state.otherParties.size) {
        const extraValues = selectedOtherPartyValues(item.poll);
        if (extraValues.length) {
          const lineHeight = compact ? 11 : 13;
          const boxWidth = compact ? 92 : 112;
          const boxHeight = 8 + extraValues.length * lineHeight;
          const annotationIndex = group.bars.slice(0, barIndex).filter(entry => entry.party === "Sonstige").length;
          const slotHeight = 8 + state.otherParties.size * lineHeight + 5;
          const stackHeight = sonstigeBars.length * slotHeight;
          const staggerX = (annotationIndex - (sonstigeBars.length - 1) / 2) * (compact ? 9 : 14);
          const boxX = Math.max(axisX + 3, Math.min(width - margin.right - boxWidth - 3, center - boxWidth / 2 + staggerX));
          const boxY = Math.max(5, sonstigeTop - stackHeight - (state.showPercentValues ? 24 : 10) + annotationIndex * slotHeight);
          const detailGroup = svgEl("g", { class: "other-party-values" });
          detailGroup.append(svgEl("path", {
            d: `M ${boxX + boxWidth / 2} ${boxY + boxHeight} L ${x + barWidth / 2} ${Math.max(boxY + boxHeight + 2, y - 3)}`,
            class: "other-party-value-link"
          }));
          detailGroup.append(svgEl("rect", { x: boxX, y: boxY, width: boxWidth, height: boxHeight, rx: 5, class: "other-party-values-bg" }));
          extraValues.forEach((entry, extraIndex) => {
            const lineY = boxY + 7 + extraIndex * lineHeight + lineHeight / 2;
            detailGroup.append(svgEl("circle", { cx: boxX + 8, cy: lineY - 1, r: compact ? 2 : 2.4, fill: OTHER_PARTIES[entry.party].color }));
            const text = svgEl("text", { x: boxX + 14, y: lineY + 2, class: "other-party-value-text" });
            text.textContent = `${OTHER_PARTIES[entry.party].label} ${formatPercent(entry.value, false, compact)}`;
            detailGroup.append(text);
          });
          els.chart.append(detailGroup);
          old ? animateX(detailGroup, old.center, x + barWidth / 2, motionEnabled) : fadeIn(detailGroup, motionEnabled, newLabelDelay);
        }
      }
      if (state.showPercentValues) {
        const valueLabel = svgEl("text", { x: x + barWidth / 2, y: Math.max(margin.top - 9, y - 10), "text-anchor": "middle", class: "bar-value" });
        const percentText = formatPercent(value, false, compact);
        valueLabel.textContent = `${item.average ? "Ø " : ""}${state.percentLabelMode === "with" ? percentText : percentText.replace(" %", "")}`;
        els.chart.append(valueLabel);
        old ? animateX(valueLabel, old.center, x + barWidth / 2, motionEnabled) : fadeIn(valueLabel, motionEnabled, newLabelDelay);
      }
      if (state.showSinceElection) {
        const deltaLabel = svgEl("text", { x: x + barWidth / 2, y: margin.top + innerH + 20, "text-anchor": "middle", class: `bar-delta ${state.sinceElectionMode === "gray" ? "gray" : delta >= 0 ? "positive" : "negative"}` });
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
      }
      displayedBars.push({ region: item.region, party, item, center: x + barWidth / 2 });
      nextLayout.set(key, { x, center: x + barWidth / 2 });
    });
    nextLayout.set(group.key, { center });
  });

  if (state.showBrackets) {
    let start = 0;
    while (start < displayedBars.length) {
      let end = start + 1;
      while (end < displayedBars.length && displayedBars[end].party === displayedBars[start].party && displayedBars[end].region === displayedBars[start].region) end += 1;
      if (end - start > 1) {
        const y = baselineY + (state.showSinceElection ? 32 : 12);
        els.chart.append(svgEl("path", { d: `M ${displayedBars[start].center - barWidth * .62} ${y - 5} V ${y} H ${displayedBars[end - 1].center + barWidth * .62} V ${y - 5}`, fill: "none", stroke: "#7693b4", "stroke-opacity": .72, "stroke-width": 1.15, class: "bar-bracket" }));
      }
      start = end;
    }
  }

  const appendGroupedLabels = (labelFor, y, className, labelKind = "party") => {
    const labelMode = labelKind === "region" ? state.regionLabelMode : state.partyLabelMode;
    if (labelMode === "off") return;
    let start = 0;
    while (start < displayedBars.length) {
      const text = labelFor(displayedBars[start]);
      let end = start + 1;
      while (end < displayedBars.length && labelFor(displayedBars[end]) === text) end += 1;
      const count = end - start;
      const x = (displayedBars[start].center + displayedBars[end - 1].center) / 2;
      const stackedUnion = labelKind === "party" && !compact && text === "CDU/CSU" && count === 1 && parties.length > 1;
      const rotateParty = labelKind === "party" && compact && count === 1 && !stackedUnion;
      const rotateRegion = labelKind === "region" && state.fullRegionNames && (compact ? count < 3 : count === 1 && selectedRegions.length > 1);
      const rotate = labelMode === "90" || (labelMode === "auto" && (rotateParty || rotateRegion));
      const wrapRegion = labelKind === "region" && state.fullRegionNames && count < 4 && text.includes("-");
      const label = svgEl("text", {
        x, y: stackedUnion ? y - 5 : y, "text-anchor": "middle",
        class: `${className}${compact ? ` mobile-${className}` : ""}`,
        ...(rotate ? { transform: `rotate(-90 ${x} ${y})` } : {})
      });
      if (stackedUnion) {
        const firstLine = svgEl("tspan", { x }); firstLine.textContent = "CDU/";
        const secondLine = svgEl("tspan", { x, dy: 11 }); secondLine.textContent = "CSU";
        label.append(firstLine, secondLine);
      } else if (wrapRegion) {
        const split = text.indexOf("-") + 1;
        const firstLine = svgEl("tspan", { x }); firstLine.textContent = text.slice(0, split);
        const secondLine = svgEl("tspan", { x, dy: compact ? 9 : 12 }); secondLine.textContent = text.slice(split);
        label.append(firstLine, secondLine);
      } else label.textContent = text;
      const labelGroup = svgEl("g");
      labelGroup.append(label);
      els.chart.append(labelGroup);
      fadeIn(labelGroup, motionEnabled, newLabelDelay);
      start = end;
    }
  };
  const sinceElectionOffset = state.showSinceElection ? 0 : -20;
  const bracketOffset = state.showBrackets ? 0 : -4;
  const regionFirst = state.groupBy === "party";
  const hasSinglePartyRun = displayedBars.some((bar, index) =>
    displayedBars[index - 1]?.party !== bar.party && displayedBars[index + 1]?.party !== bar.party
  );
  const partyLabelsVertical = state.partyLabelMode === "90" ||
    (state.partyLabelMode === "auto" && compact && hasSinglePartyRun);
  const nestedPartyOffset = needsVerticalRegionNames && regionFirst ? (partyLabelsVertical ? 24 : 10) : 0;
  const regionLabelY = margin.top + innerH + (needsVerticalRegionNames
    ? (compact ? regionSpace * .55 + 26 : regionSpace + 26)
    : 48) + sinceElectionOffset + bracketOffset;
  const partyLabelY = compact && needsVerticalRegionNames
    ? margin.top + innerH + regionSpace + 28 + nestedPartyOffset + sinceElectionOffset + bracketOffset
    : margin.top + innerH + 48 + regionSpace + (compact ? 22 : 18) + nestedPartyOffset + sinceElectionOffset + bracketOffset;
  const regionLabel = bar => state.fullRegionNames ? bar.region : REGION_CODES[bar.region] || bar.region;
  const partyLabel = bar => bar.party === "CDU/CSU" && selectedRegions.length > 1 ? "CDU/CSU" : partyDisplayLabel(bar.party, bar.region, bar.item.poll);
  if (state.showLabels) {
    appendGroupedLabels(regionFirst ? regionLabel : partyLabel, regionLabelY, regionFirst ? "region-label" : "party-label", regionFirst ? "region" : "party");
    appendGroupedLabels(regionFirst ? partyLabel : regionLabel, partyLabelY, regionFirst ? "party-label" : "region-label", regionFirst ? "party" : "region");
  }
  const legendX = compact ? margin.left / 2 : margin.left - 10;
  [
    ...(state.showSinceElection ? [["Seit Wahl*", margin.top + innerH + 20]] : []),
    ...(state.showLabels ? [[regionFirst ? "Parlament" : "Partei", regionLabelY], [regionFirst ? "Partei" : "Parlament", partyLabelY]] : [])
  ].forEach(([text, y]) => {
    if (!yAxisLayer || yAxisMode === "off") return;
    const legend = svgEl("text", { x: legendX, y, "text-anchor": compact ? "middle" : "end", class: "chart-legend" });
    legend.textContent = text;
    yAxisLayer.append(legend);
  });
  if (state.showLut) {
    const unitLabel = svgEl("text", { x: (axisX + width - margin.right) / 2, y: height - 6, "text-anchor": "middle", class: "chart-unit-label" });
    unitLabel.textContent = "Werte in %";
    els.chart.append(unitLabel);
  }
  state.chartLayout = nextLayout;
  state.perspective = {
    floorLines: perspectiveFloorLines, floorRows: perspectiveFloorRows, bars: perspectiveBars,
    floorLeft, floorRight, backScale: floorBackScale, frontScale: floorFrontScale, staticFloor: false,
    desktopVanishingPoint: state.export3d,
    vanishY: baselineY - (18 / yMax) * innerH
  };
  updatePerspective();
  updateYAxisPosition();
  updateConfigurationCode();
  updateExportSummary();
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
function formatTimestamp(value) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short"
  }).format(value instanceof Date ? value : new Date(value));
}
function dataRetrievalStamp() {
  return state.data?.updatedAt ? formatTimestamp(state.data.updatedAt) : `${formatDate(state.data.updated)} · Uhrzeit nicht verfügbar`;
}

async function loadProjects() {
  const list = document.querySelector("#report-project-list");
  if (!list) return;
  list.replaceChildren();
  const { projects } = await reportRequest("/projects");
  if (!projects.length) {
    const empty = document.createElement("p");
    empty.className = "report-empty";
    empty.textContent = "Noch keine gespeicherten Projekte.";
    list.append(empty);
    return projects;
  }
  projects.forEach(project => {
    const row = document.createElement("div");
    row.className = "report-project-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "report-project-button";
    const title = document.createElement("strong");
    title.textContent = project.title;
    const detail = document.createElement("span");
    detail.textContent = project.detail;
    const meta = document.createElement("small");
    meta.textContent = `${project.configuration} · ${formatTimestamp(project.updated_at)}`;
    button.append(title, detail, meta);
    button.addEventListener("click", () => {
      applyConfigurationCode(project.configuration, { nativeLayout: true });
      restoreSavedPollSelection(project.poll_selection);
      els.inputCode.value = project.configuration;
      document.querySelector("#report-dialog").classList.remove("project-picker-dialog", "startup-project-dialog");
      document.querySelector("#report-dialog").close();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "report-project-delete";
    remove.setAttribute("aria-label", `Projekt ${project.title} löschen`);
    remove.setAttribute("title", "Projekt löschen");
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
    remove.addEventListener("click", async () => {
      if (!await confirmProjectDeletion()) return;
      remove.disabled = true;
      try {
        await reportRequest(`/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
        await loadProjects();
      } catch (error) {
        remove.disabled = false;
        document.querySelector("#project-code-message").textContent = error.message;
      }
    });
    row.append(button, remove);
    list.append(row);
  });
  return projects;
}

async function saveCurrentProject(projectName = "") {
  if (!currentReportRole || !state.data) throw new Error("Bitte zuerst anmelden.");
  const payload = {
    configuration: configurationCode(),
    pollSelection: savedPollSelection(),
    title: projectName.trim().slice(0, 100) || "Unbenannt",
    detail: document.querySelector("#chart-meta")?.textContent?.trim() || "Aktuelle Konfiguration"
  };
  const { projects } = await reportRequest("/projects");
  const existing = projects.find(project => project.configuration === payload.configuration);
  if (projects.length >= 5 && !existing) {
    const replaceId = await chooseProjectToOverwrite(projects);
    if (!replaceId) return null;
    await reportRequest(`/projects/${encodeURIComponent(replaceId)}`, { method: "PATCH", body: JSON.stringify(payload) });
  } else {
    await reportRequest("/projects", { method: "POST", body: JSON.stringify(payload) });
  }
  return payload.configuration;
}

function openProjectActionDialog({ title, message, choices = [], danger = false }) {
  const dialog = document.createElement("dialog");
  dialog.className = "project-action-dialog";
  const form = document.createElement("form");
  form.method = "dialog";
  const heading = document.createElement("strong");
  heading.textContent = title;
  form.append(heading);
  if (message) {
    const copy = document.createElement("p");
    copy.textContent = message;
    form.append(copy);
  }
  const options = document.createElement("div");
  options.className = "project-action-options";
  choices.forEach(choice => {
    const button = document.createElement("button");
    button.type = "submit";
    button.value = choice.value;
    button.textContent = choice.label;
    if (choice.danger || danger) button.classList.add("danger");
    options.append(button);
  });
  const cancel = document.createElement("button");
  cancel.type = "submit";
  cancel.value = "";
  cancel.textContent = "Abbrechen";
  cancel.className = "project-action-cancel";
  options.append(cancel);
  form.append(options);
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => {
    const result = dialog.returnValue;
    dialog.remove();
    resolve(result);
  }, { once: true }));
}

function chooseProjectToOverwrite(projects) {
  return openProjectActionDialog({
    title: "Projekt überschreiben",
    message: "Es bestehen bereits fünf Projekte. Welches bestehende Projekt soll überschrieben werden?",
    choices: projects.map(project => ({ value: project.id, label: project.title }))
  });
}

function confirmProjectDeletion() {
  return openProjectActionDialog({
    title: "Dieses Projekt Löschen?",
    choices: [{ value: "delete", label: "Löschen", danger: true }]
  }).then(result => result === "delete");
}

function askProjectName() {
  const dialog = document.querySelector("#project-name-dialog");
  const input = document.querySelector("#project-name-input");
  input.value = "";
  dialog.showModal();
  requestAnimationFrame(() => input.focus());
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "save" ? input.value : null), { once: true });
  });
}

function applyConfigurationCode(text, { nativeLayout = false } = {}) {
  if (!/^[0-9A-Za-z]{13,25}$/.test(text)) throw new Error("Bitte einen gültigen Code eingeben.");
  const hasCalendarConfiguration = text.length >= 21;
  const calendarConfiguration = hasCalendarConfiguration ? decodeCalendarConfiguration(text.slice(-8)) : { enabled: false, mode: "current", dates: [null, null, null] };
  const baseCode = hasCalendarConfiguration ? text.slice(0, -8) : text;
  const partyUniverse = Object.keys(PARTY_META);
  const partyCount = orderedChoiceCount(partyUniverse.length);
  const regionCount = orderedChoiceCount(state.data.regions.length);
  let value = base62Decode(baseCode);
  const legacySpace = regionCount * partyCount * 7n;
  const mode = Number(value / legacySpace);
  if (mode > 536870911) throw new Error("Dieser Code gehört nicht zu einer gültigen Konfiguration.");
  state.averageMode = Boolean(mode & 1);
  state.mobileView = Boolean(mode & 2);
  state.groupBy = mode & 4 ? "region" : "party";
  state.a4Mode = Boolean(mode & 8);
  state.fullRegionNames = Boolean(mode & 16);
  state.electionDates = !(mode & 32);
  state.a4Orientation = mode & 128 ? "landscape" : mode & 64 ? "portrait" : "auto";
  state.showSinceElection = !(mode & 256);
  state.showBrackets = !(mode & 512);
  state.showLabels = !(mode & 1024);
  state.barColors = !(mode & 2048);
  state.showPercentValues = !(mode & 4096);
  state.showLut = !(mode & 8192);
  state.showBackground = !(mode & 16384);
  state.export3d = !(mode & 32768);
  state.regionLabelMode = ["auto", "0", "90", "off"][(mode >> 16) & 3];
  state.partyLabelMode = ["auto", "0", "90", "off"][(mode >> 18) & 3];
  state.percentLabelMode = ["without", "with", "off", "without"][(mode >> 20) & 3];
  state.sinceElectionMode = ["color", "gray", "off", "color"][(mode >> 22) & 3];
  yAxisMode = ["dynamic", "static", "off", "dynamic"][(mode >> 24) & 3];
  state.barColorMode = ["party", "lightblue", "gray", "party"][(mode >> 26) & 3];
  state.barNeon = !(mode & 268435456);
  if (!state.showLabels) {
    state.showSinceElection = false;
    state.sinceElectionMode = "off";
  }
  // Projects can be opened on a different kind of device than the one on
  // which they were saved. Keep their content/settings, but always use the
  // layout that belongs to the device currently displaying the project.
  if (nativeLayout) state.mobileView = startsMobile;
  if (state.mobileView) state.electionDates = false;
  document.querySelector("#chart-view-settings").hidden = state.mobileView;
  value %= legacySpace;
  const pollMask = Number(value % 7n) + 1;
  value /= 7n;
  const partyRank = value % partyCount;
  const regionRank = value / partyCount;
  if (regionRank >= regionCount) throw new Error("Dieser Code gehört nicht zu einer gültigen Konfiguration.");
  state.regions = new Set(unrankOrdered(regionRank, state.data.regions));
  state.parties = new Set(unrankOrdered(partyRank, partyUniverse));
  state.selectedPollRanks = new Set([0, 1, 2].filter(rank => pollMask & (1 << rank)));
  setPollTimeMode(calendarConfiguration.mode || (calendarConfiguration.enabled ? "free" : "current"));
  state.pollDateLabels = calendarConfiguration.dates;
  const referencePolls = state.data.polls[[...state.regions][0]] || [];
  state.pollRankOverrides = calendarConfiguration.dates.map((date, slot) => {
    if (!date) return slot;
    const rank = referencePolls.findIndex(poll => poll.date <= date);
    return rank < 0 ? Math.max(0, referencePolls.length - 1) : rank;
  });
  document.querySelector("#average-mode").checked = state.averageMode;
  els.mobileView.checked = state.mobileView;
  els.fullRegionNames.checked = !state.fullRegionNames;
  setCycleButton(els.abbreviationMode, state.fullRegionNames ? "off" : "on", [["on", "An"], ["off", "Aus"]]);
  els.showSinceElection.checked = state.showSinceElection;
  els.showBrackets.checked = state.showBrackets;
  els.showLabels.checked = state.showLabels;
  setCycleButton(els.regionLabelMode, state.regionLabelMode, labelModeOptions.rotation);
  setCycleButton(els.partyLabelMode, state.partyLabelMode, labelModeOptions.rotation);
  setCycleButton(els.percentLabelMode, state.showPercentValues ? state.percentLabelMode : "off", labelModeOptions.percent);
  setCycleButton(els.sinceElectionMode, state.showSinceElection ? state.sinceElectionMode : "off", labelModeOptions.since);
  els.showBarColors.checked = state.barColors;
  setCycleButton(els.barColorMode, state.barColorMode, [["party", "Parteifarben"], ["lightblue", "Hellblau"], ["gray", "Grau"]]);
  setCycleButton(els.barNeonMode, state.barNeon ? "on" : "off", [["on", "An"], ["off", "Aus"]]);
  els.showPercentValues.checked = state.showPercentValues;
  els.showLut.checked = state.showLut;
  els.showBackground.checked = state.showBackground;
  setCycleButton(document.querySelector("#y-axis-mode"), yAxisMode, [["static", "Statisch"], ["dynamic", "Dynamisch"], ["off", "Aus"]]);
  setCycleButton(document.querySelector("#background-mode"), state.showBackground ? "on" : "off", [["on", "An"], ["off", "Aus"]]);
  setCycleButton(document.querySelector("#brackets-mode"), state.showBrackets ? "on" : "off", [["on", "An"], ["off", "Aus"]]);
  document.querySelector("#export-3d").checked = state.export3d;
  els.electionDates.checked = state.electionDates;
  document.querySelector("#a4-mode").checked = state.a4Mode;
  document.querySelector(`input[name="output-shape"][value="${state.a4Mode ? "a4" : "tube"}"]`).checked = true;
  document.querySelector("#a4-orientation-settings").hidden = !state.a4Mode;
  document.querySelector(`input[name="a4-orientation"][value="${state.a4Orientation}"]`).checked = true;
  els.regions.querySelectorAll("input").forEach(input => input.checked = state.regions.has(input.value));
  els.parties.querySelectorAll('input[name="party"]').forEach(input => input.checked = state.parties.has(input.value));
  updatePollOptions(false);
  render(false);
}

async function exportChartImage(format = "jpeg") {
  const isPng = format === "png";
  const formatLabel = isPng ? "PNG" : "JPEG";
  els.exportMessage.textContent = `${formatLabel} wird erstellt …`;
  const clone = prepareChartExport3d(els.chart.cloneNode(true));
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
  const selectedPollRecords = selectedRegions.flatMap(region => selectedPollEntries(region).map(({ rank }) => (state.data.polls[region] || [])[rank]).filter(Boolean));
  const selectedPolls = selectedRegions.flatMap(region => selectedPollEntries(region).map(({ slot, rank }) => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? `${state.fullRegionNames ? region : REGION_CODES[region]} · ${pollSelectionLabel(slot, rank)} · ${poll.institute} · ${formatDate(poll.date)}${poll.client ? ` · ${poll.client}` : ""}` : null;
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
  const secondStamp = new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short"
  }).format(now);
  const headerX = 18;
  addHeaderText("Sonntagsfragen", { x: headerX, y: 66 + headerOffsetY, style: "font-family: Georgia, serif", "font-size": 64, "font-weight": 500, "letter-spacing": "-.06em" });
  const creator = addHeaderText("", { x: headerX + 108, y: 84 + headerOffsetY, "text-anchor": "middle", fill: "#7f95b2", "font-size": 6.5, "font-weight": 400, "letter-spacing": ".04em", style: 'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  const creatorPrefix = svgEl("tspan");
  creatorPrefix.textContent = "visualizer by ";
  const creatorName = svgEl("tspan", { fill: "#b9dff1", "font-weight": 800 });
  creatorName.textContent = "charavision";
  creator.append(creatorPrefix, creatorName);
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
      if (swatches) headerGroup.append(svgEl("rect", { x: itemX, y: y - 6, width: 3, height: 7, fill: state.barColors ? PARTY_META[item].color : "#7d8794" }));
      addHeaderText(swatches ? partyDisplayLabelForPolls(item, selectedPollRecords) : item, { x: itemX + (swatches ? 7 : 0), y, fill: "#dce8f7", "font-size": 7 });
    });
  };
  if (state.showLabels) {
    addLegendSection(700, 145, "PARTEIEN", selectedParties, partyColumns, true);
    addLegendSection(865, 235, "PARLAMENTE", selectedRegions.map(region => state.fullRegionNames ? region : REGION_CODES[region]), regionColumns);
  }
  addLegendSection(1120, 460, "UMFRAGEDATEN", selectedPolls, pollColumns);

  const footerCenter = documentWidth / 2;
  const footerY = headerHeight + viewBox.height + 8;
  addText(`${configurationCode()} · ${currentOutputPlatformLabel()} · ${secondStamp}`, { x: footerCenter, y: footerY, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 9 });
  addText(`Quelle: Wahlrecht.de · Letzter Datenabruf: ${dataRetrievalStamp()}`, { x: footerCenter, y: footerY + 15, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 8 });
  addText("© 2026 charavision", { x: footerCenter, y: footerY + 30, "text-anchor": "middle", fill: "#dce8f7", "font-size": 8, "font-weight": 700 });

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
  const raw = regions.flatMap(region => selectedPollEntries(region).map(({ slot, rank }) => {
    const poll = (state.data.polls[region] || [])[rank];
    return poll ? { region, rank: slot, sourceRank: rank, poll } : null;
  }).filter(Boolean));
  const series = state.averageMode ? regions.map(region => {
    const items = raw.filter(item => item.region === region);
    if (!items.length) return null;
    const values = Object.fromEntries(pollValueKeys().map(party => [party, items.reduce((sum, item) => sum + Number(item.poll.values[party] || 0), 0) / items.length]));
    return { region, rank: 0, average: true, poll: { date: items[0].poll.date, values } };
  }).filter(Boolean) : raw;
  if (state.groupBy === "region") return regions.map(region => ({
    title: `${region} (${REGION_CODES[region]})`,
    bars: parties.flatMap(party => series.filter(item => item.region === region).map(item => ({ party, item })))
  })).filter(cluster => cluster.bars.length);
  return parties.map(party => ({
    title: party === "CDU/CSU" && regions.length === 1
      ? partyDisplayLabel(party, regions[0])
      : partyDisplayLabelForPolls(party, series.map(item => item.poll)),
    bars: series.map(item => ({ party, item }))
  }));
}

function a4LayoutFor(clusters) {
  const largestCluster = Math.max(0, ...clusters.map(cluster => cluster.bars.length));
  const forcedLandscape = state.a4Orientation === "landscape";
  const forcedPortrait = state.a4Orientation === "portrait";
  const landscape = forcedLandscape || (!forcedPortrait && largestCluster > 34);
  if (landscape) {
    if (largestCluster > 34) return { width: 1754, height: 1240, columns: 1, rows: 2, capacity: 2, landscape: true };
    return { width: 1754, height: 1240, columns: 3, rows: 2, capacity: 5, landscape: true, sharedPollLegend: true };
  }
  if (largestCluster > 34) return { width: 1240, height: 1754, columns: 1, rows: 2, capacity: 1, landscape: false, splitLargeCluster: true };
  if (largestCluster > 17) return { width: 1240, height: 1754, columns: 1, rows: state.fullRegionNames ? 3 : 4, capacity: state.fullRegionNames ? 3 : 4, landscape: false };
  return { width: 1240, height: 1754, columns: 2, rows: state.fullRegionNames ? 3 : 4, capacity: state.fullRegionNames ? 6 : 8, landscape: false };
}

function updateExportSummary() {
  if (!state.data || !els.exportSummary) return;
  const clusters = a4ExportClusters();
  const format = document.querySelector("#export-format")?.value || "pdf";
  const usePages = state.a4Mode || format === "pdf";
  const pages = usePages ? Math.max(1, Math.ceil(clusters.length / a4LayoutFor(clusters).capacity)) : 1;
  els.exportSummary.textContent = `${clusters.length} ${clusters.length === 1 ? "Diagramm" : "Diagramme"} auf ${pages} ${pages === 1 ? "Seite" : "Seiten"}`;
}

function buildA4Page(clusters, pageNumber, pageCount, layout) {
  const { width, height, columns } = layout;
  const rows = layout.sharedPollLegend
    ? 2
    : pageCount > 1
      ? layout.rows
      : Math.max(1, Math.min(layout.rows, Math.ceil(clusters.length / columns)));
  const page = svgEl("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${width} ${height}`, width, height });
  const defs = svgEl("defs");
  const pageBase = svgEl("linearGradient", { id: "page-base", x1: "0", y1: "0", x2: "1", y2: "1" });
  pageBase.append(svgEl("stop", { offset: "0", "stop-color": "#172744" }), svgEl("stop", { offset: ".7", "stop-color": "#081326" }), svgEl("stop", { offset: "1", "stop-color": "#050d1b" }));
  const pageGlow = svgEl("radialGradient", { id: "page-glow", cx: "50%", cy: "28%", r: "68%" });
  pageGlow.append(svgEl("stop", { offset: "0", "stop-color": "#2a67a4", "stop-opacity": ".28" }), svgEl("stop", { offset: ".58", "stop-color": "#17385e", "stop-opacity": ".12" }), svgEl("stop", { offset: "1", "stop-color": "#081326", "stop-opacity": "0" }));
  const pageBarShadow = svgEl("filter", { id: "page-bar-shadow", x: "-80%", y: "-500%", width: "260%", height: "1100%" });
  pageBarShadow.append(svgEl("feGaussianBlur", { stdDeviation: 3.2 }));
  defs.append(pageBase, pageGlow, pageBarShadow);
  if (!state.barNeon) Object.keys(PARTY_META).forEach((party, index) => {
    const visual = barVisual(party);
    const softLight = mixHexColors(visual.base, visual.light, .34);
    const gradient = svgEl("radialGradient", { id: `matte-export-${index}`, cx: "15%", cy: "-8%", r: "190%", fx: "15%", fy: "-8%" });
    gradient.append(
      svgEl("stop", { offset: "0", "stop-color": softLight }),
      svgEl("stop", { offset: ".58", "stop-color": visual.base }),
      svgEl("stop", { offset: ".82", "stop-color": visual.base }),
      svgEl("stop", { offset: "1", "stop-color": visual.dark })
    );
    defs.append(gradient);
  });
  page.append(defs);
  page.append(svgEl("rect", { width, height, fill: "url(#page-base)" }));
  page.append(svgEl("rect", { width, height, fill: "url(#page-glow)" }));
  const text = (value, attrs = {}) => { const node = svgEl("text", { fill: "#f4f8ff", style: 'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', ...attrs }); node.textContent = value; page.append(node); return node; };
  const now = new Date();
  const minuteStamp = new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(now);
  const landscapeHeader = width > 1400;
  const brandSize = landscapeHeader ? 118 : 84;
  const brandY = landscapeHeader ? 128 : 102;
  text("Sonntagsfragen", { x: 42, y: brandY, style: "font-family: Georgia, serif", "font-size": brandSize, "font-weight": 500, "letter-spacing": "-.06em" });
  const creator = text("", { x: 42 + brandSize * 1.55, y: brandY + brandSize * .2, "text-anchor": "middle", fill: "#7f95b2", "font-size": brandSize * .096, "font-weight": 400, "letter-spacing": ".04em" });
  const creatorPrefix = svgEl("tspan"); creatorPrefix.textContent = "visualizer by ";
  const creatorName = svgEl("tspan", { fill: "#b9dff1", "font-weight": 800 }); creatorName.textContent = "charavision";
  creator.append(creatorPrefix, creatorName);
  const introY = brandY + brandSize * .48;
  text("Die aktuellen Sonntagsfragen von Bund & Ländern im Vergleich.", { x: 42, y: introY, fill: "#8fa6c1", "font-size": landscapeHeader ? 20 : 15, "font-weight": 400 });
  const selectedRegions = [...state.regions], selectedParties = [...state.parties];
  const headerLegend = (x, y, title, items, columns, columnWidth, colorItems = false) => {
    text(title, { x, y, fill: "#59d9ff", "font-size": 12, "font-weight": 800, "letter-spacing": ".06em" });
    const rows = Math.ceil(items.length / columns);
    items.forEach((item, index) => {
      const column = Math.floor(index / rows), row = index % rows, itemX = x + column * columnWidth, itemY = y + 19 + row * 12;
      if (colorItems) page.append(svgEl("rect", { x: itemX, y: itemY - 6, width: 4, height: 7, fill: getComputedStyle(document.documentElement).getPropertyValue(PARTY_META[item].color.match(/--[\w-]+/)?.[0] || "").trim() || PARTY_META[item].glow }));
      text(item, { x: itemX + (colorItems ? 8 : 0), y: itemY, fill: "#dce8f7", "font-size": 10.7 });
    });
  };
  const partyX = landscapeHeader ? 900 : 650;
  const rightLegendWidth = width - partyX - 42;
  const partyY = 54;
  text("PARTEIEN", { x: partyX, y: partyY, fill: "#59d9ff", "font-size": 12, "font-weight": 800, "letter-spacing": ".06em" });
  const partySlot = rightLegendWidth / Math.max(1, selectedParties.length);
  selectedParties.forEach((party, index) => {
    const itemX = partyX + index * partySlot;
    page.append(svgEl("rect", { x: itemX, y: partyY + 11, width: 4, height: 9, fill: getComputedStyle(document.documentElement).getPropertyValue(PARTY_META[party].color.match(/--[\w-]+/)?.[0] || "").trim() || PARTY_META[party].glow }));
    const partyPolls = clusters.flatMap(cluster => cluster.bars.filter(bar => bar.party === party).map(bar => bar.item.poll));
    text(partyDisplayLabelForPolls(party, partyPolls), { x: itemX + 8, y: partyY + 20, fill: "#dce8f7", "font-size": 10.7 });
  });
  const regionsY = partyY + 70;
  headerLegend(partyX, regionsY, "PARLAMENTE", selectedRegions.map(region => `${region} (${REGION_CODES[region]})`), 3, rightLegendWidth / 3);
  const regionLegendRows = Math.ceil(selectedRegions.length / 3);
  if (state.showSinceElection) text("* = Differenz seit der letzten Wahl", { x: partyX, y: regionsY + 31 + regionLegendRows * 12, fill: "#8fa6c1", "font-size": 8 });
  const gapX = 18, gapY = 18, left = 42;
  const standardTop = Math.max(landscapeHeader ? 265 : 300, regionsY + 62 + regionLegendRows * 12);
  const top = layout.splitLargeCluster ? Math.max(245, standardTop - 42) : standardTop;
  text(`Gruppiert nach ${state.groupBy === "party" ? "Partei" : "Parlament"}${state.averageMode ? " · Durchschnitt" : ""}`, { x: 42, y: top - 24, fill: "#59d9ff", "font-size": 18, "font-weight": 800 });
  const tileWidth = (width - left * 2 - gapX * (columns - 1)) / columns;
  const naturalTileHeight = (height - top - 100 - gapY * (rows - 1)) / rows;
  const tileHeight = layout.splitLargeCluster ? naturalTileHeight * .92 : naturalTileHeight;
  const allValues = clusters.flatMap(cluster => cluster.bars.map(({ party, item }) => Number(item.poll.values[party] || 0)));
  const yMax = Math.max(50, Math.ceil(Math.max(0, ...allValues) / 10) * 10);
  const rootStyle = getComputedStyle(document.documentElement);
  clusters.forEach((cluster, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const x = left + column * (tileWidth + gapX), y = top + row * (tileHeight + gapY);
    text(cluster.title, { x: x + 16, y: y + 27, fill: "#dce8f7", "font-size": 18, "font-weight": 800 });
    text(minuteStamp, { x: x + 16, y: y + 43, fill: "#8fa6c1", "font-size": 10.7 });
    const splitClusterRow = Boolean(layout.splitLargeCluster);
    const showSideLegend = Boolean(splitClusterRow && cluster.continuation);
    const fullRowPlotWidth = tileWidth - 52;
    const plotWidth = splitClusterRow ? fullRowPlotWidth : tileWidth - 52;
    const legendBars = cluster.legendBars || cluster.bars;
    const clusterRegions = [...new Set(legendBars.map(({ item }) => item.region))];
    const pollLegendGroups = state.averageMode ? [{
      label: "Verwendete Umfragen", noSwatch: true,
      items: [...state.selectedPollRanks].sort().flatMap(slot => clusterRegions.map(region => {
        const rank = selectedPollEntries(region).find(entry => entry.slot === slot)?.rank ?? slot;
        const poll = (state.data.polls[region] || [])[rank];
        return poll ? `${REGION_CODES[region]} · ${poll.institute} · ${formatDate(poll.date)}` : null;
      }).filter(Boolean))
    }] : [...state.selectedPollRanks].sort().map(slot => ({
      rank: slot,
      label: pollSelectionLabel(slot, state.pollRankOverrides[slot] ?? slot, true),
      fill: [.68, .34, .14][slot], stroke: [1, .7, .4][slot],
      items: clusterRegions.map(region => {
        const rank = selectedPollEntries(region).find(entry => entry.slot === slot)?.rank ?? slot;
        const poll = (state.data.polls[region] || [])[rank];
        return poll ? `${REGION_CODES[region]} · ${poll.institute} · ${formatDate(poll.date)}` : null;
      }).filter(Boolean)
    })).filter(group => group.items.length);
    const pollGroupWidth = showSideLegend
      ? tileWidth * .16
      : plotWidth / Math.max(1, pollLegendGroups.length);
    const pollGroupLayouts = pollLegendGroups.map(group => {
      const availableLegendWidth = showSideLegend ? pollGroupWidth : plotWidth;
      const columns = Math.max(1, Math.min(group.items.length, Math.floor(availableLegendWidth / 180)));
      return { columns, rows: Math.ceil(group.items.length / columns) };
    });
    const noteRows = Math.max(0, ...pollGroupLayouts.map(layout => layout.rows));
    const stackedPollLegendHeight = pollGroupLayouts.reduce((height, layout) => height + 28 + layout.rows * 11, 0);
    const labelRuns = [];
    let labelRunStart = 0;
    while (labelRunStart < cluster.bars.length) {
      const key = state.groupBy === "party" ? cluster.bars[labelRunStart].item.region : cluster.bars[labelRunStart].party;
      let labelRunEnd = labelRunStart;
      while (labelRunEnd + 1 < cluster.bars.length) {
        const nextKey = state.groupBy === "party" ? cluster.bars[labelRunEnd + 1].item.region : cluster.bars[labelRunEnd + 1].party;
        if (nextKey !== key) break;
        labelRunEnd += 1;
      }
      labelRuns.push({ key, count: labelRunEnd - labelRunStart + 1 });
      labelRunStart = labelRunEnd + 1;
    }
    const sparseHorizontalLabels = layout.splitLargeCluster || cluster.bars.length <= 2;
    const labelSlotCount = splitClusterRow ? 30 : Math.max(1, cluster.bars.length);
    const estimatedLabelSlot = fullRowPlotWidth / labelSlotCount;
    const labelFontSize = 9.33;
    const horizontalLabelFits = run => {
      if (sparseHorizontalLabels) return true;
      if (run.count < 3) return false;
      const parts = String(run.key).split(/(?<=-)/);
      const estimatedTextWidth = Math.max(...parts.map(part => part.length)) * labelFontSize * .58;
      const safetyGap = labelFontSize * .58 * 2.5;
      return estimatedLabelSlot * run.count >= estimatedTextWidth + safetyGap;
    };
    const maxVerticalLabelLength = state.groupBy === "party" && state.fullRegionNames && !sparseHorizontalLabels
      ? Math.max(0, ...labelRuns.filter(run => !horizontalLabelFits(run)).map(run => Math.max(...String(run.key).split(/(?<=-)/).map(part => part.length))))
      : 0;
    const regionLabelSpace = maxVerticalLabelLength ? maxVerticalLabelLength * 5.3 : 38;
    const pollLegendOffset = 59 + regionLabelSpace;
    const lowerLegendSpace = splitClusterRow
      ? 72
      : layout.sharedPollLegend
        ? Math.max(92, pollLegendOffset + 28)
        : showSideLegend
          ? Math.max(160, pollLegendOffset + 38 + noteRows * 11)
          : Math.max(160, pollLegendOffset + stackedPollLegendHeight + 18);
    const splitRowFraction = showSideLegend ? Math.max(1, cluster.bars.length) / 30 : 1;
    const plot = { left: x + 40, right: splitClusterRow ? x + 40 + fullRowPlotWidth * splitRowFraction : x + tileWidth - 12, top: y + 62, bottom: y + tileHeight - lowerLegendSpace };
    if (state.export3d && state.showLut && state.showBackground) {
      // One grid cell of Z depth, projected towards the same central
      // vanishing point that determines the direction of the bar faces.
      const gridCenter = (plot.left + plot.right) / 2;
      const gridDepth = Math.max(12, Math.min(22, (plot.bottom - plot.top) * .055));
      const backScale = .93;
      const backY = plot.bottom - gridDepth;
      const projectedX = gridX => gridCenter + (gridX - gridCenter) * backScale;
      const backLeft = projectedX(plot.left);
      const backRight = projectedX(plot.right);
      page.append(svgEl("path", {
        d: `M ${plot.left} ${plot.bottom} H ${plot.right} L ${backRight} ${backY} H ${backLeft} Z`,
        fill: "#16375b", "fill-opacity": .13, stroke: "none"
      }));
      const gridColumns = Math.max(4, Math.min(18, Math.round((plot.right - plot.left) / 55)));
      for (let gridIndex = 0; gridIndex <= gridColumns; gridIndex += 1) {
        const frontX = plot.left + (plot.right - plot.left) * gridIndex / gridColumns;
        page.append(svgEl("line", {
          x1: frontX, y1: plot.bottom, x2: projectedX(frontX), y2: backY,
          stroke: "#65b6ff", "stroke-opacity": .2, "stroke-width": .7
        }));
      }
      page.append(svgEl("line", {
        x1: backLeft, y1: backY, x2: backRight, y2: backY,
        stroke: "#65b6ff", "stroke-opacity": .28, "stroke-width": .8
      }));
    }
    if (state.showLut) {
      page.append(svgEl("line", { x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, stroke: "#9bb4d0", "stroke-opacity": .58, "stroke-width": 1.2 }));
      page.append(svgEl("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: "#9bb4d0", "stroke-opacity": .58, "stroke-width": 1.2 }));
      [0, .5, 1].forEach(fraction => {
        const lineY = plot.bottom - fraction * (plot.bottom - plot.top);
        page.append(svgEl("line", { x1: plot.left, x2: plot.right, y1: lineY, y2: lineY, stroke: "#9bb4d0", "stroke-opacity": .2 }));
        text(`${Math.round(yMax * fraction)}`, { x: plot.left - 6, y: lineY + 4, "text-anchor": "end", fill: "#8fa6c1", "font-size": 10.7 });
      });
      const fiftyY = plot.bottom - Math.min(1, 50 / yMax) * (plot.bottom - plot.top) + 14;
      text("Werte in %", { x: (plot.left + plot.right) / 2, y: fiftyY, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 10.7 });
    }
    const exportBlockKey = ({ party, item }) => state.groupBy === "party" ? item.region : party;
    const exportBreaks = cluster.bars.slice(1).reduce((count, bar, barIndex) => count + (exportBlockKey(bar) !== exportBlockKey(cluster.bars[barIndex]) ? 1 : 0), 0);
    const slotCount = splitClusterRow ? 30 : Math.max(1, cluster.bars.length);
    const countExportBreaks = bars => bars.slice(1).reduce((count, bar, barIndex) => count + (exportBlockKey(bar) !== exportBlockKey(bars[barIndex]) ? 1 : 0), 0);
    const sharedExportBreaks = splitClusterRow
      ? Math.max(countExportBreaks(legendBars.slice(0, 30)), countExportBreaks(legendBars.slice(30)))
      : exportBreaks;
    const exportBlockGap = sharedExportBreaks ? Math.max(4, Math.min(10, fullRowPlotWidth * .008)) : 0;
    const slot = (fullRowPlotWidth - sharedExportBreaks * exportBlockGap) / slotCount;
    const barWidth = Math.max(2, Math.min(34, slot * .68));
    const exportBarCenters = [];
    const otherPartyLinks = [];
    const otherPartyCards = [];
    const sonstigeBars = cluster.bars.filter(entry => entry.party === "Sonstige");
    const sonstigeTop = sonstigeBars.length ? Math.min(...sonstigeBars.map(entry => {
      const value = Number(entry.item.poll.values.Sonstige || 0);
      return plot.bottom - value / yMax * (plot.bottom - plot.top);
    })) : 0;
    let passedExportBreaks = 0;
    cluster.bars.forEach(({ party, item }, barIndex) => {
      const value = Number(item.poll.values[party] || 0);
      const barHeight = state.barColors ? value / yMax * (plot.bottom - plot.top) : 0;
      if (barIndex > 0 && exportBlockKey(cluster.bars[barIndex]) !== exportBlockKey(cluster.bars[barIndex - 1])) passedExportBreaks += 1;
      const barX = plot.left + slot * barIndex + passedExportBreaks * exportBlockGap + (slot - barWidth) / 2;
      exportBarCenters.push(barX + barWidth / 2);
      const barY = plot.bottom - barHeight;
      const visual = barVisual(party);
      const matteExportIndex = Object.keys(PARTY_META).indexOf(party);
      const color = state.barColorMode === "party" && state.barColors
        ? (rootStyle.getPropertyValue(PARTY_META[party].color.match(/--[\w-]+/)?.[0] || "").trim() || visual.stroke)
        : visual.fill;
      const frontColor = state.barNeon ? color : `url(#matte-export-${Math.max(0, matteExportIndex)})`;
      const fillOpacity = item.average ? .72 : [.68, .34, .14][item.rank] ?? .14;
      const strokeOpacity = item.average ? 1 : [1, .7, .4][item.rank] ?? .4;
      if (state.export3d && barHeight > 0) {
        const clusterCenter = (plot.left + plot.right) / 2;
        const depthX = Math.min(6, Math.max(2.5, barWidth * .16));
        const dx = Math.max(-depthX, Math.min(depthX, (clusterCenter - (barX + barWidth / 2)) * .12));
        const depth = Math.min(4.5, Math.max(1.8, barWidth * .11));
        const topDepthY = exportDepthY(value, depth);
        const rearBaselineY = plot.bottom - depth;
        const edgeX = dx >= 0 ? barX + barWidth : barX;
        page.append(svgEl("ellipse", {
          cx: barX + barWidth / 2 + dx * 1.25, cy: plot.bottom + Math.max(1.5, depth * .7),
          rx: Math.max(4, barWidth * .8), ry: Math.max(1.4, barWidth * .12),
          fill: "#010611", "fill-opacity": state.barNeon ? Math.max(.18, fillOpacity * .48) : .34,
          filter: "url(#page-bar-shadow)"
        }));
        page.append(svgEl("polygon", {
          points: `${edgeX},${barY} ${edgeX + dx},${barY + topDepthY} ${edgeX + dx},${rearBaselineY} ${edgeX},${plot.bottom}`,
          fill: state.barNeon ? color : visual.dark, "fill-opacity": state.barNeon ? fillOpacity * .42 : 1,
          stroke: state.barNeon ? visual.stroke : "#f4f7fb", "stroke-opacity": state.barNeon ? strokeOpacity * .72 : .12, "stroke-width": state.barNeon ? 1 : .01
        }));
        page.append(svgEl("polygon", {
          points: `${barX},${barY} ${barX + dx},${barY + topDepthY} ${barX + barWidth + dx},${barY + topDepthY} ${barX + barWidth},${barY}`,
          fill: state.barNeon ? visual.stroke : visual.light, "fill-opacity": state.barNeon ? fillOpacity * .62 : 1,
          stroke: state.barNeon ? visual.stroke : "#f4f7fb", "stroke-opacity": state.barNeon ? strokeOpacity * .86 : .12, "stroke-width": state.barNeon ? 1 : .01
        }));
      }
      page.append(svgEl("rect", { x: barX, y: barY, width: barWidth, height: barHeight, rx: state.barNeon ? 2 : 0, fill: frontColor, "fill-opacity": state.barNeon ? fillOpacity : (item.average || item.rank === 0 ? 1 : fillOpacity), stroke: state.barNeon ? visual.stroke : "#f4f7fb", "stroke-opacity": state.barNeon ? strokeOpacity : .12, "stroke-width": state.barNeon ? 1.5 : .01 }));
      if (state.showPercentValues) {
        const percentText = formatPercent(value, false, true);
        text(`${item.average ? "Ø " : ""}${state.percentLabelMode === "with" ? percentText : percentText.replace(" %", "")}`, { x: barX + barWidth / 2, y: Math.max(plot.top + 8, barY - 5), "text-anchor": "middle", fill: "#f4f8ff", "font-size": cluster.bars.length > 18 ? 6 : 8, "font-weight": 700 });
      }
      if (party === "Sonstige" && state.otherParties.size) {
        const extraValues = selectedOtherPartyValues(item.poll);
        if (extraValues.length) {
          const lineHeight = 10;
          const boxWidth = 92;
          const boxHeight = 7 + extraValues.length * lineHeight;
          const annotationIndex = cluster.bars.slice(0, barIndex).filter(entry => entry.party === "Sonstige").length;
          const slotHeight = 7 + state.otherParties.size * lineHeight + 4;
          const stackHeight = sonstigeBars.length * slotHeight;
          const barCenterX = barX + barWidth / 2;
          const boxX = barCenterX - boxWidth / 2;
          const boxY = Math.max(plot.top + 2, sonstigeTop - stackHeight - (state.showPercentValues ? 18 : 7) + annotationIndex * slotHeight);
          const percentLabelY = Math.max(plot.top + 8, barY - 5);
          const lineEndY = Math.max(boxY + boxHeight + 2, percentLabelY - 9);
          otherPartyLinks.push(svgEl("path", {
            d: `M ${barCenterX} ${boxY + boxHeight} L ${barCenterX} ${lineEndY}`,
            fill: "none", stroke: "#d2e1f2", "stroke-opacity": .68, "stroke-width": .65
          }));
          const card = svgEl("g");
          card.append(svgEl("rect", { x: boxX, y: boxY, width: boxWidth, height: boxHeight, rx: 4, fill: "#071225", "fill-opacity": .94, stroke: "#a9c1dc", "stroke-opacity": .58, "stroke-width": .6 }));
          extraValues.forEach((entry, extraIndex) => {
            const lineY = boxY + 6 + extraIndex * lineHeight + lineHeight / 2;
            card.append(svgEl("circle", { cx: boxX + 7, cy: lineY - 1, r: 2, fill: OTHER_PARTIES[entry.party].color }));
            const label = svgEl("text", { x: boxX + 12, y: lineY + 2, fill: "#e8f0fa", "font-size": 7, "font-weight": 700, style: 'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
            label.textContent = `${OTHER_PARTIES[entry.party].label} ${formatPercent(entry.value, false, true)}`;
            card.append(label);
          });
          otherPartyCards.push(card);
        }
      }
      const electionValue = Number(state.data.elections?.[item.region]?.values?.[party] || 0);
      const delta = value - electionValue;
      if (state.showSinceElection) text(formatPercent(delta, true), { x: barX + barWidth / 2, y: plot.bottom + 19, "text-anchor": "middle", fill: state.sinceElectionMode === "gray" ? "#91a4ba" : delta >= 0 ? "#63e6a6" : "#ff8b9b", "font-size": 9.33, "font-weight": 700 });
    });
    page.append(...otherPartyLinks, ...otherPartyCards);
    if (state.showSinceElection) text("Seit Wahl*", { x: plot.left - 5, y: plot.bottom + 19, "text-anchor": "end", fill: "#8fa6c1", "font-size": 8, "font-weight": 700 });
    let runStart = 0;
    while (runStart < cluster.bars.length) {
      const runKey = state.groupBy === "party" ? cluster.bars[runStart].item.region : cluster.bars[runStart].party;
      let runEnd = runStart;
      while (runEnd + 1 < cluster.bars.length) {
        const nextKey = state.groupBy === "party" ? cluster.bars[runEnd + 1].item.region : cluster.bars[runEnd + 1].party;
        if (nextKey !== runKey) break;
        runEnd += 1;
      }
      const runCenter = (exportBarCenters[runStart] + exportBarCenters[runEnd]) / 2;
      const runCount = runEnd - runStart + 1;
      if (runCount > 1 && state.showBrackets) {
        const bracketLeft = exportBarCenters[runStart] - barWidth * .62;
        const bracketRight = exportBarCenters[runEnd] + barWidth * .62;
        const bracketY = plot.bottom + (state.showSinceElection ? 31 : 12);
        page.append(svgEl("path", {
          d: `M ${bracketLeft} ${bracketY - 5} V ${bracketY} H ${bracketRight} V ${bracketY - 5}`,
          fill: "none", stroke: "#7693b4", "stroke-opacity": .72, "stroke-width": 1.15
        }));
      }
      const runLabel = state.groupBy === "party" ? (state.fullRegionNames ? runKey : REGION_CODES[runKey]) : partyDisplayLabel(runKey, cluster.bars[runStart].item.region, cluster.bars[runStart].item.poll);
      const hyphenIndex = runLabel.indexOf("-");
      const wrapRegion = state.groupBy === "party" && state.fullRegionNames && runCount < 4 && hyphenIndex >= 0;
      const rotateRegion = state.groupBy === "party" && state.fullRegionNames && !horizontalLabelFits({ key: runKey, count: runCount });
      const labelY = plot.bottom + (runCount > 1 && state.showBrackets
        ? (state.showSinceElection ? 47 : 28)
        : (state.showSinceElection ? 39 : 20));
      const labelNode = state.showLabels ? text("", { x: runCenter, y: labelY, "text-anchor": rotateRegion ? "end" : "middle", fill: "#a8bfd9", "font-size": 9.33, "font-weight": 700, ...(rotateRegion ? { transform: `rotate(-90 ${runCenter} ${labelY})` } : {}) }) : null;
      if (state.showLabels && wrapRegion) {
        const split = hyphenIndex + 1;
        const firstLine = svgEl("tspan", { x: runCenter }); firstLine.textContent = runLabel.slice(0, split);
        const secondLine = svgEl("tspan", { x: runCenter, dy: 10.5 }); secondLine.textContent = runLabel.slice(split);
        labelNode.append(firstLine, secondLine);
      } else if (state.showLabels) labelNode.textContent = runLabel;
      runStart = runEnd + 1;
    }
    if (layout.sharedPollLegend && !state.averageMode) {
      const transparencyY = plot.bottom + pollLegendOffset;
      pollLegendGroups.forEach((group, groupIndex) => {
        const groupX = plot.left + groupIndex * ((plot.right - plot.left) / Math.max(1, pollLegendGroups.length));
        page.append(svgEl("rect", { x: groupX, y: transparencyY - 8, width: 18, height: 9, rx: 1, fill: "#dce8f7", "fill-opacity": group.fill, stroke: "#dce8f7", "stroke-opacity": group.stroke, "stroke-width": 1 }));
        text(group.label, { x: groupX + 24, y: transparencyY, fill: "#8fa6c1", "font-size": 9.33, "font-weight": 700 });
      });
    }
    let stackedLegendOffset = 0;
    if (!layout.sharedPollLegend && (!splitClusterRow || showSideLegend)) pollLegendGroups.forEach((group, groupIndex) => {
      const groupX = showSideLegend ? x + tileWidth * .82 : plot.left;
      const layout = pollGroupLayouts[groupIndex];
      const legendBaseY = showSideLegend ? plot.top + 22 + groupIndex * (42 + noteRows * 11) : plot.bottom + pollLegendOffset + stackedLegendOffset;
      if (!group.noSwatch) page.append(svgEl("rect", { x: groupX, y: legendBaseY - 8, width: 18, height: 9, rx: 1, fill: "#dce8f7", "fill-opacity": group.fill, stroke: "#dce8f7", "stroke-opacity": group.stroke, "stroke-width": 1 }));
      text(group.label, { x: groupX + (group.noSwatch ? 0 : 24), y: legendBaseY, fill: "#8fa6c1", "font-size": 9.33, "font-weight": 700, "letter-spacing": ".03em" });
      const itemColumnWidth = (showSideLegend ? pollGroupWidth : plotWidth) / layout.columns;
      group.items.forEach((note, noteIndex) => {
        const noteColumn = Math.floor(noteIndex / layout.rows), noteRow = noteIndex % layout.rows;
        const noteFontSize = Math.max(5.2, Math.min(9.33, (itemColumnWidth - 8) / (String(note).length * .56)));
        text(note, { x: groupX + noteColumn * itemColumnWidth, y: legendBaseY + 15 + noteRow * 11, fill: "#9bb0c9", "font-size": noteFontSize });
      });
      if (!showSideLegend) stackedLegendOffset += 28 + layout.rows * 11;
    });
  });
  if (layout.sharedPollLegend) {
    const legendX = left + 2 * (tileWidth + gapX) + 16;
    const legendY = top + tileHeight + gapY + 28;
    const legendWidth = tileWidth - 32;
    const pageRegions = [...new Set(clusters.flatMap(cluster => cluster.bars.map(({ item }) => item.region)))];
    const sharedGroups = [...state.selectedPollRanks].sort().map(slot => ({
      rank: slot,
      label: pollSelectionLabel(slot, state.pollRankOverrides[slot] ?? slot, true),
      fill: [.68, .34, .14][slot], stroke: [1, .7, .4][slot],
      items: pageRegions.map(region => {
        const rank = selectedPollEntries(region).find(entry => entry.slot === slot)?.rank ?? slot;
        const poll = (state.data.polls[region] || [])[rank];
        return poll ? `${REGION_CODES[region]} · ${poll.institute} · ${formatDate(poll.date)}` : null;
      }).filter(Boolean)
    })).filter(group => group.items.length);
    text("UMFRAGEDATEN", { x: legendX, y: legendY, fill: "#59d9ff", "font-size": 14, "font-weight": 800, "letter-spacing": ".06em" });
    // Stack the transparency groups vertically. Long institute names used to
    // run into the neighbouring group when all three groups shared one row.
    let groupOffsetY = 0;
    sharedGroups.forEach(group => {
      const groupX = legendX;
      const groupY = legendY + 24 + groupOffsetY;
      const columns = group.items.length > 5 ? 2 : 1;
      const rows = Math.ceil(group.items.length / columns);
      const columnWidth = legendWidth / columns;
      page.append(svgEl("rect", { x: groupX, y: groupY - 8, width: 18, height: 9, rx: 1, fill: "#dce8f7", "fill-opacity": group.fill, stroke: "#dce8f7", "stroke-opacity": group.stroke, "stroke-width": 1 }));
      text(group.label, { x: groupX + 24, y: groupY, fill: "#dce8f7", "font-size": 9.33, "font-weight": 700 });
      group.items.forEach((item, itemIndex) => {
        const column = Math.floor(itemIndex / rows);
        const row = itemIndex % rows;
        const itemFontSize = Math.max(5.2, Math.min(9.33, (columnWidth - 8) / (String(item).length * .56)));
        text(item, { x: groupX + column * columnWidth, y: groupY + 16 + row * 11, fill: "#9bb0c9", "font-size": itemFontSize });
      });
      groupOffsetY += 28 + rows * 11;
    });
  }
  const footerStamp = formatTimestamp(now);
  text(`${configurationCode()} · ${currentOutputPlatformLabel()} · ${footerStamp}`, { x: width / 2, y: height - 62, "text-anchor": "middle", fill: "#a8bfd9", "font-size": 10 });
  text(`Quelle: Wahlrecht.de · Letzter Datenabruf: ${dataRetrievalStamp()}`, { x: width / 2, y: height - 46, "text-anchor": "middle", fill: "#8fa6c1", "font-size": 9 });
  text("© 2026 charavision", { x: width / 2, y: height - 30, "text-anchor": "middle", fill: "#dce8f7", "font-size": 9, "font-weight": 700 });
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

function createA4Pages() {
  const clusters = a4ExportClusters();
  if (!clusters.length) throw new Error("Bitte mindestens eine Partei und ein Parlament auswählen.");
  const layout = a4LayoutFor(clusters);
  const pageGroups = layout.splitLargeCluster
    ? clusters.map(cluster => {
      const splitAt = 30;
      return [
        { ...cluster, bars: cluster.bars.slice(0, splitAt), legendBars: cluster.bars },
        { ...cluster, title: `${cluster.title} · Fortsetzung`, bars: cluster.bars.slice(splitAt), legendBars: cluster.bars, continuation: true }
      ];
    })
    : Array.from({ length: Math.ceil(clusters.length / layout.capacity) }, (_, index) => clusters.slice(index * layout.capacity, index * layout.capacity + layout.capacity));
  return { layout, pages: pageGroups.map((pageClusters, index) => buildA4Page(pageClusters, index + 1, pageGroups.length, layout)) };
}

function applyPreviewZoom() {
  const percent = Number(els.previewZoom.value);
  const baseWidth = document.body.classList.contains("preview-split-active") ? 920 : Math.min(920, Math.max(280, els.previewPages.clientWidth - 56));
  els.previewZoomValue.textContent = `${percent} %`;
  els.previewPages.querySelectorAll(".preview-sheet").forEach(sheet => {
    sheet.style.width = `${baseWidth * percent / 100}px`;
    sheet.style.maxWidth = "none";
  });
}

function setPreviewSplitPosition(clientX) {
  const minimum = 320;
  const maximum = Math.max(minimum, window.innerWidth - 320);
  const position = Math.max(minimum, Math.min(maximum, clientX));
  document.documentElement.style.setProperty("--preview-split-x", `${position}px`);
}

function setPreviewSplit(active) {
  if (active && window.matchMedia("(max-width: 900px)").matches) return;
  const toggle = document.querySelector("#preview-split-toggle");
  const splitter = document.querySelector("#preview-splitter");
  if (els.previewDialog.open) els.previewDialog.close();
  document.body.classList.toggle("preview-split-active", active);
  els.previewDialog.classList.toggle("preview-split", active);
  toggle.setAttribute("aria-pressed", String(active));
  toggle.setAttribute("aria-label", active ? "Geteilte Vorschau schließen" : "Vorschau im geteilten Vollbild anzeigen");
  splitter.hidden = !active;
  if (active) {
    if (!getComputedStyle(document.documentElement).getPropertyValue("--preview-split-x").trim()) setPreviewSplitPosition(window.innerWidth * .56);
    els.previewDialog.show();
  } else {
    els.previewDialog.showModal();
  }
  requestAnimationFrame(applyPreviewZoom);
}

function closeExportPreview() {
  document.body.classList.remove("preview-split-active");
  els.previewDialog.classList.remove("preview-split");
  document.querySelector("#preview-split-toggle").setAttribute("aria-pressed", "false");
  document.querySelector("#preview-splitter").hidden = true;
  if (els.previewDialog.open) els.previewDialog.close();
}

function installPreviewSplitter() {
  const splitter = document.querySelector("#preview-splitter");
  let dragging = false;
  splitter.addEventListener("pointerdown", event => {
    dragging = true;
    splitter.setPointerCapture(event.pointerId);
    splitter.classList.add("dragging");
  });
  splitter.addEventListener("pointermove", event => {
    if (!dragging) return;
    setPreviewSplitPosition(event.clientX);
  });
  const stop = event => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove("dragging");
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
  };
  splitter.addEventListener("pointerup", stop);
  splitter.addEventListener("pointercancel", stop);
  splitter.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const current = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--preview-split-x")) || window.innerWidth * .56;
    setPreviewSplitPosition(current + (event.key === "ArrowLeft" ? -24 : 24));
  });
}

function installPreviewGestures() {
  const surface = els.previewPages;
  const pointers = new Map();
  let startDistance = 0;
  let startZoom = 100;
  let lastTap = 0;
  let pinchActive = false;
  const distance = () => {
    const [first, second] = [...pointers.values()];
    return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
  };
  surface.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    surface.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      startDistance = distance();
      startZoom = Number(els.previewZoom.value);
      pinchActive = true;
      lastTap = 0;
    }
  });
  surface.addEventListener("pointermove", event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    if (pointers.size === 1) {
      surface.scrollLeft -= event.clientX - previous.x;
      surface.scrollTop -= event.clientY - previous.y;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && startDistance) {
      const next = Math.max(Number(els.previewZoom.min), Math.min(Number(els.previewZoom.max), startZoom * distance() / startDistance));
      els.previewZoom.value = String(Math.round(next));
      applyPreviewZoom();
    }
  }, { passive: false });
  const release = event => {
    if (!pointers.has(event.pointerId)) return;
    const endedPinch = pinchActive;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) startDistance = 0;
    if (!pointers.size) pinchActive = false;
    if (!endedPinch && event.type === "pointerup" && event.pointerType !== "mouse") {
      const now = Date.now();
      if (now - lastTap < 320) {
        els.previewZoom.value = Number(els.previewZoom.value) === 100 ? "200" : "100";
        applyPreviewZoom();
        lastTap = 0;
      } else lastTap = now;
    }
  };
  surface.addEventListener("pointerup", release);
  surface.addEventListener("pointercancel", release);
}

async function loadAppRelease() {
  const version = document.querySelector("#android-app-version");
  const reportVersion = document.querySelector("#report-current-version");
  const message = document.querySelector("#android-app-message");
  const appButton = document.querySelector("#android-app-download");
  const macButton = document.querySelector("#mac-app-download");
  const macVersion = document.querySelector("#mac-app-version");
  const introUpdateRow = document.querySelector("#android-intro-update-row");
  const introUpdateButton = document.querySelector("#android-intro-update");
  const runsInAndroidApp = Boolean(window.AndroidApp?.installUpdate);
  const runsInMacApp = Boolean(window.MacApp?.installUpdate);
  const introUpdater = window.AndroidApp?.refreshIntro ? window.AndroidApp : window.MacApp?.refreshIntro ? window.MacApp : null;
  appButton.textContent = runsInAndroidApp ? "Update App" : "Android";
  macButton.textContent = runsInMacApp ? "Update-App" : "macOS";
  introUpdateRow.hidden = !introUpdater;
  if (!introUpdateRow.hidden) {
    introUpdateButton.onclick = () => {
      message.textContent = "Intro und Weboberfläche werden aktualisiert …";
      introUpdater.refreshIntro();
    };
  }
  try {
    const response = await fetch(`app-version.json?update=${Date.now()}`, { cache: "no-store" });
    const release = await response.json();
    if (!response.ok || !release.version || !release.downloadUrl || !release.macVersion || !release.macDownloadUrl) throw new Error("Versionsinformation nicht verfügbar.");
    version.textContent = release.version;
    macVersion.textContent = release.macVersion;
    reportVersion.dataset.androidVersion = release.version;
    reportVersion.dataset.macVersion = release.macVersion;
    updateReportVersionLabel();
    appButton.onclick = () => {
      message.textContent = window.AndroidApp ? "Update wird geöffnet …" : "Download wird gestartet …";
      if (window.AndroidApp?.installUpdate) window.AndroidApp.installUpdate(release.downloadUrl);
      else {
        const link = document.createElement("a");
        link.href = release.downloadUrl;
        link.download = `Sonntagsfragen-Android-v${release.version}.apk`;
        link.click();
      }
    };
    macButton.onclick = () => {
      message.textContent = runsInMacApp ? "Mac-App-Update wird geladen …" : "Download wird gestartet …";
      if (runsInMacApp) window.MacApp.installUpdate(release.macDownloadUrl);
      else if (window.AndroidApp?.downloadFile) window.AndroidApp.downloadFile(release.macDownloadUrl, `Sonntagsfragen-macOS-v${release.macVersion}.zip`);
      else {
        const link = document.createElement("a");
        link.href = release.macDownloadUrl;
        link.download = `Sonntagsfragen-macOS-v${release.macVersion}.zip`;
        link.click();
      }
    };
  } catch (error) {
    version.textContent = "nicht verfügbar";
    macVersion.textContent = "nicht verfügbar";
    reportVersion.textContent = `nicht verfügbar · ${currentPlatformLabel()}`;
    message.textContent = error.message;
  }
}

loadAppRelease();

function showExportPreview() {
  els.previewPages.replaceChildren();
  if (state.a4Mode) {
    const { layout, pages } = createA4Pages();
    pages.forEach((page, index) => {
      page.classList.add("preview-sheet");
      page.style.aspectRatio = `${layout.width} / ${layout.height}`;
      page.setAttribute("aria-label", `Vorschauseite ${index + 1}`);
      els.previewPages.append(page);
    });
    els.previewPageStatus.textContent = `${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"}`;
  } else {
    const chart = prepareChartExport3d(els.chart.cloneNode(true));
    chart.classList.add("preview-sheet");
    chart.removeAttribute("width");
    chart.removeAttribute("height");
    chart.setAttribute("aria-label", "Vorschau der Schlauchausgabe");
    els.previewPages.append(chart);
    els.previewPageStatus.textContent = "Schlauchausgabe";
  }
  els.previewDialog.showModal();
  requestAnimationFrame(applyPreviewZoom);
}

async function exportA4(format) {
  const { layout, pages } = createA4Pages();
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

const reportApiUrl = String(window.REPORT_API_URL || "").replace(/\/$/, "");
let reportPin = "";
let currentReportRole = "";
let reportsNewestFirst = true;
const reportIdentities = {
  Admin: { person: "Sebastian", work: "Admin" },
  Helper2: { person: "Theresa", work: "Helper2" },
  Helper3: { person: "Felix", work: "Helper3" }
};
let currentReportIdentity = null;
async function reportRequest(path, options = {}) {
  if (!reportApiUrl) throw new Error("Die Reportfunktion ist noch nicht mit dem Speicherdienst verbunden.");
  const response = await fetch(`${reportApiUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Report-Pin": reportPin, ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Die Reportfunktion ist momentan nicht erreichbar.");
  return payload;
}

const developerFeatures = [
  ["intro", "Intro"], ["deviceForce", "Geräteforce"], ["tabMode", "Reitermodus"], ["dataUpdate", "Datenupdate"],
  ["pollDateSelection", "Umfragen: Zeitmodi"],
  ["abbreviations", "Abkürzungen"], ["sinceElection", "Seit Wahl"],
  ["labels", "Beschriftungen"], ["regionLabelMode", "Beschriftung: Parlamente"], ["partyLabelMode", "Beschriftung: Parteien"], ["percentLabelMode", "Beschriftung: Prozentwerte"], ["sinceElectionMode", "Beschriftung: Seit Wahl"],
  ["barColors", "Balken"], ["barColorMode", "Balken: Farbe"], ["barNeon", "Balken: Neon"], ["percentValues", "Prozentwerte"],
  ["lut", "LUT"], ["yAxisMode", "LUT: Y-Achse"], ["background", "LUT: Hintergrund"], ["brackets", "LUT: Klammern"], ["viewSize", "Zoom"], ["uiScale", "Bediengrößen-Regler"], ["fullscreen", "Vollbild"], ["fullscreenDefault", "Vollbild standard"], ["preview", "Vorschau"],
  ["a4Output", "A4-Ausgabe"], ["export3d", "3D (für Grafikausgabe)"]
];
const developerFeatureOptions = {
  regionLabelMode: [["auto", "Auto"], ["0", "0°"], ["90", "90°"], ["off", "Aus"]],
  partyLabelMode: [["auto", "Auto"], ["0", "0°"], ["90", "90°"], ["off", "Aus"]],
  percentLabelMode: [["with", "Mit %"], ["without", "Ohne %"], ["off", "Aus"]],
  sinceElectionMode: [["color", "Farbig"], ["gray", "Grau"], ["off", "Aus"]],
  barColorMode: [["party", "Parteifarben"], ["lightblue", "Hellblau"], ["gray", "Grau"]],
  yAxisMode: [["static", "Statisch"], ["dynamic", "Dynamisch"], ["off", "Aus"]]
};
const developerDefaultValue = (key, platform) => ({
  deviceForce: platform === "mobile" ? "mobile" : "desktop", regionLabelMode: "auto", partyLabelMode: "auto",
  percentLabelMode: "without", sinceElectionMode: "color", barColorMode: "party", yAxisMode: "static"
}[key] ?? !["export3d", "tabMode", "pollDateSelection"].includes(key));
const defaultDeveloperSettings = () => {
  const defaults = {
    mobile: Object.fromEntries(developerFeatures.map(([key]) => [key, { visible: true, value: developerDefaultValue(key, "mobile") }])),
    desktop: Object.fromEntries(developerFeatures.map(([key]) => [key, { visible: true, value: developerDefaultValue(key, "desktop") }]))
  };
  ["mobile", "desktop"].forEach(platform => { defaults[platform].helperAppAccess = { visible: false, value: false }; });
  return defaults;
};
let developerSettings = defaultDeveloperSettings();
let publicDeveloperSettingsPromise;
const completeDeveloperSettings = input => {
  const defaults = defaultDeveloperSettings();
  ["mobile", "desktop"].forEach(platform => developerFeatures.forEach(([key]) => {
    if (input?.[platform]?.[key]) defaults[platform][key] = input[platform][key];
  }));
  ["mobile", "desktop"].forEach(platform => {
    if (input?.[platform]?.helperAppAccess) defaults[platform].helperAppAccess = input[platform].helperAppAccess;
  });
  if (!input?.mobile?.tabMode || !input?.desktop?.tabMode) {
    try {
      const local = JSON.parse(localStorage.getItem("developer-tab-mode") || "null");
      if (local) ["mobile", "desktop"].forEach(platform => { if (typeof local[platform] === "boolean") defaults[platform].tabMode.value = local[platform]; });
    } catch (error) { /* Ungültige alte lokale Einstellung ignorieren. */ }
  }
  if (!input?.mobile?.fullscreenDefault || !input?.desktop?.fullscreenDefault) {
    try {
      const local = JSON.parse(localStorage.getItem("developer-fullscreen-default") || "null");
      if (local) ["mobile", "desktop"].forEach(platform => { if (typeof local[platform] === "boolean") defaults[platform].fullscreenDefault.value = local[platform]; });
    } catch (error) { /* Ungültige lokale Einstellung ignorieren. */ }
  }
  if (!input?.mobile?.helperAppAccess || !input?.desktop?.helperAppAccess) {
    try {
      const local = JSON.parse(localStorage.getItem("helper-app-access") || "null");
      if (typeof local === "boolean") ["mobile", "desktop"].forEach(platform => { defaults[platform].helperAppAccess.value = local; });
    } catch (error) { /* Ungültige lokale Einstellung ignorieren. */ }
  }
  return defaults;
};

const helperAppAccessEnabled = () => Boolean(developerSettings.mobile.helperAppAccess?.value || developerSettings.desktop.helperAppAccess?.value);

async function fetchDeveloperSettings(force = false) {
  if (force) publicDeveloperSettingsPromise = null;
  if (!publicDeveloperSettingsPromise) publicDeveloperSettingsPromise = fetch(`${reportApiUrl}/settings/developer?update=${Date.now()}`, { cache: "no-store" })
    .then(async response => {
      const payload = await response.json();
      if (!response.ok || !payload.settings) throw new Error("Entwicklereinstellungen sind nicht erreichbar.");
      return completeDeveloperSettings(payload.settings);
    })
    .catch(() => defaultDeveloperSettings());
  developerSettings = await publicDeveloperSettingsPromise;
  return developerSettings;
}

async function refreshDeveloperSettings() {
  const previous = JSON.stringify(developerSettings);
  await fetchDeveloperSettings(true);
  if (JSON.stringify(developerSettings) === previous) return;
  applyDeveloperSettings();
  if (state.data) render(false);
  const panel = document.querySelector("#report-developer");
  if (panel && !panel.hidden && currentReportRole) renderDeveloperSettings(currentReportRole !== "Admin");
}

function platformDeveloperSettings() {
  return developerSettings[startsMobile ? "mobile" : "desktop"];
}

function applyDeveloperSettings() {
  const settings = platformDeveloperSettings();
  const setVisible = (selector, visible) => {
    const node = document.querySelector(selector);
    if (node) node.hidden = !visible;
  };
  state.mobileView = settings.deviceForce.value === "mobile";
  state.electionDates = !state.mobileView;
  state.fullRegionNames = !settings.abbreviations.value;
  state.showSinceElection = Boolean(settings.sinceElection.value);
  state.showBrackets = Boolean(settings.brackets.value);
  setLabelsEnabled(settings.labels.value);
  state.regionLabelMode = settings.regionLabelMode.value;
  state.partyLabelMode = settings.partyLabelMode.value;
  state.percentLabelMode = settings.percentLabelMode.value;
  state.sinceElectionMode = settings.sinceElectionMode.value;
  state.showSinceElection = state.showSinceElection && state.sinceElectionMode !== "off";
  if (!state.showLabels) {
    state.showSinceElection = false;
    state.sinceElectionMode = "off";
  }
  state.barColors = Boolean(settings.barColors.value);
  state.barColorMode = settings.barColorMode.value;
  state.barNeon = Boolean(settings.barNeon.value);
  state.showPercentValues = Boolean(settings.percentValues.value);
  state.showPercentValues = state.showPercentValues && state.percentLabelMode !== "off";
  setPollTimeMode(settings.pollDateSelection.value ? "free" : "current");
  state.showLut = Boolean(settings.lut.value);
  yAxisMode = settings.yAxisMode.value;
  setCycleButton(document.querySelector("#y-axis-mode"), yAxisMode, [["static", "Statisch"], ["dynamic", "Dynamisch"], ["off", "Aus"]]);
  state.showBackground = Boolean(settings.background.value);
  state.viewSizeEnabled = Boolean(settings.viewSize.value);
  state.viewZoomEnabled = state.viewSizeEnabled;
  els.viewZoomEnabled.checked = state.viewZoomEnabled;
  state.fullscreenEnabled = true;
  els.fullscreenEnabled.checked = state.fullscreenEnabled;
  state.fullscreenDefault = true;
  state.a4Mode = Boolean(settings.a4Output.value);
  state.export3d = Boolean(settings.export3d.value);
  state.tabMode = Boolean(settings.tabMode?.value);
  document.querySelector("#header-tab-mode-setting").hidden = !settings.tabMode?.visible;
  updateSelectionTabMode();
  setVisible("#chart-settings .view-switch", settings.deviceForce.visible);
  setVisible("#update-data", settings.dataUpdate.visible);
  setVisible(".poll-time-switch", settings.pollDateSelection.visible);
  setVisible("#abbreviation-mode", settings.abbreviations.visible);
  setVisible("#brackets-mode", settings.brackets.visible);
  setVisible(".labels-choice", settings.labels.visible);
  setVisible("#region-label-mode", settings.regionLabelMode.visible);
  setVisible("#party-label-mode", settings.partyLabelMode.visible);
  setVisible("#percent-label-mode", settings.percentLabelMode.visible && settings.percentValues.visible);
  setVisible("#since-election-mode", settings.sinceElectionMode.visible && settings.sinceElection.visible);
  setVisible(".bar-colors-choice", settings.barColors.visible);
  setVisible("#bar-color-mode", settings.barColorMode.visible);
  setVisible("#bar-neon-mode", settings.barNeon.visible);
  setVisible(".lut-choice", settings.lut.visible);
  setVisible("#background-mode", settings.background.visible);
  setVisible("#y-axis-mode", settings.yAxisMode.visible);
  setVisible("#ui-scale-toggle", settings.uiScale.visible);
  const uiScaleToggle = document.querySelector("#ui-scale-toggle");
  if (uiScaleToggle) uiScaleToggle.disabled = !settings.uiScale.value;
  if (!settings.uiScale.visible || !settings.uiScale.value) {
    const uiScalePanel = document.querySelector("#ui-scale-panel");
    if (uiScalePanel) uiScalePanel.hidden = true;
  }
  els.viewZoomControls.hidden = !settings.viewSize.visible || !state.viewZoomEnabled;
  setVisible(".fullscreen-choice", settings.fullscreen.visible);
  els.fullscreenEnter.hidden = !settings.fullscreen.visible || !state.fullscreenEnabled;
  setVisible("#preview-export", settings.preview.visible);
  const a4Choice = document.querySelector('input[name="output-shape"][value="a4"]')?.closest("label");
  if (a4Choice) a4Choice.hidden = !settings.a4Output.visible;
  const export3dChoice = document.querySelector("#export-3d")?.closest("label");
  if (export3dChoice) export3dChoice.hidden = !settings.export3d.visible;
  els.updateData.disabled = !settings.dataUpdate.value;
  els.viewSizeDown.disabled = !state.viewSizeEnabled;
  els.viewSizeUp.disabled = !state.viewSizeEnabled;
  els.viewWidthDown.disabled = !state.viewSizeEnabled;
  els.viewWidthUp.disabled = !state.viewSizeEnabled;
  els.fullscreenEnter.disabled = !state.fullscreenEnabled;
  setCycleButton(els.barColorMode, state.barColorMode, [["party", "Parteifarben"], ["lightblue", "Hellblau"], ["gray", "Grau"]]);
  setCycleButton(els.barNeonMode, state.barNeon ? "on" : "off", [["on", "An"], ["off", "Aus"]]);
  setFullscreenView(true);
  applyViewMode();
}

function renderDeveloperSettings(readOnly) {
  const list = document.querySelector("#report-developer-list");
  list.replaceChildren();
  const head = document.createElement("div");
  head.className = "developer-head";
  head.innerHTML = "<span>Funktion</span><span>Mobil &amp; App</span><span>Desktop</span>";
  list.append(head);
  developerFeatures.forEach(([key, label]) => {
    const row = document.createElement("div");
    row.className = "developer-row";
    const title = document.createElement("strong");
    title.textContent = label;
    row.append(title);
    ["mobile", "desktop"].forEach(platform => {
      const cell = document.createElement("div");
      cell.className = "developer-platform";
      cell.classList.toggle("is-hidden", !developerSettings[platform][key].visible);
      cell.dataset.label = platform === "mobile" ? "Mobil & App" : "Desktop";
      if (readOnly) {
        cell.classList.add("developer-platform-readonly");
        const visibility = document.createElement("span");
        visibility.className = `developer-readonly-state ${developerSettings[platform][key].visible ? "is-on" : "is-off"}`;
        visibility.textContent = developerSettings[platform][key].visible ? "Sichtbar" : "Verborgen";
        const value = document.createElement("span");
        value.className = `developer-readonly-state ${key === "deviceForce" || developerFeatureOptions[key] || developerSettings[platform][key].value ? "is-on" : "is-off"}`;
        value.textContent = key === "deviceForce"
          ? (developerSettings[platform][key].value === "mobile" ? "Mobil" : "Desktop")
          : developerFeatureOptions[key]
            ? (developerFeatureOptions[key].find(([option]) => option === developerSettings[platform][key].value)?.[1] || developerSettings[platform][key].value)
            : (developerSettings[platform][key].value ? "Aktiv" : "Inaktiv");
        cell.append(visibility, value);
        row.append(cell);
        return;
      }
      const visibleLabel = document.createElement("label");
      visibleLabel.className = "developer-onoff";
      visibleLabel.title = "Funktion anzeigen";
      const visible = document.createElement("input");
      visible.type = "checkbox";
      visible.checked = developerSettings[platform][key].visible;
      visible.disabled = readOnly;
      const track = document.createElement("span");
      visibleLabel.append(visible, track);
      let value;
      if (key === "deviceForce" || developerFeatureOptions[key]) {
        value = document.createElement("select");
        const options = key === "deviceForce" ? [["desktop", "Desktop"], ["mobile", "Mobil"]] : developerFeatureOptions[key];
        options.forEach(([optionValue, optionLabel]) => value.add(new Option(optionLabel, optionValue)));
        value.value = developerSettings[platform][key].value;
      } else {
        const valueLabel = document.createElement("label");
        value = document.createElement("input");
        value.type = "checkbox";
        value.checked = Boolean(developerSettings[platform][key].value);
        valueLabel.append(value, " Aktiv");
        cell.append(visibleLabel, valueLabel);
      }
      value.disabled = readOnly;
      visible.addEventListener("change", () => {
        developerSettings[platform][key].visible = visible.checked;
        cell.classList.toggle("is-hidden", !visible.checked);
        saveDeveloperSettings();
        if (platform === (startsMobile ? "mobile" : "desktop")) { applyDeveloperSettings(); if (state.data) render(false); }
      });
      value.addEventListener("change", () => {
        developerSettings[platform][key].value = key === "deviceForce" || developerFeatureOptions[key] ? value.value : value.checked;
        saveDeveloperSettings();
        if (platform === (startsMobile ? "mobile" : "desktop")) { applyDeveloperSettings(); if (state.data) render(false); }
      });
      if (key === "deviceForce" || developerFeatureOptions[key]) cell.append(visibleLabel, value);
      row.append(cell);
    });
    list.append(row);
  });
}

let developerSaveTimer;
function saveDeveloperSettings() {
  clearTimeout(developerSaveTimer);
  const message = document.querySelector("#report-developer-message");
  message.textContent = "Änderungen werden gespeichert …";
  developerSaveTimer = setTimeout(async () => {
    try {
      const pending = structuredClone(developerSettings);
      localStorage.setItem("developer-tab-mode", JSON.stringify({ mobile: pending.mobile.tabMode.value, desktop: pending.desktop.tabMode.value }));
      localStorage.setItem("developer-fullscreen-default", JSON.stringify({ mobile: pending.mobile.fullscreenDefault.value, desktop: pending.desktop.fullscreenDefault.value }));
      localStorage.setItem("helper-app-access", JSON.stringify(Boolean(pending.mobile.helperAppAccess.value || pending.desktop.helperAppAccess.value)));
      const payload = await reportRequest("/settings/developer", { method: "PATCH", body: JSON.stringify({ settings: developerSettings }) });
      developerSettings = completeDeveloperSettings(payload.settings);
      if (!payload.settings?.mobile?.tabMode) developerSettings.mobile.tabMode = pending.mobile.tabMode;
      if (!payload.settings?.desktop?.tabMode) developerSettings.desktop.tabMode = pending.desktop.tabMode;
      if (!payload.settings?.mobile?.fullscreenDefault) developerSettings.mobile.fullscreenDefault = pending.mobile.fullscreenDefault;
      if (!payload.settings?.desktop?.fullscreenDefault) developerSettings.desktop.fullscreenDefault = pending.desktop.fullscreenDefault;
      if (!payload.settings?.mobile?.helperAppAccess) developerSettings.mobile.helperAppAccess = pending.mobile.helperAppAccess;
      if (!payload.settings?.desktop?.helperAppAccess) developerSettings.desktop.helperAppAccess = pending.desktop.helperAppAccess;
      publicDeveloperSettingsPromise = Promise.resolve(developerSettings);
      message.textContent = "Einstellungen gespeichert.";
    } catch (error) { message.textContent = error.message; }
  }, 250);
}

function showEddaThanks() {
  const overlay = document.querySelector("#edda-thanks");
  const fireworks = document.querySelector("#edda-fireworks");
  if (!overlay || !fireworks) return;
  fireworks.replaceChildren();
  const colors = ["#59d9ff", "#c252ff", "#ffe04f", "#42e878", "#ff7391"];
  [[37, 42], [63, 39], [50, 62]].forEach(([originX, originY], burst) => {
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12 + burst * .18;
      const distance = 55 + (index % 3) * 18;
      const spark = document.createElement("span");
      spark.style.setProperty("--x", `${originX}%`);
      spark.style.setProperty("--y", `${originY}%`);
      spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      spark.style.setProperty("--delay", `${.18 + burst * .2 + index * .012}s`);
      spark.style.setProperty("--color", colors[(index + burst) % colors.length]);
      fireworks.append(spark);
    }
  });
  if (overlay.open) overlay.close();
  overlay.classList.remove("is-playing");
  requestAnimationFrame(() => {
    overlay.classList.add("is-playing");
    overlay.showModal();
    setTimeout(() => { if (overlay.open) overlay.close(); overlay.classList.remove("is-playing"); }, 3300);
  });
}

async function loadReports() {
  const list = document.querySelector("#report-list");
  list.innerHTML = '<p class="report-empty">Einträge werden geladen …</p>';
  const { reports } = await reportRequest("/reports");
  list.replaceChildren();
  if (!reports.length) { list.innerHTML = '<p class="report-empty">Noch keine Einträge vorhanden.</p>'; return; }
  [...reports].sort((left, right) => {
    const difference = new Date(right.created_at) - new Date(left.created_at);
    return reportsNewestFirst ? difference : -difference;
  }).forEach(report => {
    const article = document.createElement("article");
    article.className = "report-entry";
    const head = document.createElement("div"); head.className = "report-entry-head";
    const workName = document.createElement("strong"); workName.textContent = report.reporter || "Reporter";
    head.append(workName);
    if (report.subject && report.subject !== "Meldung") { const title = document.createElement("span"); title.className = "report-entry-title"; title.textContent = report.subject; head.append(title); }
    if (report.configuration) { const code = document.createElement("code"); code.textContent = report.configuration; head.append(code); }
    if (currentReportRole === "Admin") {
      const remove = document.createElement("button");
      remove.className = "report-delete"; remove.type = "button"; remove.textContent = "Löschen";
      remove.addEventListener("click", async () => {
        if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
        remove.disabled = true;
        try { await reportRequest(`/reports/${encodeURIComponent(report.id)}`, { method: "DELETE" }); await loadReports(); }
        catch (error) { remove.disabled = false; window.alert(error.message); }
      });
      head.append(remove);
    }
    const body = document.createElement("p"); body.textContent = report.body;
    const meta = document.createElement("time");
    meta.dateTime = report.created_at;
    meta.textContent = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.created_at));
    article.append(head, body, meta);
    list.append(article);
  });
}

async function loadReportAccounts() {
  const list = document.querySelector("#report-account-list");
  list.innerHTML = '<p class="report-empty">Accounts werden geladen …</p>';
  const { accounts } = await reportRequest(`/accounts?update=${Date.now()}`, { cache: "no-store" });
  list.replaceChildren();
  accounts.forEach(account => {
    const row = document.createElement("div"); row.className = "report-account-row";
    const main = document.createElement("div"); main.className = "report-account-main";
    const name = document.createElement("strong"); name.textContent = `${account.personName} (${account.workName})`;
    const role = document.createElement("span"); role.textContent = account.role;
    const projectsButton = document.createElement("button"); projectsButton.type = "button"; projectsButton.className = "report-account-projects-button"; projectsButton.textContent = "P"; projectsButton.setAttribute("aria-label", `Projekte von ${account.personName} anzeigen`);
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "Reset PIN";
    const trash = document.createElement("button"); trash.type = "button"; trash.className = "report-account-trash"; trash.textContent = "🗑"; trash.setAttribute("aria-label", `Account ${account.personName} löschen`);
    main.append(name, role, projectsButton, reset, trash); row.append(main);

    projectsButton.addEventListener("click", async () => {
      row.querySelector(".report-account-reset")?.remove();
      row.querySelector(".report-account-confirm")?.remove();
      const existing = row.querySelector(".report-account-projects");
      if (existing) { existing.remove(); projectsButton.classList.remove("active"); return; }
      document.querySelectorAll(".report-account-projects").forEach(panel => panel.remove());
      document.querySelectorAll(".report-account-projects-button.active").forEach(button => button.classList.remove("active"));
      projectsButton.classList.add("active");
      const panel = document.createElement("div"); panel.className = "report-account-projects";
      row.append(panel);
      try {
        let projects = account.projects || [];
        if (!projects.length && account.workName === currentReportIdentity?.work) {
          const ownProjects = await reportRequest(`/projects?update=${Date.now()}`, { cache: "no-store" });
          projects = ownProjects.projects || [];
        }
        panel.replaceChildren();
        if (!projects.length) {
          const empty = document.createElement("p"); empty.className = "report-empty"; empty.textContent = "Keine gespeicherten Projekte."; panel.append(empty);
        } else projects.forEach(project => {
          const projectButton = document.createElement("button"); projectButton.type = "button"; projectButton.className = "report-account-project-button";
          const title = document.createElement("strong"); title.textContent = project.title;
          const detail = document.createElement("span"); detail.textContent = project.detail;
          projectButton.append(title, detail);
          projectButton.addEventListener("click", () => {
            applyConfigurationCode(project.configuration, { nativeLayout: true });
            restoreSavedPollSelection(project.poll_selection);
            els.inputCode.value = project.configuration;
            const dialog = document.querySelector("#report-dialog");
            dialog.classList.remove("project-picker-dialog", "startup-project-dialog", "guest-project-dialog");
            dialog.close();
          });
          panel.append(projectButton);
        });
      } catch (error) {
        panel.replaceChildren();
        const notice = document.createElement("p"); notice.className = "report-empty"; notice.textContent = error.message; panel.append(notice);
      }
    });

    reset.addEventListener("click", () => {
      row.querySelector(".report-account-projects")?.remove();
      projectsButton.classList.remove("active");
      row.querySelector(".report-account-confirm")?.remove();
      const panel = document.createElement("form"); panel.className = "report-account-reset";
      const label = document.createElement("label"); label.textContent = "Wie lautet der neue PIN?";
      const input = document.createElement("input"); input.maxLength = 5; input.minLength = 5; input.required = true; input.autocomplete = "new-password";
      label.append(input);
      const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "PIN speichern";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Abbrechen";
      const actions = document.createElement("div"); actions.className = "report-account-confirm-actions"; actions.append(submit, cancel);
      panel.append(label, actions); row.append(panel); input.focus();
      input.addEventListener("input", () => { input.value = input.value.slice(0, 5).toUpperCase(); });
      cancel.addEventListener("click", () => panel.remove());
      panel.addEventListener("submit", async event => {
        event.preventDefault(); submit.disabled = true;
        try { await reportRequest(`/accounts/${encodeURIComponent(account.id)}/pin`, { method: "PATCH", body: JSON.stringify({ pin: input.value.trim().toUpperCase() }) }); panel.remove(); window.alert("PIN wurde geändert."); }
        catch (error) { submit.disabled = false; window.alert(error.message); }
      });
    });

    trash.addEventListener("click", () => {
      row.querySelector(".report-account-projects")?.remove();
      projectsButton.classList.remove("active");
      row.querySelector(".report-account-reset")?.remove();
      const confirm = document.createElement("div"); confirm.className = "report-account-confirm";
      const question = document.createElement("p"); question.textContent = "Account wirklich löschen?";
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "Ja, löschen";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Abbrechen";
      const actions = document.createElement("div"); actions.className = "report-account-confirm-actions"; actions.append(remove, cancel);
      confirm.append(question, actions); row.append(confirm);
      cancel.addEventListener("click", () => confirm.remove());
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try { await reportRequest(`/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" }); await loadReportAccounts(); }
        catch (error) { remove.disabled = false; window.alert(error.message); }
      });
    });
    list.append(row);
  });
}

function normalizeData(data) {
    data.polls = Object.fromEntries(Object.entries(data.polls).map(([region, rows]) => [region, rows.map(row => ({
      date: row[0], institute: row[1], client: row[2],
      values: Object.fromEntries(data.parties.map((party, index) => [party, row[3][index] || 0]))
    }))]));
    data.elections = Object.fromEntries(Object.entries(data.elections || {}).map(([region, row]) => [region, {
      date: row[0], values: Object.fromEntries(data.parties.map((party, index) => [party, row[1][index] || 0])), represented: row[2] || []
    }]));
    return data;
}

async function fetchLatestData() {
  const response = await fetch(`data/polls.json?update=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Daten konnten nicht geladen werden");
  const data = normalizeData(await response.json());
  const retrievedAt = new Date();
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(retrievedAt).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  data.updated = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  data.updatedAt = retrievedAt.toISOString();
  return data;
}

function updateHeaderTimestamp(data) {
  els.updated.textContent = formatDate(data.updated);
  els.updatedTime.textContent = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short", timeZone: "Europe/Berlin"
  }).format(new Date(data.updatedAt));
}

async function startAppIntro() {
  const intro = document.querySelector("#app-intro");
  const canvas = document.querySelector("#intro-canvas");
  const brand = document.querySelector("#intro-brand");
  const target = document.querySelector(".title-lockup");
  if (!intro || !canvas || !brand || !target) return;
  try {
    const settings = await fetchDeveloperSettings();
    const introSetting = settings[startsMobile ? "mobile" : "desktop"].intro;
    if (!introSetting.visible || !introSetting.value) {
      intro.remove();
      document.body.classList.remove("intro-running");
      return;
    }
  } catch (error) {
    // Falls die Einstellung kurzzeitig nicht erreichbar ist, bleibt das Intro aktiv.
  }
  const context = canvas.getContext("2d");
  const startTime = performance.now();
  let frameId = 0;
  let viewportWidth = 0;
  let viewportHeight = 0;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => {
    const amount = clamp(value);
    return amount * amount * (3 - 2 * amount);
  };
  const mix = (from, to, amount) => from + (to - from) * amount;
  const bars = [
    { x: -2.8, z: 8, width: 2.6, depth: 2.5, height: 7.2, start: .85, color: [54, 184, 255] },
    { x: 2.5, z: 18, width: 2.7, depth: 2.6, height: 5.4, start: 1.55, color: [255, 224, 79] },
    { x: -2.2, z: 29, width: 3, depth: 2.8, height: 9.6, start: 2.25, color: [66, 232, 120] },
    { x: 1.2, z: 43, width: 3.4, depth: 3.2, height: 16.5, start: 3.05, color: [194, 82, 255] }
  ];
  const resizeCanvas = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.round(viewportWidth * ratio);
    canvas.height = Math.round(viewportHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const vector = (x, y, z) => ({ x, y, z });
  const subtract = (left, right) => vector(left.x - right.x, left.y - right.y, left.z - right.z);
  const dot = (left, right) => left.x * right.x + left.y * right.y + left.z * right.z;
  const cross = (left, right) => vector(left.y * right.z - left.z * right.y, left.z * right.x - left.x * right.z, left.x * right.y - left.y * right.x);
  const normalize = value => {
    const length = Math.hypot(value.x, value.y, value.z) || 1;
    return vector(value.x / length, value.y / length, value.z / length);
  };
  const cameraAt = seconds => {
    const travel = smooth(seconds / 4.85);
    const climb = smooth((seconds - 4.15) / 1.55);
    return {
      position: vector(mix(0, .8, climb), mix(2.25, 5.7, climb), mix(-8, 38.5, travel)),
      target: vector(mix(0, 1.2, climb), mix(1.25, 13.8, climb), mix(15, 43.7, climb))
    };
  };
  const projectorFor = camera => {
    const forward = normalize(subtract(camera.target, camera.position));
    const right = normalize(cross(forward, vector(0, 1, 0)));
    const up = normalize(cross(right, forward));
    const focal = Math.min(viewportWidth, viewportHeight) * .9;
    return point => {
      const relative = subtract(point, camera.position);
      const depth = dot(relative, forward);
      if (depth < .3) return null;
      return {
        x: viewportWidth * .5 + dot(relative, right) * focal / depth,
        y: viewportHeight * .53 - dot(relative, up) * focal / depth,
        depth
      };
    };
  };
  const strokeWorldLine = (project, from, to, alpha, width = 1) => {
    const first = project(from);
    const second = project(to);
    if (!first || !second) return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(second.x, second.y);
    context.strokeStyle = `rgba(72, 169, 255, ${alpha})`;
    context.lineWidth = width;
    context.stroke();
  };
  const polygon = (points, fill, stroke, glow = 0) => {
    if (points.some(point => !point)) return;
    context.save();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.fillStyle = fill;
    context.shadowColor = stroke;
    context.shadowBlur = glow;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  };
  const drawBar = (project, bar, seconds, sceneAlpha) => {
    const growth = smooth((seconds - bar.start) / .48);
    if (growth <= 0) return;
    const height = Math.max(.03, bar.height * growth);
    const x0 = bar.x - bar.width / 2;
    const x1 = bar.x + bar.width / 2;
    const z0 = bar.z - bar.depth / 2;
    const z1 = bar.z + bar.depth / 2;
    const vertices = [
      vector(x0, 0, z0), vector(x1, 0, z0), vector(x1, 0, z1), vector(x0, 0, z1),
      vector(x0, height, z0), vector(x1, height, z0), vector(x1, height, z1), vector(x0, height, z1)
    ].map(project);
    const [red, green, blue] = bar.color;
    const edge = `rgba(${red}, ${green}, ${blue}, ${.94 * sceneAlpha})`;
    polygon([vertices[0], vertices[1], vertices[5], vertices[4]], `rgba(${red}, ${green}, ${blue}, ${.39 * sceneAlpha})`, edge, 14);
    polygon([vertices[1], vertices[2], vertices[6], vertices[5]], `rgba(${red}, ${green}, ${blue}, ${.25 * sceneAlpha})`, edge, 10);
    polygon([vertices[4], vertices[5], vertices[6], vertices[7]], `rgba(${Math.min(255, red + 30)}, ${Math.min(255, green + 30)}, ${Math.min(255, blue + 30)}, ${.58 * sceneAlpha})`, edge, 17);
  };
  const drawScene = now => {
    const seconds = (now - startTime) / 1000;
    const sceneAlpha = smooth(seconds / .7) * (1 - smooth((seconds - 5.85) / 1.05));
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    const camera = cameraAt(seconds);
    const project = projectorFor(camera);
    context.save();
    context.globalAlpha = sceneAlpha;
    const gridStart = Math.floor((camera.position.z + 1) / 2) * 2;
    for (let x = -22; x <= 22; x += 2) strokeWorldLine(project, vector(x, 0, gridStart), vector(x, 0, camera.position.z + 72), .28, x === 0 ? 1.4 : 1);
    for (let z = gridStart; z <= camera.position.z + 72; z += 2) {
      const distance = z - camera.position.z;
      strokeWorldLine(project, vector(-22, 0, z), vector(22, 0, z), .16 + .28 * (1 - clamp(distance / 72)));
    }
    bars.slice().sort((left, right) => right.z - left.z).forEach(bar => drawBar(project, bar, seconds, sceneAlpha));
    context.restore();
    if (seconds < 7.5 && intro.isConnected) frameId = requestAnimationFrame(drawScene);
  };
  const placeBrand = () => {
    const box = target.getBoundingClientRect();
    const titleStyle = getComputedStyle(target.querySelector("h1"));
    brand.style.left = `${box.left}px`;
    brand.style.top = `${box.top}px`;
    brand.style.width = `${box.width}px`;
    brand.style.height = `${box.height}px`;
    brand.querySelector("strong").style.fontSize = titleStyle.fontSize;
  };
  resizeCanvas();
  placeBrand();
  frameId = requestAnimationFrame(drawScene);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("resize", placeBrand, { passive: true });
  let revealTimer;
  let finishTimer;
  const finish = () => {
    clearTimeout(revealTimer);
    clearTimeout(finishTimer);
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("resize", placeBrand);
    document.body.classList.add("intro-reveal");
    intro.remove();
    document.body.classList.remove("intro-running", "intro-reveal");
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  revealTimer = setTimeout(() => document.body.classList.add("intro-reveal"), 6350);
  finishTimer = setTimeout(finish, 7450);
  intro.addEventListener("click", finish, { once: true });
  document.addEventListener("keydown", event => { if (event.key === "Escape" || event.key === "Enter" || event.key === " ") finish(); }, { once: true });
}

async function waitForVisibleAppSurface() {
  const nativeApp = window.AndroidApp?.isSurfaceReady ? window.AndroidApp : window.MacApp?.isSurfaceReady ? window.MacApp : null;
  if (!nativeApp) return;
  const timeoutAt = Date.now() + 5000;
  while (!nativeApp.isSurfaceReady() && Date.now() < timeoutAt) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await new Promise(resolve => setTimeout(resolve, 400));
}

async function startSimpleAppIntro() {
  const intro = document.querySelector("#app-intro");
  const brand = document.querySelector("#intro-brand");
  const targetBrand = document.querySelector("#intro-brand-target");
  if (!intro || !brand || !targetBrand) return;
  try {
    const settings = await fetchDeveloperSettings();
    const introSetting = settings[startsMobile ? "mobile" : "desktop"].intro;
    if (!introSetting.visible || !introSetting.value) {
      intro.remove();
      document.body.classList.remove("intro-running");
      return;
    }
  } catch (error) {
    // Bei einem kurzen Netzausfall darf das lokale Intro weiterhin starten.
  }
  await waitForVisibleAppSurface();
  intro.classList.remove("intro-waiting");
  intro.classList.add("simple-intro");
  brand.style.left = "50%";
  brand.style.top = "55%";
  brand.style.width = "max-content";
  brand.style.height = "auto";
  brand.style.transform = "translate(-50%, -50%)";
  targetBrand.style.left = "50%";
  targetBrand.style.top = "18px";
  targetBrand.style.width = "max-content";
  targetBrand.style.height = "auto";
  targetBrand.style.transform = "translateX(-50%)";
  targetBrand.style.opacity = "1";
  const makeLetters = (container, fontSize) => {
    const word = container.querySelector("strong");
    word.style.fontSize = fontSize;
    const letters = [...word.textContent];
    word.replaceChildren(...letters.map(character => {
      const span = document.createElement("span");
      span.textContent = character;
      return span;
    }));
    return [...word.children];
  };
  const centerLetters = makeLetters(brand, "clamp(48px, 8vw, 104px)");
  const destinationLetters = makeLetters(targetBrand, "clamp(30.5px, 5.25vw, 61px)");
  const irregularDelays = [170, 20, 310, 95, 250, 5, 205, 355, 65, 280, 125, 335, 45, 225, 145];
  const letterAnimations = centerLetters.flatMap((letter, index) => {
    const retreats = [true, false, true, true, false, true, false, false, true, false, true, false, false, true, false][index];
    const outScale = retreats ? .48 : 1.72;
    const inScale = retreats ? 1.45 : .62;
    const driftX = [-9, 7, 3, -6, 10, -3, 6, -8, 4, 9, -5, 2, -10, 5, -2][index];
    const driftY = [5, -7, 8, -3, 4, -8, 2, 7, -5, 6, -2, 9, -6, 3, -4][index];
    const delay = irregularDelays[index] || 0;
    const centerAnimation = letter.animate([
      { opacity: 0, filter: "blur(24px)", transform: "scale(1.35)", offset: 0 },
      { opacity: 1, filter: "blur(0)", transform: "scale(1)", textShadow: "0 0 38px rgba(89,217,255,.72)", offset: .2 },
      { opacity: 1, filter: "blur(0)", transform: "scale(1)", offset: .45 },
      { opacity: .52, filter: "blur(8px)", transform: `translate(${driftX * .45}px, ${driftY * .45}px) scale(${(1 + outScale) / 2})`, offset: .54 },
      { opacity: 0, filter: "blur(24px)", transform: `translate(${driftX}px, ${driftY}px) scale(${outScale})`, offset: .65 },
      { opacity: 0, filter: "blur(24px)", transform: `translate(${driftX}px, ${driftY}px) scale(${outScale})`, offset: 1 }
    ], { duration: 7200, delay, easing: "cubic-bezier(.4,0,.18,1)", fill: "both" });
    const destinationAnimation = destinationLetters[index].animate([
      { opacity: 0, filter: "blur(24px)", transform: `translate(${-driftX}px, ${-driftY}px) scale(${inScale})`, offset: 0 },
      { opacity: 0, filter: "blur(24px)", transform: `translate(${-driftX}px, ${-driftY}px) scale(${inScale})`, offset: .66 },
      { opacity: .48, filter: "blur(9px)", transform: `translate(${-driftX * .35}px, ${-driftY * .35}px) scale(${(1 + inScale) / 2})`, offset: .82 },
      { opacity: 1, filter: "blur(0)", transform: "scale(1)", textShadow: "0 0 20px rgba(89,217,255,.25)", offset: .93 },
      { opacity: 1, filter: "blur(0)", transform: "scale(1)", offset: 1 }
    ], { duration: 7200, delay, easing: "cubic-bezier(.4,0,.18,1)", fill: "both" });
    return [centerAnimation, destinationAnimation];
  });
  await new Promise(resolve => {
    let revealTimer = setTimeout(() => document.body.classList.add("intro-reveal"), 6550);
    let finishTimer;
    const finish = () => {
      clearTimeout(revealTimer);
      clearTimeout(finishTimer);
      letterAnimations.forEach(animation => animation.cancel());
      document.body.classList.add("intro-reveal");
      intro.remove();
      document.body.classList.remove("intro-running", "intro-reveal");
      resolve();
    };
    finishTimer = setTimeout(finish, 7700);
    intro.addEventListener("click", finish, { once: true });
    document.addEventListener("keydown", event => { if (["Escape", "Enter", " "].includes(event.key)) finish(); }, { once: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  });
}

Promise.all([fetchLatestData(), fetchDeveloperSettings()])
  .then(([data]) => {
    state.data = data;
    applyDeveloperSettings();
    els.mobileView.checked = state.mobileView;
    els.electionDates.checked = state.electionDates;
    els.showSinceElection.checked = state.showSinceElection;
    els.showBrackets.checked = state.showBrackets;
    els.fullRegionNames.checked = !state.fullRegionNames;
    setCycleButton(els.abbreviationMode, state.fullRegionNames ? "off" : "on", [["on", "An"], ["off", "Aus"]]);
    els.showLabels.checked = state.showLabels;
    els.showBarColors.checked = state.barColors;
    els.showPercentValues.checked = state.showPercentValues;
    els.showLut.checked = state.showLut;
    els.showBackground.checked = state.showBackground;
    document.querySelector("#export-3d").checked = state.export3d;
    document.querySelector("#a4-mode").checked = state.a4Mode;
    document.querySelector(`input[name="output-shape"][value="${state.a4Mode ? "a4" : "tube"}"]`).checked = true;
    document.querySelector("#a4-orientation-settings").hidden = !state.a4Mode;
    if (startsMobile) document.querySelector("#chart-view-settings").hidden = true;
    updateHeaderTimestamp(data);
    buildControls();
    updateComparisonButtons();
    updateElectionVisibility();
    updatePollOptions(true);
    render();
    document.querySelector("#code-input").addEventListener("submit", event => {
      event.preventDefault();
      try { applyConfigurationCode(els.inputCode.value.trim()); els.codeMessage.textContent = "Konfiguration übernommen."; }
      catch (error) { els.codeMessage.textContent = error.message; }
    });
    const copyOutputCode = async () => {
      await navigator.clipboard.writeText(els.outputCode.textContent);
      els.codeMessage.textContent = "";
      els.exportMessage.textContent = "Code kopiert.";
    };
    document.querySelector("#copy-code").addEventListener("click", copyOutputCode);
    els.updateData.addEventListener("click", async () => {
      els.updateData.disabled = true;
      els.updateMessage.textContent = "";
      els.updateMessage.className = "";
      try {
        const freshData = await fetchLatestData();
        state.data = freshData;
        updateHeaderTimestamp(freshData);
        updatePollOptions(false);
        render(false);
        els.updateMessage.textContent = "Update successfull";
        els.updateMessage.className = "success";
        setTimeout(() => { if (els.updateMessage.classList.contains("success")) { els.updateMessage.textContent = ""; els.updateMessage.className = ""; } }, 2600);
      } catch (error) {
        els.updateMessage.textContent = "Update failed";
        els.updateMessage.className = "error";
      } finally { els.updateData.disabled = false; }
    });
    document.querySelector("#average-mode").addEventListener("change", event => {
      state.averageMode = event.currentTarget.checked;
      document.querySelector("#tab-average-switch").checked = state.averageMode;
      render();
    });
    els.mobileView.addEventListener("change", event => {
      state.mobileView = event.currentTarget.checked;
      document.querySelector("#chart-view-settings").hidden = state.mobileView;
      render(false);
    });
    els.electionDates.addEventListener("change", event => {
      state.electionDates = event.currentTarget.checked;
      render(false);
    });
    document.querySelector("#header-tab-mode").addEventListener("change", event => {
      state.tabMode = event.currentTarget.checked;
      updateSelectionTabMode();
    });
    els.fullRegionNames.addEventListener("change", event => {
      state.fullRegionNames = !event.currentTarget.checked;
      render(false);
    });
    els.abbreviationMode.addEventListener("click", event => {
      if (!state.showLabels) return;
      const value = advanceCycleButton(event.currentTarget, [["on", "An"], ["off", "Aus"]]);
      state.fullRegionNames = value === "off";
      els.fullRegionNames.checked = !state.fullRegionNames;
      render(false);
    });
    els.showSinceElection.addEventListener("change", event => {
      state.showSinceElection = event.currentTarget.checked;
      render(false);
    });
    els.showBrackets.addEventListener("change", event => {
      state.showBrackets = event.currentTarget.checked;
      render(false);
    });
    els.showLabels.addEventListener("change", event => {
      setLabelsEnabled(event.currentTarget.checked);
      render(false);
    });
    els.labelsMenuToggle.addEventListener("click", event => {
      const choice = event.currentTarget.closest(".labels-choice");
      if (!choice.classList.contains("is-open")) {
        document.querySelector(".lut-choice")?.classList.remove("is-open");
        choice.classList.add("is-open");
        event.currentTarget.setAttribute("aria-expanded", "true");
        return;
      }
      if (event.target.closest(".labels-check")) {
        setLabelsEnabled(!state.showLabels);
        render(false);
      }
    });
    els.regionLabelMode.addEventListener("click", event => {
      if (!state.showLabels) return;
      state.regionLabelMode = advanceCycleButton(event.currentTarget, labelModeOptions.rotation);
      render(false);
    });
    els.partyLabelMode.addEventListener("click", event => {
      if (!state.showLabels) return;
      state.partyLabelMode = advanceCycleButton(event.currentTarget, labelModeOptions.rotation);
      render(false);
    });
    els.percentLabelMode.addEventListener("click", event => {
      if (!state.showLabels) return;
      state.percentLabelMode = advanceCycleButton(event.currentTarget, labelModeOptions.percent);
      state.showPercentValues = state.percentLabelMode !== "off";
      els.showPercentValues.checked = state.showPercentValues;
      render(false);
    });
    els.sinceElectionMode.addEventListener("click", event => {
      if (!state.showLabels) return;
      state.sinceElectionMode = advanceCycleButton(event.currentTarget, labelModeOptions.since);
      state.showSinceElection = state.sinceElectionMode !== "off";
      els.showSinceElection.checked = state.showSinceElection;
      render(false);
    });
    els.showBarColors.addEventListener("change", event => {
      setBarsEnabled(event.currentTarget.checked);
    });
    els.barMenuToggle.addEventListener("click", event => {
      const choice = event.currentTarget.closest(".bar-colors-choice");
      if (!choice.classList.contains("is-open")) {
        document.querySelector(".labels-choice")?.classList.remove("is-open");
        document.querySelector(".lut-choice")?.classList.remove("is-open");
        choice.classList.add("is-open");
        event.currentTarget.setAttribute("aria-expanded", "true");
        return;
      }
      if (event.target.closest(".bar-check")) {
        setBarsEnabled(!state.barColors);
      }
    });
    els.barColorMode.addEventListener("click", event => {
      if (!state.barColors) return;
      state.barColorMode = advanceCycleButton(event.currentTarget, [["party", "Parteifarben"], ["lightblue", "Hellblau"], ["gray", "Grau"]]);
      render(false);
    });
    els.barNeonMode.addEventListener("click", event => {
      if (!state.barColors) return;
      state.barNeon = advanceCycleButton(event.currentTarget, [["on", "An"], ["off", "Aus"]]) === "on";
      render(false);
    });
    els.showPercentValues.addEventListener("change", event => {
      state.showPercentValues = event.currentTarget.checked;
      render(false);
    });
    els.showLut.addEventListener("change", event => {
      state.showLut = event.currentTarget.checked;
      render(false);
    });
    const lutMenuToggle = document.querySelector("#lut-menu-toggle");
    const yAxisButton = document.querySelector("#y-axis-mode");
    const backgroundButton = document.querySelector("#background-mode");
    const bracketsButton = document.querySelector("#brackets-mode");
    lutMenuToggle.addEventListener("click", event => {
      const choice = event.currentTarget.closest(".lut-choice");
      if (!choice.classList.contains("is-open")) {
        document.querySelector(".labels-choice")?.classList.remove("is-open");
        choice.classList.add("is-open");
        event.currentTarget.setAttribute("aria-expanded", "true");
        return;
      }
      if (event.target.closest(".lut-check")) {
        state.showLut = !state.showLut;
        els.showLut.checked = state.showLut;
        render(false);
      }
    });
    yAxisButton.addEventListener("click", event => {
      if (!state.showLut) return;
      yAxisMode = advanceCycleButton(event.currentTarget, [["static", "Statisch"], ["dynamic", "Dynamisch"], ["off", "Aus"]]);
      render(false);
    });
    backgroundButton.addEventListener("click", event => {
      if (!state.showLut) return;
      state.showBackground = advanceCycleButton(event.currentTarget, [["on", "An"], ["off", "Aus"]]) === "on";
      els.showBackground.checked = state.showBackground;
      render(false);
    });
    bracketsButton.addEventListener("click", event => {
      if (!state.showLut) return;
      state.showBrackets = advanceCycleButton(event.currentTarget, [["on", "An"], ["off", "Aus"]]) === "on";
      els.showBrackets.checked = state.showBrackets;
      render(false);
    });
    els.showBackground.addEventListener("change", event => {
      state.showBackground = event.currentTarget.checked;
      render(false);
    });
    els.viewZoomEnabled.addEventListener("change", event => {
      state.viewZoomEnabled = event.currentTarget.checked;
      els.viewZoomControls.hidden = !state.viewZoomEnabled;
      render(false);
    });
    els.fullscreenEnabled.addEventListener("change", async event => {
      state.fullscreenEnabled = event.currentTarget.checked;
      els.fullscreenEnter.hidden = !state.fullscreenEnabled;
      if (!state.fullscreenEnabled && document.fullscreenElement) await document.exitFullscreen();
      else if (!state.fullscreenEnabled) setFullscreenView(false);
    });
    els.viewSizeDown.addEventListener("click", () => setViewScale("y", currentViewScale("y") - .1));
    els.viewSizeUp.addEventListener("click", () => setViewScale("y", currentViewScale("y") + .1));
    els.viewWidthDown.addEventListener("click", () => setViewScale("x", currentViewScale("x") - .2));
    els.viewWidthUp.addEventListener("click", () => setViewScale("x", currentViewScale("x") + .2));
    document.querySelectorAll(".cluster-mode-button").forEach(button => button.addEventListener("click", event => {
      state.groupBy = event.currentTarget.dataset.group;
      render();
    }));
    document.querySelectorAll("#selection-tabs button").forEach(button => button.addEventListener("click", event => {
      const selectedPanel = event.currentTarget.dataset.panel;
      state.selectionTab = state.selectionTab === selectedPanel ? "" : selectedPanel;
      document.querySelectorAll("[data-selection-panel]").forEach(panel => { panel.hidden = panel.dataset.selectionPanel !== state.selectionTab; });
      document.querySelectorAll("#selection-tabs button").forEach(tab => tab.classList.toggle("active", tab.dataset.panel === state.selectionTab));
    }));
    document.querySelector("#tab-grouping-switch").addEventListener("change", event => {
      state.groupBy = event.currentTarget.checked ? "party" : "region";
      render();
    });
    document.querySelector("#tab-average-switch").addEventListener("change", event => {
      state.averageMode = event.currentTarget.checked;
      document.querySelector("#average-mode").checked = state.averageMode;
      render();
    });
    const togglePanel = (button, panel) => button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) panel.scrollTop = 0;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    togglePanel(document.querySelector("#settings-toggle"), document.querySelector("#chart-settings"));
    const viewPanel = document.querySelector("#chart-view-settings");
    const viewDismiss = document.querySelector("#view-menu-dismiss");
    const desktopViewButton = document.querySelector("#chart-view-settings-toggle");
    const setViewMenuOpen = open => {
      viewPanel.hidden = !open;
      viewDismiss.hidden = !open;
      desktopViewButton.setAttribute("aria-expanded", String(open));
      els.fullscreenSettings.setAttribute("aria-expanded", String(open));
      if (open) viewPanel.scrollTop = 0;
      else {
        document.querySelectorAll(".labels-choice, .lut-choice, .bar-colors-choice").forEach(choice => choice.classList.remove("is-open"));
        els.labelsMenuToggle.setAttribute("aria-expanded", "false");
        document.querySelector("#lut-menu-toggle").setAttribute("aria-expanded", "false");
        els.barMenuToggle.setAttribute("aria-expanded", "false");
      }
    };
    desktopViewButton.addEventListener("click", () => setViewMenuOpen(viewPanel.hidden));
    els.fullscreenSettings.addEventListener("click", () => setViewMenuOpen(viewPanel.hidden));
    viewDismiss.addEventListener("pointerdown", () => setViewMenuOpen(false));
    els.fullscreenEnter.addEventListener("click", async () => {
      if (!state.fullscreenEnabled) return;
      setFullscreenView(true);
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => {});
    });
    els.fullscreenExit.addEventListener("click", async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else setFullscreenView(false);
    });
    const closeFullscreenOverlays = () => {
      document.body.classList.remove("fullscreen-selection-open", "fullscreen-output-open");
      els.fullscreenSelection.setAttribute("aria-expanded", "false");
      els.fullscreenOutput.setAttribute("aria-expanded", "false");
    };
    els.fullscreenSelection.addEventListener("click", () => {
      const open = !document.body.classList.contains("fullscreen-selection-open");
      closeFullscreenOverlays();
      document.body.classList.toggle("fullscreen-selection-open", open);
      els.fullscreenSelection.setAttribute("aria-expanded", String(open));
    });
    els.fullscreenOutput.addEventListener("click", () => {
      const open = !document.body.classList.contains("fullscreen-output-open");
      closeFullscreenOverlays();
      document.body.classList.toggle("fullscreen-output-open", open);
      els.fullscreenOutput.setAttribute("aria-expanded", String(open));
    });
    els.fullscreenHelp.addEventListener("click", () => {
      els.reportMobileView.checked = state.mobileView;
      els.reportDataStand.textContent = `Stand: ${els.updated.textContent}${els.updatedTime.textContent ? ` · ${els.updatedTime.textContent}` : ""}`;
      document.querySelector("#report-open").click();
    });
    const uiScaleToggle = document.querySelector("#ui-scale-toggle");
    const uiScalePanel = document.querySelector("#ui-scale-panel");
    const uiScaleRange = document.querySelector("#ui-scale-range");
    const uiScaleValue = document.querySelector("#ui-scale-value");
    // Keep the glass panel outside the chart's stacking context so headings can
    // never be painted over its border or contents.
    document.body.append(uiScalePanel);
    const applyUiScale = rawValue => {
      const percent = Math.max(50, Math.min(300, Math.round(Number(rawValue) / 10) * 10));
      document.documentElement.style.setProperty("--ui-scale", String(percent / 100));
      uiScaleRange.value = String(percent);
      uiScaleValue.textContent = `${percent} %`;
      localStorage.setItem("ui-control-scale", String(percent));
    };
    applyUiScale(localStorage.getItem("ui-control-scale") || "100");
    uiScaleToggle.addEventListener("click", event => {
      event.stopPropagation();
      uiScalePanel.hidden = !uiScalePanel.hidden;
      document.body.classList.toggle("ui-scale-open", !uiScalePanel.hidden);
      uiScaleToggle.setAttribute("aria-expanded", String(!uiScalePanel.hidden));
    });
    uiScalePanel.addEventListener("pointerdown", event => event.stopPropagation());
    uiScaleRange.addEventListener("input", event => applyUiScale(event.currentTarget.value));
    els.reportMobileView.addEventListener("change", event => {
      els.mobileView.checked = event.currentTarget.checked;
      els.mobileView.dispatchEvent(new Event("change", { bubbles: true }));
    });
    els.reportUpdateData.addEventListener("click", () => els.updateData.click());
    document.addEventListener("fullscreenchange", () => {
      setFullscreenView(true);
    });
    document.addEventListener("pointerdown", event => {
      const panel = document.querySelector("#chart-view-settings");
      if (panel.hidden) return;
      const path = event.composedPath();
      const desktopButton = document.querySelector("#chart-view-settings-toggle");
      const visibleControl = event.target.closest?.("#chart-view-settings .choice, #chart-view-settings button, #chart-view-settings input, #chart-view-settings label");
      if (visibleControl || path.includes(desktopButton) || path.includes(els.fullscreenSettings)) return;
      setViewMenuOpen(false);
    }, { capture: true });
    document.addEventListener("pointerdown", event => {
      if (!uiScalePanel.hidden && event.target !== uiScaleToggle) {
        uiScalePanel.hidden = true;
        document.body.classList.remove("ui-scale-open");
        uiScaleToggle.setAttribute("aria-expanded", "false");
      }
      const labelsChoice = document.querySelector(".labels-choice");
      const closedLabelsSubmenu = labelsChoice.classList.contains("is-open") && !labelsChoice.contains(event.target);
      if (closedLabelsSubmenu) {
        labelsChoice.classList.remove("is-open");
        els.labelsMenuToggle.setAttribute("aria-expanded", "false");
      }
      const lutChoice = document.querySelector(".lut-choice");
      const closedLutSubmenu = lutChoice.classList.contains("is-open") && !lutChoice.contains(event.target);
      if (closedLutSubmenu) {
        lutChoice.classList.remove("is-open");
        document.querySelector("#lut-menu-toggle").setAttribute("aria-expanded", "false");
      }
      const barChoice = document.querySelector(".bar-colors-choice");
      if (barChoice.classList.contains("is-open") && !barChoice.contains(event.target)) {
        barChoice.classList.remove("is-open");
        els.barMenuToggle.setAttribute("aria-expanded", "false");
      }
      const mainPanel = document.querySelector("#chart-settings");
      const mainButton = document.querySelector("#settings-toggle");
      if (!mainPanel.hidden && !mainPanel.contains(event.target) && !mainButton.contains(event.target)) {
        mainPanel.hidden = true;
        mainButton.setAttribute("aria-expanded", "false");
      }
      const menu = document.querySelector(".chart-view-menu");
      const panel = document.querySelector("#chart-view-settings");
      const button = document.querySelector("#chart-view-settings-toggle");
      if (!panel.hidden && !menu.contains(event.target) && !els.fullscreenSettings.contains(event.target)) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        els.fullscreenSettings.setAttribute("aria-expanded", "false");
      }
      if (document.body.classList.contains("fullscreen-selection-open")) {
        const selectionPanel = document.querySelector("main > .controls");
        if (!selectionPanel.contains(event.target) && !els.fullscreenSelection.contains(event.target)) closeFullscreenOverlays();
      }
      if (document.body.classList.contains("fullscreen-output-open")) {
        const outputPanel = document.querySelector("main > .outputs");
        if (!outputPanel.contains(event.target) && !els.fullscreenOutput.contains(event.target)) closeFullscreenOverlays();
      }
    });
    togglePanel(document.querySelector("#export-settings-toggle"), document.querySelector("#export-settings"));
    document.querySelector("#preview-export").addEventListener("click", () => {
      try { showExportPreview(); }
      catch (error) { els.exportMessage.textContent = `Vorschau fehlgeschlagen: ${error.message}`; }
    });
    document.querySelector("#close-preview").addEventListener("click", closeExportPreview);
    document.querySelector("#preview-split-toggle").addEventListener("click", () => setPreviewSplit(!document.body.classList.contains("preview-split-active")));
    els.previewDialog.addEventListener("click", event => { if (event.target === els.previewDialog && !document.body.classList.contains("preview-split-active")) closeExportPreview(); });
    els.previewZoom.addEventListener("input", applyPreviewZoom);
    installPreviewGestures();
    installPreviewSplitter();
    const changePreviewZoom = direction => {
      els.previewZoom.value = String(Math.max(Number(els.previewZoom.min), Math.min(Number(els.previewZoom.max), Number(els.previewZoom.value) + direction * Number(els.previewZoom.step))));
      applyPreviewZoom();
    };
    document.querySelector("#preview-zoom-out").addEventListener("click", () => changePreviewZoom(-1));
    document.querySelector("#preview-zoom-in").addEventListener("click", () => changePreviewZoom(1));
    const reportDialog = document.querySelector("#report-dialog");
    let startupPending = true;
    const reportTabs = {
      "report-book-open": "report-book",
      "report-info-open": "report-info",
      "report-projects-open": "report-projects",
      "report-accounts-open": "report-accounts",
      "report-developer-open": "report-developer",
      "report-app-open": "report-app"
    };
    const toggleReportTab = button => {
      const targetId = reportTabs[button.id];
      const target = document.querySelector(`#${targetId}`);
      const willOpen = target.hidden;
      Object.entries(reportTabs).forEach(([buttonId, panelId]) => {
        document.querySelector(`#${panelId}`).hidden = true;
        document.querySelector(`#${buttonId}`).classList.remove("active");
      });
      if (willOpen) { target.hidden = false; button.classList.add("active"); }
      return willOpen;
    };
    const pinFields = [...document.querySelectorAll("#report-pin input")];
    const focusFirstReportPin = () => {
      const login = document.querySelector("#report-login");
      if (!reportDialog.open || login.hidden) return;
      const target = pinFields.find(field => !field.value) || pinFields[0];
      const applyFocus = () => {
        if (!reportDialog.open || login.hidden) return;
        target.focus({ preventScroll: true });
        target.select();
      };
      applyFocus();
      requestAnimationFrame(applyFocus);
      window.setTimeout(applyFocus, 80);
    };
    new MutationObserver(focusFirstReportPin).observe(reportDialog, { attributes: true, attributeFilter: ["open"] });
    new MutationObserver(focusFirstReportPin).observe(document.querySelector("#report-login"), { attributes: true, attributeFilter: ["hidden"] });
    const readReportPin = () => pinFields.map(input => input.value).join("").toUpperCase();
    const openProjectPicker = async fromView => {
      const guest = !currentReportRole;
      reportDialog.classList.add("project-picker-dialog");
      reportDialog.classList.toggle("guest-project-dialog", guest);
      reportDialog.classList.toggle("startup-project-dialog", !fromView);
      document.body.classList.toggle("startup-project-open", !fromView);
      const greeting = document.querySelector("#startup-project-greeting");
      const showGreeting = !fromView && !guest && currentReportIdentity;
      greeting.hidden = !showGreeting;
      if (showGreeting) {
        const person = currentReportIdentity.person;
        const greetings = [
          `Hi ${person}`,
          `Howdy ${person}`,
          `Willkommen ${person}`,
          `Moin ${person}`,
          `Servus ${person}`,
          `Was geht, ${person}?`,
          `Alles fit, ${person}?`,
          `Buenos Dias ${person}`
        ];
        document.querySelector("#startup-project-person").textContent = greetings[Math.floor(Math.random() * greetings.length)];
        document.querySelector("#startup-project-work").textContent = `(${currentReportIdentity.work})`;
      }
      document.querySelector("#report-title").textContent = "Projekte";
      Object.values(reportTabs).forEach(panelId => { document.querySelector(`#${panelId}`).hidden = true; });
      document.querySelector("#report-projects").hidden = false;
      document.querySelector("#project-picker-output").hidden = !fromView && !guest;
      document.querySelector("#project-output-code").textContent = configurationCode();
      document.querySelector("#project-code-message").textContent = "";
      document.querySelector("#project-save-message").textContent = "";
      if (!reportDialog.open) reportDialog.showModal();
      if (!guest) try { await loadProjects(); }
      catch (error) { document.querySelector("#project-code-message").textContent = error.message; }
    };
    reportDialog.addEventListener("close", () => document.body.classList.remove("startup-project-open"));
    pinFields.forEach((input, index) => {
      input.addEventListener("input", event => {
        event.currentTarget.value = event.currentTarget.value.slice(-1).toUpperCase();
        if (event.currentTarget.value && pinFields[index + 1]) pinFields[index + 1].focus();
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !event.currentTarget.value && pinFields[index - 1]) pinFields[index - 1].focus();
      });
      input.addEventListener("paste", event => {
        const pasted = event.clipboardData.getData("text").replace(/\s/g, "").slice(0, 5).toUpperCase();
        if (pasted.length < 2) return;
        event.preventDefault();
        pinFields.forEach((field, fieldIndex) => { field.value = pasted[fieldIndex] || ""; });
        pinFields[Math.min(pasted.length, 5) - 1].focus();
      });
    });
    document.querySelector("#report-open").addEventListener("click", () => {
      reportDialog.classList.remove("project-picker-dialog", "startup-project-dialog", "guest-project-dialog");
      document.querySelector("#report-title").textContent = "Info";
      document.querySelector("#project-picker-output").hidden = true;
      reportDialog.showModal();
      loadAppRelease();
      if (currentReportRole) {
        Object.entries(reportTabs).forEach(([buttonId, panelId]) => {
          document.querySelector(`#${panelId}`).hidden = true;
          document.querySelector(`#${buttonId}`).classList.remove("active");
        });
        document.querySelector("#report-info").hidden = false;
        document.querySelector("#report-info-open").classList.add("active");
      } else {
        document.querySelector("#report-info").hidden = false;
        focusFirstReportPin();
      }
    });
    document.querySelector("#report-close").addEventListener("click", () => { reportDialog.classList.remove("project-picker-dialog", "startup-project-dialog", "guest-project-dialog"); reportDialog.close(); });
    document.querySelector("#report-login").addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.querySelector("#report-login-message");
      reportPin = readReportPin();
      message.textContent = "PIN wird geprüft …";
      try {
        const session = await reportRequest("/session", { method: "POST", body: "{}" });
        currentReportRole = session.role || (session.reporter === "Admin" ? "Admin" : "Helper");
        const fallbackIdentity = reportIdentities[session.reporter] || { person: session.reporter || "Reporter", work: session.reporter || "Reporter" };
        const identity = { person: session.personName || fallbackIdentity.person, work: session.workName || fallbackIdentity.work };
        currentReportIdentity = identity;
        document.querySelector("#report-session-person").textContent = identity.person;
        document.querySelector("#report-session-work").textContent = `(${identity.work})`;
        document.querySelector("#report-subject-field").hidden = currentReportRole !== "Admin";
        document.querySelector("#report-login").hidden = true;
        document.querySelector("#report-info").hidden = true;
        document.querySelector("#report-session").hidden = false;
        document.querySelector("#report-accounts-open").hidden = currentReportRole !== "Admin";
        document.querySelector("#report-app-open").hidden = currentReportRole !== "Admin" && !helperAppAccessEnabled();
        const helperAppAccessSetting = document.querySelector("#helper-app-access-setting");
        const helperAppAccessToggle = document.querySelector("#helper-app-access");
        helperAppAccessSetting.hidden = currentReportRole !== "Admin";
        helperAppAccessToggle.checked = helperAppAccessEnabled();
        const developerTab = document.querySelector("#report-developer-open");
        developerTab.setAttribute("aria-label", currentReportRole === "Admin" ? "Mastereinstellungen" : "Mastereinstellungen ansehen");
        document.querySelector("#report-logout").hidden = false;
        document.querySelector("#save-project").hidden = true;
        document.querySelector("#project-picker-toggle").hidden = false;
        const identityHeader = document.querySelector(".report-session-user");
        identityHeader.classList.remove("is-revealed");
        requestAnimationFrame(() => identityHeader.classList.add("is-revealed"));
        message.textContent = "";
        if (startupPending) {
          reportDialog.classList.remove("startup-login-dialog");
          reportDialog.close();
          await startSimpleAppIntro();
          startupPending = false;
          await openProjectPicker(false);
        } else {
          document.querySelector("#report-book").hidden = false;
          document.querySelector("#report-book-open").classList.add("active");
          await loadReports();
        }
      } catch (error) { reportPin = ""; currentReportRole = ""; currentReportIdentity = null; pinFields.forEach(field => { field.value = ""; }); pinFields[0].focus(); message.textContent = error.message; }
    });
    document.querySelector("#report-logout").addEventListener("click", () => {
      reportPin = ""; currentReportRole = ""; currentReportIdentity = null;
      pinFields.forEach(field => { field.value = ""; });
      document.querySelector("#report-session").hidden = true;
      document.querySelector("#report-accounts").hidden = true;
      document.querySelector("#report-developer").hidden = true;
      document.querySelector("#report-app").hidden = true;
      document.querySelector("#report-projects").hidden = true;
      document.querySelector("#report-book").hidden = true;
      document.querySelector("#report-info").hidden = false;
      document.querySelector("#report-logout").hidden = true;
      document.querySelector("#save-project").hidden = true;
      document.querySelector("#project-picker-toggle").hidden = true;
      document.querySelector("#report-login").hidden = false;
      document.querySelector("#report-login-message").textContent = "";
      focusFirstReportPin();
    });
    document.querySelector("#report-accounts-open").addEventListener("click", async () => {
      if (!toggleReportTab(document.querySelector("#report-accounts-open"))) return;
      try { await loadReportAccounts(); }
      catch (error) { const list = document.querySelector("#report-account-list"); list.replaceChildren(); const notice = document.createElement("p"); notice.className = "report-empty"; notice.textContent = error.message; list.append(notice); }
    });
    document.querySelector("#report-developer-open").addEventListener("click", async () => {
      if (!toggleReportTab(document.querySelector("#report-developer-open"))) return;
      document.querySelector("#report-developer-note").textContent = currentReportRole === "Admin"
        ? "Sichtbarkeit und Aktivzustand getrennt für Mobil & App und Desktop festlegen."
        : "Diese Einstellungen können nur von einem Admin verändert werden.";
      document.querySelector("#report-developer-message").textContent = "";
      try {
        publicDeveloperSettingsPromise = null;
        await fetchDeveloperSettings();
        renderDeveloperSettings(currentReportRole !== "Admin");
      } catch (error) { document.querySelector("#report-developer-message").textContent = error.message; }
    });
    document.querySelector("#report-app-open").addEventListener("click", () => {
      if (!toggleReportTab(document.querySelector("#report-app-open"))) return;
      loadAppRelease();
    });
    document.querySelector("#helper-app-access").addEventListener("change", event => {
      if (currentReportRole !== "Admin") return;
      const enabled = event.currentTarget.checked;
      ["mobile", "desktop"].forEach(platform => { developerSettings[platform].helperAppAccess = { visible: false, value: enabled }; });
      localStorage.setItem("helper-app-access", JSON.stringify(enabled));
      saveDeveloperSettings();
    });
    document.querySelector("#report-book-open").addEventListener("click", () => toggleReportTab(document.querySelector("#report-book-open")));
    document.querySelector("#report-info-open").addEventListener("click", () => toggleReportTab(document.querySelector("#report-info-open")));
    document.querySelector("#report-projects-open").addEventListener("click", () => {
      if (!toggleReportTab(document.querySelector("#report-projects-open"))) return;
      loadProjects().catch(error => {
        const list = document.querySelector("#report-project-list");
        list.replaceChildren();
        const message = document.createElement("p"); message.className = "report-empty"; message.textContent = error.message; list.append(message);
      });
    });
    document.querySelector("#project-picker-toggle").addEventListener("click", () => openProjectPicker(true).catch(error => { document.querySelector("#project-code-message").textContent = error.message; }));
    document.querySelector("#project-code-input").addEventListener("submit", event => {
      event.preventDefault();
      const input = document.querySelector("#project-input-code");
      const message = document.querySelector("#project-code-message");
      try {
        applyConfigurationCode(input.value.trim(), { nativeLayout: true });
        els.inputCode.value = input.value.trim();
        reportDialog.classList.remove("project-picker-dialog", "startup-project-dialog", "guest-project-dialog");
        reportDialog.close();
      } catch (error) { message.textContent = error.message; }
    });
    document.querySelector("#project-new").addEventListener("click", () => { reportDialog.classList.remove("project-picker-dialog", "startup-project-dialog", "guest-project-dialog"); reportDialog.close(); });
    document.querySelector("#project-copy").addEventListener("click", async () => {
      await navigator.clipboard.writeText(document.querySelector("#project-output-code").textContent);
      document.querySelector("#project-save-message").textContent = "Code kopiert.";
    });
    document.querySelector("#project-save").addEventListener("click", async event => {
      const button = event.currentTarget;
      const message = document.querySelector("#project-save-message");
      button.disabled = true;
      const projectName = await askProjectName();
      if (projectName === null) { button.disabled = false; return; }
      try {
        const saved = await saveCurrentProject(projectName);
        if (saved) { savedProjectConfiguration = saved; message.textContent = "Projekt zentral gespeichert."; await loadProjects(); }
        else message.textContent = "Speichern abgebrochen.";
      }
      catch (error) { message.textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.querySelector("#start-without-login").addEventListener("click", async () => {
      reportDialog.classList.remove("startup-login-dialog");
      reportDialog.close();
      startupPending = false;
      await startSimpleAppIntro();
      document.querySelector("#project-picker-toggle").hidden = false;
    });
    document.querySelector("#save-project").addEventListener("click", async () => {
      const button = document.querySelector("#save-project");
      button.disabled = true;
      const projectName = await askProjectName();
      if (projectName === null) { button.disabled = false; return; }
      try {
        const saved = await saveCurrentProject(projectName);
        if (saved) { savedProjectConfiguration = saved; els.exportMessage.textContent = "Projekt zentral gespeichert."; }
        else els.exportMessage.textContent = "Speichern abgebrochen.";
      }
      catch (error) { els.exportMessage.textContent = error.message; }
      finally { button.disabled = false; }
    });
    document.querySelector("#report-account-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = document.querySelector("#report-account-message");
      const newPin = document.querySelector("#report-account-pin").value.trim().toUpperCase();
      message.textContent = "Account wird angelegt …";
      try {
        await reportRequest("/accounts", { method: "POST", body: JSON.stringify({
          personName: document.querySelector("#report-account-person").value.trim(),
          workName: document.querySelector("#report-account-work").value.trim(),
          role: document.querySelector("#report-account-role").value,
          pin: newPin
        }) });
        form.reset(); document.querySelector("#report-account-role").value = "Helper";
        message.innerHTML = `Account angelegt. PIN einmalig notieren: <span class="report-pin-once">${newPin}</span>`;
        await loadReportAccounts();
      } catch (error) { message.textContent = error.message; }
    });
    document.querySelector("#report-refresh").addEventListener("click", () => loadReports().catch(error => {
      const list = document.querySelector("#report-list");
      list.replaceChildren();
      const message = document.createElement("p"); message.className = "report-empty"; message.textContent = error.message; list.append(message);
    }));
    document.querySelector("#report-sort").addEventListener("click", event => {
      reportsNewestFirst = !reportsNewestFirst;
      event.currentTarget.textContent = reportsNewestFirst ? "↓" : "↑";
      event.currentTarget.title = reportsNewestFirst ? "Neu nach alt" : "Alt nach neu";
      event.currentTarget.setAttribute("aria-label", `Einträge ${event.currentTarget.title} sortieren`);
      loadReports().catch(() => {});
    });
    document.querySelector("#report-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const message = document.querySelector("#report-form-message");
      message.textContent = "Eintrag wird gespeichert …";
      try {
        await reportRequest("/reports", { method: "POST", body: JSON.stringify({
          subject: currentReportRole === "Admin" ? (document.querySelector("#report-subject").value.trim() || "Meldung") : "Meldung",
          body: document.querySelector("#report-body").value.trim(),
          configuration: document.querySelector("#report-include-config").checked ? configurationCode() : null
        }) });
        form.reset();
        document.querySelector("#report-include-config").checked = true;
        message.textContent = "Eintrag gespeichert.";
        showEddaThanks();
        await loadReports();
      } catch (error) { message.textContent = error.message; }
    });
    const exportFormat = document.querySelector("#export-format");
    const a4Mode = document.querySelector("#a4-mode");
    const export3d = document.querySelector("#export-3d");
    export3d.addEventListener("change", event => {
      state.export3d = event.currentTarget.checked;
      render(false);
    });
    a4Mode.addEventListener("change", event => { state.a4Mode = event.currentTarget.checked; render(false); });
    exportFormat.addEventListener("change", event => {
      if (event.currentTarget.value === "pdf" && !state.a4Mode) {
        state.a4Mode = true; a4Mode.checked = true; render(false);
        return;
      }
      updateExportSummary();
    });
    document.querySelectorAll('input[name="output-shape"]').forEach(input => input.addEventListener("change", event => {
      state.a4Mode = event.currentTarget.value === "a4";
      a4Mode.checked = state.a4Mode;
      document.querySelector("#a4-orientation-settings").hidden = !state.a4Mode;
      render(false);
    }));
    document.querySelectorAll('input[name="a4-orientation"]').forEach(input => input.addEventListener("change", event => {
      state.a4Orientation = event.currentTarget.value;
      render(false);
    }));
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
    document.querySelector("#report-info").hidden = true;
    document.querySelector("#report-title").textContent = "Log in";
    reportDialog.classList.add("startup-login-dialog");
    reportDialog.showModal();
    focusFirstReportPin();
  })
  .catch(error => { els.updated.textContent = "nicht verfügbar"; els.empty.hidden = false; els.empty.textContent = error.message; els.scroll.hidden = true; });

let developerRefreshRunning = false;
const syncDeveloperSettings = async () => {
  if (developerRefreshRunning || document.hidden) return;
  developerRefreshRunning = true;
  try { await refreshDeveloperSettings(); }
  catch (error) { /* Die zuletzt geladenen Einstellungen bleiben bei einem kurzen Netzausfall aktiv. */ }
  finally { developerRefreshRunning = false; }
};
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncDeveloperSettings(); });
window.addEventListener("focus", syncDeveloperSettings);
window.setInterval(syncDeveloperSettings, 15000);
