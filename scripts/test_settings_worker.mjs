import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../report-worker/src/index.js", import.meta.url), "utf8");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const slots = new Map();
const settings = new Map();
const database = {
  prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async run() {
        if (sql.startsWith("INSERT INTO settings_slots")) slots.set(`${params[0]}:${params[1]}`, { slot: params[1], title: params[2], settings: params[3] });
        if (sql.startsWith("DELETE FROM settings_slots")) slots.delete(`${params[0]}:${params[1]}`);
        if (sql.startsWith("INSERT INTO app_settings") && sql.includes("standard_settings_slot")) settings.set("standard_settings_slot", params[0]);
        if (sql.startsWith("DELETE FROM app_settings") && sql.includes("standard_settings_slot")) settings.delete("standard_settings_slot");
        return { meta: { changes: 1 } };
      },
      async first() {
        if (sql.includes("FROM report_users")) return { id: "builtin-admin", person_name: "Test", work_name: "Admin", role: "Admin", pin_hash: "x" };
        if (sql.includes("FROM app_settings") && sql.includes("standard_settings_slot")) return settings.has("standard_settings_slot") ? { value: settings.get("standard_settings_slot") } : null;
        if (sql.includes("FROM settings_slots")) return slots.get(`${params[0]}:${params[1]}`) || null;
        return null;
      },
      async all() {
        if (sql.includes("FROM settings_slots")) return { results: [...slots.entries()].filter(([key]) => key.startsWith(`${params[0]}:`)).map(([, value]) => value) };
        return { results: [] };
      }
    };
  }
};
const env = { REPORTS: database, ALLOWED_ORIGIN: "https://charavision.github.io" };
const request = (path, method = "GET", body) => new Request(`https://worker.example${path}`, {
  method, headers: { Origin: "https://charavision.github.io", "X-Report-Pin": "TEST1", "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const snapshot = { ui: { chartTheme: "purple", showLabels: false }, output: { outputBarWidth: "adapted" } };
let response = await worker.fetch(request("/settings/slots/1", "PUT", { title: "Meine Ansicht", settings: snapshot }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots"), env);
assert.equal((await response.json()).slots[0].settings.ui.chartTheme, "purple");
response = await worker.fetch(request("/settings/slots/standard", "PUT", { slot: 1 }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots/public"), env);
assert.equal((await response.json()).standard.settings.output.outputBarWidth, "adapted");
response = await worker.fetch(request("/settings/slots/1", "DELETE"), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots/public"), env);
assert.equal((await response.json()).standard, null);
console.log("Cloudflare-Einstellungsslots: Speichern, Lesen, globaler Standard und Löschen erfolgreich.");
