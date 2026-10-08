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
assert.match(styles, /body\.preview-link-only \.preview-dialog #preview-download,[\s\S]*?display: none !important;/);
console.log("Vorschau-Link: Einstellungen ohne Login/Intro, unveränderter Standardlink und ausgeblendete Ausgabe erfolgreich.");
