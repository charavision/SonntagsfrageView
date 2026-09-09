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
