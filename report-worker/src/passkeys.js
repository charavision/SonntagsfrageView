import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

const ADMIN_ID = "builtin-admin";
const CHALLENGE_LIFETIME_MS = 60_000;
const SESSION_LIFETIME_MS = 15 * 60 * 1000;
const ALGORITHMS = [-7, -257];

const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = value => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), character => character.charCodeAt(0));
};
const randomToken = size => encode(crypto.getRandomValues(new Uint8Array(size)));
const digest = async value => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const adminByPin = reporter => reporter?.id === ADMIN_ID && reporter.role === "Admin" && reporter.personName === "Sebastian";
const passkeyOrigin = env => env.ALLOWED_ORIGIN || "https://charavision.github.io";
const isPasskeyOrigin = (request, env) => {
  const expected = passkeyOrigin(env);
  return expected.startsWith("https://") && request.headers.get("Origin") === expected;
};

async function ensurePasskeyTables(env) {
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS admin_passkeys (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`).run();
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS passkey_challenges (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    challenge TEXT NOT NULL, ip_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
  )`).run();
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS passkey_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    auth_method TEXT NOT NULL DEFAULT 'passkey',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`).run();
  const columns = await env.REPORTS.prepare("PRAGMA table_info(passkey_sessions)").all();
  if (!(columns.results || []).some(column => column.name === "auth_method")) {
    await env.REPORTS.prepare("ALTER TABLE passkey_sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'passkey'").run();
    await env.REPORTS.prepare("DELETE FROM passkey_sessions").run();
  }
}

async function issueChallenge(env, request, kind, challenge) {
  const now = Date.now();
  const ipHash = await digest(request.headers.get("CF-Connecting-IP") || "unknown");
  await env.REPORTS.prepare("DELETE FROM passkey_challenges WHERE expires_at <= ?").bind(now).run();
  const pending = await env.REPORTS.prepare("SELECT COUNT(*) AS count FROM passkey_challenges WHERE ip_hash = ? AND expires_at > ?").bind(ipHash, now).first();
  if (Number(pending?.count || 0) >= 20) return null;
  const flowId = randomToken(24);
  await env.REPORTS.prepare("INSERT INTO passkey_challenges (id, user_id, kind, challenge, ip_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(flowId, ADMIN_ID, kind, challenge, ipHash, now + CHALLENGE_LIFETIME_MS).run();
  return flowId;
}

async function consumeChallenge(env, flowId, kind) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(flowId || "")) return null;
  const row = await env.REPORTS.prepare("SELECT challenge FROM passkey_challenges WHERE id = ? AND user_id = ? AND kind = ? AND expires_at > ?").bind(flowId, ADMIN_ID, kind, Date.now()).first();
  if (!row) return null;
  const removed = await env.REPORTS.prepare("DELETE FROM passkey_challenges WHERE id = ? AND user_id = ? AND kind = ? AND challenge = ?").bind(flowId, ADMIN_ID, kind, row.challenge).run();
  return removed.meta?.changes === 1 ? row.challenge : null;
}

export async function issueReportSession(env, userId, authMethod) {
  await ensurePasskeyTables(env);
  const token = randomToken(32);
  const tokenHash = await digest(token);
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  await env.REPORTS.prepare("DELETE FROM passkey_sessions WHERE expires_at <= ?").bind(Date.now()).run();
  await env.REPORTS.prepare("INSERT INTO passkey_sessions (token_hash, user_id, expires_at, auth_method) VALUES (?, ?, ?, ?)").bind(tokenHash, userId, expiresAt, authMethod).run();
  return { token, expiresAt };
}

export async function authenticateReportSession(env, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
  await ensurePasskeyTables(env);
  const row = await env.REPORTS.prepare("SELECT u.id, u.person_name, u.work_name, u.role, s.expires_at, s.auth_method FROM passkey_sessions s JOIN report_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1").bind(await digest(token), Date.now()).first();
  return row ? { id: row.id, personName: row.person_name, workName: row.work_name, role: row.role, expiresAt: row.expires_at, authMethod: row.auth_method } : null;
}

export async function touchReportSession(env, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
  await ensurePasskeyTables(env);
  const now = Date.now();
  const expiresAt = now + SESSION_LIFETIME_MS;
  const updated = await env.REPORTS.prepare("UPDATE passkey_sessions SET expires_at = ? WHERE token_hash = ? AND expires_at > ?").bind(expiresAt, await digest(token), now).run();
  return updated.meta?.changes === 1 ? expiresAt : null;
}

export async function revokeReportSession(env, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return;
  await ensurePasskeyTables(env);
  await env.REPORTS.prepare("DELETE FROM passkey_sessions WHERE token_hash = ?").bind(await digest(token)).run();
}

export async function handlePasskeyRoute({ request, env, origin, pinReporter, sessionReporter, json }) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/passkey/")) return null;
  if (!isPasskeyOrigin(request, env)) return json({ error: "Passkeys sind nur auf der veröffentlichten HTTPS-Seite verfügbar." }, 403, origin);
  const rpOrigin = passkeyOrigin(env);
  const rpID = new URL(rpOrigin).hostname;
  await ensurePasskeyTables(env);

  if (path === "/passkey/register/options" && request.method === "POST") {
    if (!adminByPin(pinReporter) && !(adminByPin(sessionReporter) && sessionReporter.authMethod === "pin")) return json({ error: "Passkey-Einrichtung erfordert Sebastians Admin-PIN." }, 403, origin);
    const existing = await env.REPORTS.prepare("SELECT id, transports FROM admin_passkeys WHERE user_id = ?").bind(ADMIN_ID).all();
    const options = await generateRegistrationOptions({
      rpName: "Sonntagsfragen", rpID, userID: new TextEncoder().encode(ADMIN_ID),
      userName: "Sebastian", userDisplayName: "Sebastian", attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: ALGORITHMS,
      excludeCredentials: (existing.results || []).map(row => ({ id: row.id, transports: JSON.parse(row.transports || "[]") }))
    });
    const flowId = await issueChallenge(env, request, "register", options.challenge);
    return flowId ? json({ flowId, options }, 200, origin) : json({ error: "Zu viele Passkey-Versuche. Bitte kurz warten." }, 429, origin);
  }

  if (path === "/passkey/register/verify" && request.method === "POST") {
    if (!adminByPin(pinReporter) && !(adminByPin(sessionReporter) && sessionReporter.authMethod === "pin")) return json({ error: "Passkey-Einrichtung erfordert Sebastians Admin-PIN." }, 403, origin);
    const payload = await request.json().catch(() => ({}));
    const challenge = await consumeChallenge(env, payload.flowId, "register");
    if (!challenge) return json({ error: "Die Passkey-Anfrage ist abgelaufen. Bitte erneut beginnen." }, 400, origin);
    try {
      const verified = await verifyRegistrationResponse({
        response: payload.response, expectedChallenge: challenge,
        expectedOrigin: rpOrigin, expectedRPID: rpID,
        requireUserVerification: true, supportedAlgorithmIDs: ALGORITHMS
      });
      if (!verified.verified) throw new Error("not verified");
      const credential = verified.registrationInfo.credential;
      await env.REPORTS.prepare("INSERT INTO admin_passkeys (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)").bind(
        credential.id, ADMIN_ID, encode(credential.publicKey), credential.counter,
        JSON.stringify(credential.transports || [])
      ).run();
      return json({ ok: true }, 200, origin);
    } catch (error) { return json({ error: "Der Passkey konnte nicht bestätigt werden." }, 400, origin); }
  }

  if (path === "/passkey/login/options" && request.method === "POST") {
    const existing = await env.REPORTS.prepare("SELECT id, transports FROM admin_passkeys WHERE user_id = ?").bind(ADMIN_ID).all();
    if (!existing.results?.length) return json({ error: "Für Sebastian ist noch kein Passkey eingerichtet. Bitte zuerst mit PIN anmelden." }, 404, origin);
    const options = await generateAuthenticationOptions({
      rpID, userVerification: "required",
      allowCredentials: existing.results.map(row => ({ id: row.id, transports: JSON.parse(row.transports || "[]") }))
    });
    const flowId = await issueChallenge(env, request, "login", options.challenge);
    return flowId ? json({ flowId, options }, 200, origin) : json({ error: "Zu viele Passkey-Versuche. Bitte kurz warten." }, 429, origin);
  }

  if (path === "/passkey/login/verify" && request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    const challenge = await consumeChallenge(env, payload.flowId, "login");
    if (!challenge) return json({ error: "Die Passkey-Anfrage ist abgelaufen. Bitte erneut beginnen." }, 400, origin);
    const credentialID = String(payload.response?.id || "");
    const row = await env.REPORTS.prepare("SELECT id, public_key, counter, transports FROM admin_passkeys WHERE id = ? AND user_id = ?").bind(credentialID, ADMIN_ID).first();
    if (!row) return json({ error: "Dieser Passkey gehört nicht zu Sebastian." }, 403, origin);
    try {
      const verified = await verifyAuthenticationResponse({
        response: payload.response, expectedChallenge: challenge,
        expectedOrigin: rpOrigin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: row.id, publicKey: decode(row.public_key), counter: row.counter, transports: JSON.parse(row.transports || "[]") }
      });
      if (!verified.verified) throw new Error("not verified");
      await env.REPORTS.prepare("UPDATE admin_passkeys SET counter = ? WHERE id = ? AND user_id = ?").bind(verified.authenticationInfo.newCounter, row.id, ADMIN_ID).run();
      const session = await issueReportSession(env, ADMIN_ID, "passkey");
      return json({ ok: true, ...session, authMethod: "passkey", role: "Admin", reporter: "Admin", personName: "Sebastian", workName: "Admin" }, 200, origin);
    } catch (error) { return json({ error: "Passkey-Anmeldung fehlgeschlagen." }, 400, origin); }
  }

  if (path === "/passkey/logout" && request.method === "POST") {
    const token = request.headers.get("X-Report-Session") || "";
    if (token) await revokeReportSession(env, token);
    return json({ ok: true }, 200, origin);
  }

  return json({ error: "Nicht gefunden." }, 404, origin);
}
