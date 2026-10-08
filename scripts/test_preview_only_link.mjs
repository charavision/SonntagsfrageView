import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const start = source.indexOf("function configurationShareUrl()");
const end = source.indexOf("function makeChoice", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({
  URL,
  window: { location: { protocol: "https:", origin: "https://charavision.github.io", pathname: "/SonntagsfrageView/" } },
  configurationCode: () => "TestCode123"
});
vm.runInContext(source.slice(start, end), context);
assert.equal(context.configurationShareUrl(), "https://charavision.github.io/SonntagsfrageView/?config=TestCode123");
assert.equal(context.previewOnlyShareUrl(), "https://charavision.github.io/SonntagsfrageView/?config=TestCode123&preview=1");
context.window.location.protocol = "file:";
assert.equal(context.previewOnlyShareUrl(), "https://charavision.github.io/SonntagsfrageView/?config=TestCode123&preview=1", "lokale Vorschau erstellt einen öffentlichen Link");
assert.match(html, /id="preview-copy-view-link"/);
assert.match(source, /if \(previewOnlyRequested\) \{\s*document\.body\.classList\.add\("preview-link-only"\);\s*document\.body\.classList\.remove\("intro-running"\);\s*document\.querySelector\("#app-intro"\)\?\.remove\(\);/);
assert.match(source, /if \(previewOnlyRequested\) \{[\s\S]*?showExportPreview\(\);[\s\S]*?return;\s*}\s*document\.querySelector\("#report-info"\)/);
assert.match(styles, /body\.preview-link-only \.preview-dialog #preview-extra-options \{ display: flex !important;/);
assert.match(styles, /body\.preview-link-only \.preview-dialog\.preview-only-collapsed #preview-options-toggle \{ display: grid !important;/);
assert.match(styles, /body\.preview-link-only \.preview-dialog\.preview-only-collapsed #preview-extra-options\.is-open \{ display: flex !important;/);
assert.match(styles, /body\.preview-link-only \.preview-dialog #preview-download,[\s\S]*?display: none !important;/);
assert.match(styles, /\.preview-dialog \.preview-extra-options \{ display: flex; flex: 0 1 auto;/);

const classes = new Set();
const header = { scrollWidth: 800, clientWidth: 1000 };
let width = 1000;
let closes = 0;
context.els = { previewDialog: {
  getBoundingClientRect: () => ({ width }),
  querySelector: () => header,
  classList: {
    add: value => classes.add(value),
    remove: value => classes.delete(value),
    toggle(value, active) { if (active) classes.add(value); else classes.delete(value); }
  }
} };
context.state = { mobileView: false };
context.previewOnlyRequested = true;
context.closePreviewOptions = () => closes++;
vm.runInContext(source.slice(source.indexOf("function syncPreviewToolbarMode()"), source.indexOf("function setPreviewSplitPosition", source.indexOf("function syncPreviewToolbarMode()"))), context);
context.syncPreviewToolbarMode();
assert.equal(classes.has("preview-only-collapsed"), false, "bei genügend Platz liegen die Optionen nebeneinander");
assert.equal(closes, 1);
width = 650;
header.scrollWidth = 900;
header.clientWidth = 650;
context.syncPreviewToolbarMode();
assert.equal(classes.has("preview-only-collapsed"), true, "bei Platzmangel öffnet der Pfeil eine zweite Zeile");
context.previewOnlyRequested = false;
context.state.mobileView = true;
width = 1000;
context.syncPreviewToolbarMode();
assert.equal(classes.has("mobile-preview"), false, "Split-Screen nutzt die tatsächliche Breite statt der Mobil-Ansicht");
width = 700;
context.syncPreviewToolbarMode();
assert.equal(classes.has("mobile-preview"), true, "nur ein wirklich schmales Vorschaufenster zeigt den Pfeil");
console.log("Vorschau-Link: Inline-Leiste, platzabhängiger Pfeil, kein Login/Intro und ausgeblendete Ausgabe erfolgreich.");
