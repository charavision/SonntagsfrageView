import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const data = JSON.parse(readFileSync(new URL("../data/polls.json", import.meta.url), "utf8"));
const node = { classList: { toggle() {} }, closest() { return node; }, querySelectorAll() { return []; } };
const state = {
  data,
  regions: new Set([data.regions[0]]),
  parties: new Set(),
  otherParties: new Set(),
  selectedPollRanks: new Set([0]),
  pollTimeMode: "current",
  pollDateLabels: [null, null, null],
  a4Orientation: "auto",
  regionLabelMode: "auto",
  partyLabelMode: "auto",
  percentLabelMode: "without",
  sinceElectionMode: "color",
  barColorMode: "party",
  barNeon: true,
  barStyle: "neon",
  a4DiagramFormat: "auto",
  changeMode: "election",
  groupBy: "party",
  a4Mode: true,
  fullRegionNames: false,
  electionDates: true,
  showSinceElection: true,
  showBrackets: true,
  showLabels: true,
  barColors: true,
  showPercentValues: true,
  showLut: true,
  showBackground: true,
  export3d: false,
  averageMode: false,
  mobileView: false,
  hideEmptyClusters: false,
  stackUnselected: false,
  uiBrightness: 0,
  uiSaturation: 0,
  chartTheme: "navy",
  outputBarWidth: "standard"
};
const context = vm.createContext({
  state, startsMobile: false, yAxisMode: "dynamic", els: new Proxy({}, { get: () => node }),
  labelModeOptions: { rotation: [], percent: [], change: [], since: [] }, barStyleOptions: [["neon", "Neon"], ["matt", "Matt"], ["hell", "Hell"]],
  outputBarWidthOptions: [["standard", "Standard"], ["adapted", "Angepasst"]], TextEncoder, TextDecoder, btoa, atob,
  chartThemeOptions: [["navy", "Navy"], ["purple", "Purple"], ["bright", "Bright"], ["sunshine", "Sunshine"]],
  document: { querySelector: () => node, querySelectorAll: () => [] },
  setBarStyle(value) { state.barStyle = value; state.barNeon = value === "neon"; },
  setPollTimeMode(value) { state.pollTimeMode = value; },
  setCycleButton() {}, syncEmptyClusterControls() {}, syncUiColorControls() {}, updateA4Controls() {}, updatePollOptions() {}, render() {}
});
vm.runInContext(source.slice(source.indexOf("const PARTY_META"), source.indexOf("const MATTE_PARTY_COLORS")), context);
vm.runInContext(source.slice(source.indexOf("const CODE_ALPHABET"), source.indexOf("function makeChoice")), context);
vm.runInContext(source.slice(source.indexOf("function applyConfigurationCode"), source.indexOf("function cloneChartForFileOutput")), context);
vm.runInContext(source.slice(source.indexOf("function calculateBarLayout"), source.indexOf("function render(")), context);
vm.runInContext(source.slice(source.indexOf("function a4BarWidthForSlot"), source.indexOf("function buildA4Page")), context);
vm.runInContext(source.slice(source.indexOf("const UI_SETTING_KEYS"), source.indexOf("const notificationRegions")), context);

function roundTrip({ regions, parties, otherParties, style, dates, brightness = 0, saturation = 0, theme = "navy", width = "standard" }) {
  state.regions = new Set(regions);
  state.parties = new Set(parties);
  state.otherParties = new Set(otherParties);
  state.barStyle = style;
  state.barNeon = style === "neon";
  state.uiBrightness = brightness;
  state.uiSaturation = saturation;
  state.chartTheme = theme;
  state.outputBarWidth = width;
  state.pollTimeMode = dates ? "free" : "current";
  state.pollDateLabels = dates || [null, null, null];
  const code = context.configurationCode();
  assert.match(code, /^[0-9A-Za-z]{13,32}$/);
  state.regions.clear(); state.parties.clear(); state.otherParties.clear();
  context.applyConfigurationCode(code);
  assert.deepEqual([...state.regions], regions);
  assert.deepEqual([...state.parties], parties);
  assert.deepEqual([...state.otherParties], otherParties);
  assert.equal(state.barStyle, style);
  assert.equal(state.uiBrightness, brightness);
  assert.equal(state.uiSaturation, saturation);
  assert.equal(state.chartTheme, theme);
  assert.equal(state.outputBarWidth, width);
  assert.deepEqual([...state.pollDateLabels], dates || [null, null, null]);
  return code.length;
}

const allParties = ["CDU/CSU", "SPD", "GRÜNE", "FDP", "LINKE", "AfD", "BSW", "FW", "Sonstige"];
const lengths = [
  roundTrip({ regions: [data.regions[0]], parties: allParties, otherParties: [], style: "neon" }),
  roundTrip({ regions: [data.regions[1]], parties: [], otherParties: [], style: "matt" }),
  roundTrip({ regions: [data.regions[0]], parties: allParties, otherParties: [], style: "neon", brightness: 50, saturation: -50 }),
  roundTrip({ regions: [data.regions[0]], parties: allParties, otherParties: [], style: "neon", theme: "bright", width: "adapted" }),
  roundTrip({ regions: data.regions, parties: ["Sonstige"], otherParties: ["Piraten", "NPD", "Die PARTEI", "Volt"], style: "hell", dates: ["2026-10-06", null, "2026-09-30"], brightness: -35, saturation: 45, theme: "sunshine", width: "adapted" })
];
const existingCode = "2Lx3Nt6efwf47CiSz";
context.applyConfigurationCode(existingCode);
assert.equal(context.configurationCode(), existingCode, "Ein bisheriger Code muss unverändert lesbar bleiben");
state.outputBarWidth = "standard";
const standardWidth = context.a4BarWidthForSlot(120);
state.outputBarWidth = "adapted";
assert.ok(context.a4BarWidthForSlot(120) > standardWidth, "Freier Platz verbreitert A4-Balken");
assert.ok(Math.abs(context.a4BarWidthForSlot(30) - 20.4) < 1e-9, "Dichte Cluster behalten die Standardbreite");
const group = [{ bars: [{ party: "SPD", item: { region: "Bundestag" } }] }];
const tubeStandard = context.calculateBarLayout(group, 500, 1, false, 10, false).barWidth;
const tubeAdapted = context.calculateBarLayout(group, 500, 1, false, 10, true).barWidth;
assert.ok(tubeAdapted > tubeStandard, "Auch die Schlauchausgabe nutzt freien Platz");
const unchangedRegion = [...state.regions];
const settingsOnlyCode = context.settingsCode();
assert.match(settingsOnlyCode, /^S1\.[A-Za-z0-9_-]+$/);
const decodedSettings = context.decodeSettingsCode(settingsOnlyCode);
assert.equal(decodedSettings.output.outputBarWidth, "adapted");
assert.deepEqual([...state.regions], unchangedRegion, "Der Einstellungscode enthält keine neue Umfrageauswahl");
state.outputBarWidth = "standard";
context.applySettingsSnapshot(decodedSettings, { ui: false, output: true });
assert.equal(state.outputBarWidth, "adapted", "Nur die Ausgabeeinstellungen werden angewandt");
assert.deepEqual([...state.regions], unchangedRegion, "Das Anwenden verändert keine Umfrageauswahl");
assert.throws(() => context.decodeSettingsCode("S1.invalid"));
console.log(`Konfigurationscodes: ${lengths.length} Rundläufe erfolgreich (${lengths.join(", ")} Zeichen).`);
