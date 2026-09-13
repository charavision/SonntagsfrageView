const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Report-Pin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin"
  }
});

const hexDigest = async value => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

const sameText = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

const reportUsers = [
  { id: "builtin-admin", personName: "Sebastian", workName: "Admin", role: "Admin", hash: "911c06c0297b0dc2a5a3eb30b8bfbaa5a36a3c23c3fec23712a45477f12b963a", system: true },
  { id: "builtin-helper2", personName: "Theresa", workName: "Helper2", role: "Helper", hash: "a9444f51a1eccdfcb20758bd550a9b579a997371696e7e8d670ebf82df98b019", system: true },
  { id: "builtin-helper3", personName: "Felix", workName: "Helper3", role: "Helper", hash: "39e91335c32659ef778fb32fcaf617d01e9efd7543a4cde2a35217503c7e3721", system: true }
];

const developerFeatureKeys = ["intro", "deviceForce", "tabMode", "dataUpdate", "pollDateSelection", "abbreviations", "sinceElection", "brackets", "labels", "regionLabelMode", "partyLabelMode", "percentLabelMode", "sinceElectionMode", "barColors", "barColorMode", "barNeon", "percentValues", "lut", "yAxisMode", "background", "viewSize", "uiScale", "fullscreen", "fullscreenDefault", "helperAppAccess", "preview", "a4Output", "export3d"];
const developerOptions = { regionLabelMode: ["auto", "0", "90", "off"], partyLabelMode: ["auto", "0", "90", "off"], percentLabelMode: ["with", "without", "off"], sinceElectionMode: ["color", "gray", "off"], barColorMode: ["party", "lightblue", "gray"], yAxisMode: ["static", "dynamic", "off"] };
const developerDefaultValue = (key, platform) => ({ deviceForce: platform, regionLabelMode: "auto", partyLabelMode: "auto", percentLabelMode: "without", sinceElectionMode: "color", barColorMode: "party", yAxisMode: "static" }[key] ?? !["export3d", "tabMode", "helperAppAccess", "pollDateSelection"].includes(key));
const developerDefaults = {
  mobile: Object.fromEntries(developerFeatureKeys.map(key => [key, { visible: key !== "helperAppAccess", value: developerDefaultValue(key, "mobile") }])),
  desktop: Object.fromEntries(developerFeatureKeys.map(key => [key, { visible: key !== "helperAppAccess", value: developerDefaultValue(key, "desktop") }]))
};
const sanitizeDeveloperSettings = input => Object.fromEntries(["mobile", "desktop"].map(platform => [platform,
  Object.fromEntries(developerFeatureKeys.map(key => {
    const candidate = input?.[platform]?.[key] || {};
    const fallback = developerDefaults[platform][key];
    return [key, {
      visible: typeof candidate.visible === "boolean" ? candidate.visible : fallback.visible,
      value: key === "deviceForce"
        ? (["desktop", "mobile"].includes(candidate.value) ? candidate.value : fallback.value)
        : developerOptions[key]
          ? (developerOptions[key].includes(candidate.value) ? candidate.value : fallback.value)
          : (typeof candidate.value === "boolean" ? candidate.value : fallback.value)
    }];
  }))
]));

const authenticate = async (env, suppliedHash) => {
  try {
    const stored = await env.REPORTS.prepare("SELECT id, person_name, work_name, role, pin_hash FROM report_users WHERE pin_hash = ? AND active = 1 LIMIT 1").bind(suppliedHash).first();
    return stored ? { id: stored.id, personName: stored.person_name, workName: stored.work_name, role: stored.role, hash: stored.pin_hash } : null;
  } catch (error) {
    return reportUsers.find(user => sameText(suppliedHash, user.hash)) || null;
  }
};

const ensureProjectsTable = env => env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  configuration TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, configuration)
)`).run();

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://charavision.github.io";
    const originAllowed = requestOrigin === allowedOrigin || requestOrigin === "null";
    const origin = originAllowed ? requestOrigin : allowedOrigin;

    if (request.method === "OPTIONS") {
      if (!originAllowed) return json({ error: "Origin nicht erlaubt." }, 403, origin);
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-Report-Pin",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Vary": "Origin"
      } });
    }
    if (requestOrigin && !originAllowed) return json({ error: "Origin nicht erlaubt." }, 403, origin);

    const url = new URL(request.url);
    if (url.pathname === "/settings/intro" && request.method === "GET") {
      try {
        await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
        const setting = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'intro_enabled'").first();
        return json({ enabled: !setting || setting.value !== "0" }, 200, origin);
      } catch (error) {
        return json({ enabled: true }, 200, origin);
      }
    }
    if (url.pathname === "/settings/developer" && request.method === "GET") {
      try {
        await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
        const setting = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'developer_settings'").first();
        const parsed = setting?.value ? JSON.parse(setting.value) : developerDefaults;
        return json({ settings: sanitizeDeveloperSettings(parsed) }, 200, origin);
      } catch (error) {
        return json({ settings: developerDefaults }, 200, origin);
      }
    }

    const suppliedPin = request.headers.get("X-Report-Pin") || "";
    const suppliedHash = suppliedPin ? await hexDigest(suppliedPin) : "";
    const reporter = await authenticate(env, suppliedHash);
    if (!reporter) return json({ error: "PIN nicht gültig." }, 401, origin);

    if (url.pathname === "/settings/intro" && request.method === "PATCH") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf das Intro einstellen." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const value = payload.enabled === false ? "0" : "1";
      await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
      await env.REPORTS.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('intro_enabled', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(value).run();
      return json({ ok: true, enabled: value === "1" }, 200, origin);
    }
    if (url.pathname === "/settings/developer" && request.method === "PATCH") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Entwicklereinstellungen verändern." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const settings = sanitizeDeveloperSettings(payload.settings);
      await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
      await env.REPORTS.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('developer_settings', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(settings)).run();
      await env.REPORTS.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('intro_enabled', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(settings.desktop.intro.visible && settings.desktop.intro.value ? "1" : "0").run();
      return json({ ok: true, settings }, 200, origin);
    }

    if (url.pathname === "/session" && request.method === "POST") return json({ ok: true, reporter: reporter.workName, personName: reporter.personName, workName: reporter.workName, role: reporter.role }, 200, origin);

    if (url.pathname === "/projects" && request.method === "GET") {
      await ensureProjectsTable(env);
      const result = await env.REPORTS.prepare("SELECT id, configuration, title, detail, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5").bind(reporter.id).all();
      return json({ projects: result.results || [] }, 200, origin);
    }

    if (url.pathname === "/projects" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const configuration = String(payload.configuration || "").trim();
      const title = String(payload.title || "Sonntagsfragen").trim().slice(0, 100) || "Sonntagsfragen";
      const detail = String(payload.detail || "Aktuelle Konfiguration").trim().slice(0, 240) || "Aktuelle Konfiguration";
      if (!/^[0-9A-Za-z]{13,25}$/.test(configuration)) return json({ error: "Die Konfiguration ist nicht gültig." }, 400, origin);
      await ensureProjectsTable(env);
      const existing = await env.REPORTS.prepare("SELECT id FROM projects WHERE user_id = ? AND configuration = ? LIMIT 1").bind(reporter.id, configuration).first();
      if (!existing) {
        const count = await env.REPORTS.prepare("SELECT COUNT(*) AS count FROM projects WHERE user_id = ?").bind(reporter.id).first();
        if (Number(count?.count || 0) >= 5) return json({ error: "Es können maximal fünf Projekte gespeichert werden." }, 409, origin);
      }
      const id = existing?.id || crypto.randomUUID();
      await env.REPORTS.prepare("INSERT INTO projects (id, user_id, configuration, title, detail) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, configuration) DO UPDATE SET title = excluded.title, detail = excluded.detail, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(id, reporter.id, configuration, title, detail).run();
      return json({ ok: true, id }, existing ? 200 : 201, origin);
    }

    const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "PATCH") {
      const payload = await request.json().catch(() => ({}));
      const configuration = String(payload.configuration || "").trim();
      const title = String(payload.title || "Unbenannt").trim().slice(0, 100) || "Unbenannt";
      const detail = String(payload.detail || "Aktuelle Konfiguration").trim().slice(0, 240) || "Aktuelle Konfiguration";
      if (!/^[0-9A-Za-z]{13,25}$/.test(configuration)) return json({ error: "Die Konfiguration ist nicht gültig." }, 400, origin);
      await ensureProjectsTable(env);
      try {
        const result = await env.REPORTS.prepare("UPDATE projects SET configuration = ?, title = ?, detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?").bind(configuration, title, detail, decodeURIComponent(projectMatch[1]), reporter.id).run();
        if (!result.meta?.changes) return json({ error: "Projekt nicht gefunden." }, 404, origin);
        return json({ ok: true, id: decodeURIComponent(projectMatch[1]) }, 200, origin);
      } catch (error) {
        return json({ error: "Diese Konfiguration ist bereits als anderes Projekt gespeichert." }, 409, origin);
      }
    }

    if (projectMatch && request.method === "DELETE") {
      await ensureProjectsTable(env);
      const result = await env.REPORTS.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(decodeURIComponent(projectMatch[1]), reporter.id).run();
      if (!result.meta?.changes) return json({ error: "Projekt nicht gefunden." }, 404, origin);
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === "/accounts" && request.method === "GET") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Accounts verwalten." }, 403, origin);
      const result = await env.REPORTS.prepare("SELECT id, person_name, work_name, role, active, created_at FROM report_users ORDER BY created_at ASC").all();
      const stored = (result.results || []).map(user => ({ id: user.id, personName: user.person_name, workName: user.work_name, role: user.role, active: Boolean(user.active), system: false }));
      return json({ accounts: stored }, 200, origin);
    }

    const accountPinMatch = url.pathname.match(/^\/accounts\/([^/]+)\/pin$/);
    if (accountPinMatch && request.method === "PATCH") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf PINs zurücksetzen." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const pin = String(payload.pin || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(pin)) return json({ error: "Die PIN muss aus genau fünf Buchstaben oder Zahlen bestehen." }, 400, origin);
      const pinHash = await hexDigest(pin);
      try {
        const result = await env.REPORTS.prepare("UPDATE report_users SET pin_hash = ? WHERE id = ?").bind(pinHash, decodeURIComponent(accountPinMatch[1])).run();
        if (!result.meta?.changes) return json({ error: "Account nicht gefunden." }, 404, origin);
      } catch (error) { return json({ error: "Diese PIN ist bereits vergeben." }, 409, origin); }
      return json({ ok: true }, 200, origin);
    }

    const accountMatch = url.pathname.match(/^\/accounts\/([^/]+)$/);
    if (accountMatch && request.method === "DELETE") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Accounts löschen." }, 403, origin);
      const accountId = decodeURIComponent(accountMatch[1]);
      if (accountId === reporter.id) return json({ error: "Der aktuell verwendete eigene Account kann nicht gelöscht werden." }, 400, origin);
      const result = await env.REPORTS.prepare("DELETE FROM report_users WHERE id = ?").bind(accountId).run();
      if (!result.meta?.changes) return json({ error: "Account nicht gefunden." }, 404, origin);
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === "/accounts" && request.method === "POST") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Accounts anlegen." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const personName = String(payload.personName || "").trim();
      const workName = String(payload.workName || "").trim();
      const role = payload.role === "Admin" ? "Admin" : "Helper";
      const pin = String(payload.pin || "").trim().toUpperCase();
      if (!personName || personName.length > 60 || !workName || workName.length > 40) return json({ error: "Bitte Name und Arbeitsname vollständig ausfüllen." }, 400, origin);
      if (!/^[A-Z0-9]{5}$/.test(pin)) return json({ error: "Die PIN muss aus genau fünf Buchstaben oder Zahlen bestehen." }, 400, origin);
      if (reportUsers.some(user => user.workName.toLowerCase() === workName.toLowerCase())) return json({ error: "Dieser Arbeitsname ist bereits vergeben." }, 409, origin);
      const pinHash = await hexDigest(pin);
      if (reportUsers.some(user => sameText(pinHash, user.hash))) return json({ error: "Diese PIN ist bereits vergeben." }, 409, origin);
      try {
        await env.REPORTS.prepare("INSERT INTO report_users (id, person_name, work_name, role, pin_hash) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), personName, workName, role, pinHash).run();
      } catch (error) {
        return json({ error: "Arbeitsname oder PIN ist bereits vergeben." }, 409, origin);
      }
      return json({ ok: true }, 201, origin);
    }

    if (url.pathname === "/reports" && request.method === "GET") {
      const result = await env.REPORTS.prepare("SELECT id, subject, body, configuration, reporter, created_at FROM reports ORDER BY created_at DESC LIMIT 100").all();
      return json({ reports: result.results || [] }, 200, origin);
    }

    if (url.pathname === "/reports" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const requestedSubject = String(payload.subject || "").trim();
      const subject = reporter.role === "Admin" ? (requestedSubject || "Meldung") : "Meldung";
      const body = String(payload.body || "").trim();
      const configuration = payload.configuration ? String(payload.configuration).slice(0, 25) : null;
      if (subject.length > 100 || !body || body.length > 3000) return json({ error: "Bitte die Beschreibung vollständig ausfüllen." }, 400, origin);
      const id = crypto.randomUUID();
      await env.REPORTS.prepare("INSERT INTO reports (id, subject, body, configuration, reporter) VALUES (?, ?, ?, ?, ?)").bind(id, subject, body, configuration, reporter.workName).run();
      return json({ ok: true, id }, 201, origin);
    }

    const reportMatch = url.pathname.match(/^\/reports\/([^/]+)$/);
    if (reportMatch && request.method === "DELETE") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Einträge löschen." }, 403, origin);
      const result = await env.REPORTS.prepare("DELETE FROM reports WHERE id = ?").bind(decodeURIComponent(reportMatch[1])).run();
      if (!result.meta?.changes) return json({ error: "Eintrag nicht gefunden." }, 404, origin);
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "Nicht gefunden." }, 404, origin);
  }
};
