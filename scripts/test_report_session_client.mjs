import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("const reportApiUrl =");
const end = source.indexOf("const passkeyAvailable =", start);
assert.ok(start >= 0 && end > start, "Sitzungslogik ist auffindbar");

const storage = new Map();
let now = 1_700_000_000_000;
let heartbeat;
let heartbeatInterval;
let touches = 0;
const context = vm.createContext({
  window: { REPORT_API_URL: "https://worker.example" },
  sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  },
  Date: class extends Date { static now() { return now; } },
  setInterval(callback, interval) { heartbeat = callback; heartbeatInterval = interval; return 1; },
  clearInterval() { heartbeat = undefined; },
  async fetch(url, options) {
    assert.equal(url, "https://worker.example/session/touch");
    assert.equal(options.headers["X-Report-Session"], "A".repeat(43));
    touches++;
    return new Response(JSON.stringify({ ok: true, expiresAt: now + 15 * 60_000 }), { status: 200 });
  },
  Response
});
vm.runInContext(source.slice(start, end), context);
const evaluate = expression => vm.runInContext(expression, context);

evaluate(`setReportSession({ token: "${"A".repeat(43)}", expiresAt: ${now + 15 * 60_000}, authMethod: "pin" })`);
evaluate("currentReportRole = 'Admin'");
assert.equal(heartbeatInterval, 60_000, "offenes Fenster hält die Sitzung regelmäßig aufrecht");
const initialAction = evaluate("reportSessionLastActionAt");
for (let minute = 1; minute <= 16; minute++) {
  now += 60_000;
  await heartbeat();
}
assert.equal(touches, 16);
assert.equal(evaluate("reportSessionToken"), "A".repeat(43), "kein Logout im offenen Fenster");
assert.equal(evaluate("reportSessionLastActionAt"), initialAction, "Heartbeat zählt nicht als Aktion");
assert.equal(evaluate("mayRestoreReportSession(JSON.parse(sessionStorage.getItem(REPORT_SESSION_KEY)))"), false, "Reload nach 15 Minuten ohne Aktion verlangt Login");

evaluate("noteReportSessionClick()");
assert.equal(evaluate("reportSessionLastActionAt"), initialAction, "ein Klick reicht noch nicht zum Zurücksetzen");
evaluate("noteReportSessionClick()");
assert.equal(evaluate("reportSessionLastActionAt"), now, "zwei Klicks zählen als Aktion");
assert.equal(evaluate("mayRestoreReportSession(JSON.parse(sessionStorage.getItem(REPORT_SESSION_KEY)))"), true, "Reload nach neuer Aktion bleibt angemeldet");
assert.equal(evaluate("mayRestoreReportSession({ token: 'A'.repeat(43), expiresAt: Date.now() + 15 * 60_000 })"), false, "alte Sitzung ohne Aktivitätszeit darf die 15-Minuten-Prüfung nicht umgehen");

console.log("Browser-Sitzung: offen ohne Logout, 15-Minuten-Reload und Zwei-Klick-Aktivität erfolgreich.");
