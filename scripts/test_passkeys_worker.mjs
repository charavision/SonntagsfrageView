import assert from "node:assert/strict";
import worker from "../report-worker/src/index.js";

const database = {
  prepare(sql) {
    return {
      bind() { return this; },
      async run() { return { meta: { changes: 1 } }; },
      async first() {
        if (sql.includes("FROM report_users WHERE pin_hash")) return { id: "builtin-admin", person_name: "Sebastian", work_name: "Admin", role: "Admin", pin_hash: "test" };
        if (sql.includes("COUNT(*) AS count FROM passkey_challenges")) return { count: 0 };
        return null;
      },
      async all() { return { results: [] }; }
    };
  }
};
const env = { REPORTS: database, ALLOWED_ORIGIN: "https://charavision.github.io" };
const request = (path, origin, pin = "") => new Request(`https://worker.example${path}`, {
  method: "POST", headers: { Origin: origin, "X-Report-Pin": pin }
});

let response = await worker.fetch(request("/passkey/register/options", "https://evil.example", "12345"), env);
assert.equal(response.status, 403, "other origins must be rejected");
response = await worker.fetch(request("/passkey/register/options", "https://charavision.github.io"), env);
assert.equal(response.status, 403, "registration must require an admin PIN");
response = await worker.fetch(request("/passkey/register/options", "https://charavision.github.io", "12345"), env);
assert.equal(response.status, 200);
const setup = await response.json();
assert.equal(setup.options.rp.id, "charavision.github.io");
assert.equal(setup.options.authenticatorSelection.userVerification, "required");
assert.ok(setup.flowId && setup.options.challenge);
response = await worker.fetch(request("/passkey/login/options", "https://charavision.github.io"), env);
assert.equal(response.status, 404, "login must require a registered passkey");
console.log("Passkey-Worker: Origin, PIN-Schutz, Challenge und leerer Login geprüft.");
