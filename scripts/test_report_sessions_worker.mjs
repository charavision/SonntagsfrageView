import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../report-worker/src/index.js";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(new URL("../report-worker/schema.sql", import.meta.url), "utf8"));
sqlite.prepare("INSERT INTO report_users (id, person_name, work_name, role, pin_hash) VALUES (?, ?, ?, ?, ?)").run(
  "session-test-user", "Test", "Tester", "Helper", createHash("sha256").update("TEST1").digest("hex")
);
const database = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async run() { const result = statement.run(...params); return { meta: { changes: result.changes } }; },
      async first() { return statement.get(...params) || null; },
      async all() { return { results: statement.all(...params) }; }
    };
  }
};
const env = { REPORTS: database, ALLOWED_ORIGIN: "https://charavision.github.io" };
const request = (path, method = "GET", { pin, token, body } = {}) => new Request(`https://worker.example${path}`, {
  method,
  headers: { Origin: "https://charavision.github.io", "Content-Type": "application/json", ...(pin ? { "X-Report-Pin": pin } : {}), ...(token ? { "X-Report-Session": token } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const actualNow = Date.now;
let now = 1_700_000_000_000;
Date.now = () => now;
try {
  let response = await worker.fetch(request("/session", "POST", { pin: "TEST1" }), env);
  assert.equal(response.status, 200);
  let session = await response.json();
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(session.expiresAt, now + 15 * 60_000);
  assert.equal(session.authMethod, "pin");
  response = await worker.fetch(request("/settings/slots", "GET", { pin: "TEST1" }), env);
  assert.equal(response.status, 401, "PIN alone must not authorize subsequent requests");
  response = await worker.fetch(request("/session", "GET", { token: session.token }), env);
  assert.equal(response.status, 200, "a session can be restored after reload");

  now += 14 * 60_000;
  response = await worker.fetch(request("/session", "GET", { token: session.token }), env);
  assert.equal((await response.json()).expiresAt, 1_700_000_000_000 + 15 * 60_000, "ordinary requests must not extend a session");
  response = await worker.fetch(request("/session/touch", "POST", { token: session.token }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).expiresAt, now + 15 * 60_000);
  now += 2 * 60_000;
  response = await worker.fetch(request("/session", "GET", { token: session.token }), env);
  assert.equal(response.status, 200, "a touched session survives its original deadline");
  now += 14 * 60_000;
  response = await worker.fetch(request("/session", "GET", { token: session.token }), env);
  assert.equal(response.status, 401, "session expires after 15 minutes without a touch");
  response = await worker.fetch(request("/session/touch", "POST", { token: session.token }), env);
  assert.equal(response.status, 401, "an expired session cannot be revived");

  response = await worker.fetch(request("/session", "POST", { pin: "TEST1" }), env);
  session = await response.json();
  response = await worker.fetch(request("/session/logout", "POST", { body: { token: session.token } }), env);
  assert.equal(response.status, 200);
  response = await worker.fetch(request("/session", "GET", { token: session.token }), env);
  assert.equal(response.status, 401, "logout revokes the token immediately");
  sqlite.prepare("UPDATE report_users SET pin_hash = ? WHERE id = 'builtin-admin'").run(createHash("sha256").update("ADMIN").digest("hex"));
  response = await worker.fetch(request("/session", "POST", { pin: "ADMIN" }), env);
  const adminSession = await response.json();
  response = await worker.fetch(request("/passkey/register/options", "POST", { token: adminSession.token }), env);
  assert.equal(response.status, 200, "a PIN-authenticated admin session can register a passkey");
  console.log("Report-Sitzungen: PIN-Austausch, Reload, 15-Minuten-Frist, Verlängerung und Logout erfolgreich.");
} finally {
  Date.now = actualNow;
  sqlite.close();
}
