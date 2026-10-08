import assert from "node:assert/strict";
import worker from "../report-worker/src/index.js";
const slots = new Map();
const settings = new Map();
const preferences = new Map();
const sessions = new Map();
const database = {
  prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async run() {
        if (sql.startsWith("INSERT INTO settings_slots")) slots.set(`${params[0]}:${params[1]}`, { slot: params[1], title: params[2], settings: params[3] });
        if (sql.startsWith("DELETE FROM settings_slots")) slots.delete(`${params[0]}:${params[1]}`);
        if (sql.startsWith("INSERT INTO user_settings_preferences")) preferences.set(params[0], { selected_slot: params[1], always_use: params[2] });
        if (sql.startsWith("UPDATE user_settings_preferences")) {
          const current = preferences.get(params[0]);
          if (current?.selected_slot === params[1]) current.selected_slot = 0;
        }
        if (sql.startsWith("INSERT INTO app_settings") && sql.includes("standard_settings_slot")) settings.set("standard_settings_slot", params[0]);
        if (sql.startsWith("DELETE FROM app_settings") && sql.includes("standard_settings_slot")) settings.delete("standard_settings_slot");
        if (sql.startsWith("INSERT INTO passkey_sessions")) sessions.set(params[0], { user_id: params[1], expires_at: params[2], auth_method: params[3] });
        if (sql.startsWith("DELETE FROM passkey_sessions WHERE token_hash")) sessions.delete(params[0]);
        return { meta: { changes: 1 } };
      },
      async first() {
        if (sql.includes("FROM passkey_sessions s JOIN report_users")) {
          const session = sessions.get(params[0]);
          return session?.expires_at > params[1] ? { id: "builtin-admin", person_name: "Test", work_name: "Admin", role: "Admin", expires_at: session.expires_at, auth_method: session.auth_method } : null;
        }
        if (sql.includes("FROM report_users")) return { id: "builtin-admin", person_name: "Test", work_name: "Admin", role: "Admin", pin_hash: "x" };
        if (sql.includes("FROM app_settings") && sql.includes("standard_settings_slot")) return settings.has("standard_settings_slot") ? { value: settings.get("standard_settings_slot") } : null;
        if (sql.includes("FROM settings_slots")) return slots.get(`${params[0]}:${params[1]}`) || null;
        if (sql.includes("FROM user_settings_preferences")) return preferences.get(params[0]) || null;
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
let sessionToken = "";
const request = (path, method = "GET", body) => new Request(`https://worker.example${path}`, {
  method, headers: { Origin: "https://charavision.github.io", ...(sessionToken ? { "X-Report-Session": sessionToken } : { "X-Report-Pin": "TEST1" }), "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const snapshot = { ui: { chartTheme: "purple", showLabels: false }, output: { outputBarWidth: "adapted" } };
let response = await worker.fetch(request("/session", "POST"), env);
assert.equal(response.status, 200);
sessionToken = (await response.json()).token;
assert.ok(sessionToken);
response = await worker.fetch(request("/settings/slots/1", "PUT", { title: "Meine Ansicht", settings: snapshot }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots"), env);
let listing = await response.json();
assert.equal(listing.slots[0].settings.ui.chartTheme, "purple");
assert.equal(listing.personalSlot, 0);
assert.equal(listing.alwaysUse, false);
response = await worker.fetch(request("/settings/preferences", "PUT", { personalSlot: 2, alwaysUse: true }), env);
assert.equal(response.status, 400, "Ein leerer persönlicher Slot ist nicht wählbar");
response = await worker.fetch(request("/settings/preferences", "PUT", { personalSlot: 1, alwaysUse: true }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots"), env);
listing = await response.json();
assert.equal(listing.personalSlot, 1);
assert.equal(listing.alwaysUse, true);
response = await worker.fetch(request("/settings/preferences", "PUT", { personalSlot: 0, alwaysUse: true }), env);
assert.equal(response.status, 200, "Standard muss als persönliche Starteinstellung wählbar sein");
response = await worker.fetch(request("/settings/slots"), env);
listing = await response.json();
assert.equal(listing.personalSlot, 0);
response = await worker.fetch(request("/settings/preferences", "PUT", { personalSlot: 1, alwaysUse: true }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots/standard", "PUT", { slot: 1 }), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots/public"), env);
assert.equal((await response.json()).standard.settings.output.outputBarWidth, "adapted");
response = await worker.fetch(request("/settings/slots/1", "DELETE"), env);
assert.equal(response.status, 200);
response = await worker.fetch(request("/settings/slots"), env);
assert.equal((await response.json()).personalSlot, 0, "Löschen setzt die persönliche Auswahl auf Standard zurück");
response = await worker.fetch(request("/settings/slots/public"), env);
assert.equal((await response.json()).standard, null);
console.log("Cloudflare-Einstellungsslots: Speichern, persönliche Auswahl, globaler Standard und Löschen erfolgreich.");
