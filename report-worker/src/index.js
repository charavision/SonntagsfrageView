import { authenticatePasskeySession, handlePasskeyRoute } from "./passkeys.js";

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Report-Pin, X-Report-Session",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

const developerFeatureKeys = ["intro", "deviceForce", "tabMode", "dataUpdate", "pollDateSelection", "abbreviations", "sinceElection", "brackets", "labels", "regionLabelMode", "partyLabelMode", "percentLabelMode", "sinceElectionMode", "barColors", "barColorMode", "barNeon", "percentValues", "lut", "yAxisMode", "background", "viewSize", "uiScale", "fullscreen", "fullscreenDefault", "helperAppAccess", "helperAndroidAccess", "helperMacAccess", "helperIntroAccess", "preview", "a4Output", "a4DiagramFormat", "export3d"];
const developerOptions = { regionLabelMode: ["auto", "0", "90", "off"], partyLabelMode: ["auto", "0", "90", "off"], percentLabelMode: ["with", "without", "off"], sinceElectionMode: ["color", "gray", "off"], barColorMode: ["party", "lightblue", "gray"], barNeon: ["neon", "matt", "hell"], yAxisMode: ["static", "dynamic", "off"] };
const developerDefaultValue = (key, platform) => ({ deviceForce: platform, regionLabelMode: "auto", partyLabelMode: "auto", percentLabelMode: "without", sinceElectionMode: "color", barColorMode: "party", barNeon: "neon", yAxisMode: "static" }[key] ?? !["export3d", "tabMode", "helperAppAccess", "helperAndroidAccess", "helperMacAccess", "helperIntroAccess", "pollDateSelection"].includes(key));
const developerDefaults = {
  mobile: Object.fromEntries(developerFeatureKeys.map(key => [key, { visible: !key.startsWith("helper"), value: developerDefaultValue(key, "mobile") }])),
  desktop: Object.fromEntries(developerFeatureKeys.map(key => [key, { visible: !key.startsWith("helper"), value: developerDefaultValue(key, "desktop") }]))
};
const sanitizeDeveloperSettings = input => Object.fromEntries(["mobile", "desktop"].map(platform => [platform,
  Object.fromEntries(developerFeatureKeys.map(key => {
    const candidate = { ...(input?.[platform]?.[key] || {}) };
    if (key === "barNeon" && typeof candidate.value === "boolean") candidate.value = candidate.value ? "neon" : "matt";
    const fallback = key === "barNeon" ? { ...developerDefaults[platform][key], value: "neon" } : developerDefaults[platform][key];
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

const ensureProjectsTable = async env => {
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    configuration TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    poll_selection TEXT,
    settings TEXT,
    slot INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(user_id, configuration)
  )`).run();
  const columns = await env.REPORTS.prepare("PRAGMA table_info(projects)").all();
  if (!(columns.results || []).some(column => column.name === "poll_selection")) {
    await env.REPORTS.prepare("ALTER TABLE projects ADD COLUMN poll_selection TEXT").run();
  }
  if (!(columns.results || []).some(column => column.name === "settings")) {
    await env.REPORTS.prepare("ALTER TABLE projects ADD COLUMN settings TEXT").run();
  }
  if (!(columns.results || []).some(column => column.name === "slot")) {
    await env.REPORTS.prepare("ALTER TABLE projects ADD COLUMN slot INTEGER").run();
  }
  const unslotted = await env.REPORTS.prepare("SELECT id, user_id FROM projects WHERE slot IS NULL ORDER BY user_id, created_at, id").all();
  const nextSlot = new Map();
  for (const project of unslotted.results || []) {
    if (!nextSlot.has(project.user_id)) {
      const occupied = await env.REPORTS.prepare("SELECT slot FROM projects WHERE user_id = ? AND slot IS NOT NULL").bind(project.user_id).all();
      nextSlot.set(project.user_id, new Set((occupied.results || []).map(row => Number(row.slot))));
    }
    const used = nextSlot.get(project.user_id);
    const slot = [1, 2, 3, 4, 5].find(number => !used.has(number));
    if (!slot) continue;
    await env.REPORTS.prepare("UPDATE projects SET slot = ? WHERE id = ?").bind(slot, project.id).run();
    used.add(slot);
  }
  await env.REPORTS.prepare("CREATE UNIQUE INDEX IF NOT EXISTS projects_user_slot ON projects(user_id, slot)").run();
};

const ensureSettingsSlotsTable = async env => {
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS settings_slots (
    user_id TEXT NOT NULL, slot INTEGER NOT NULL, title TEXT NOT NULL, settings TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, slot)
  )`).run();
  await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
  await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS user_settings_preferences (user_id TEXT PRIMARY KEY, selected_slot INTEGER NOT NULL DEFAULT 0, always_use INTEGER NOT NULL DEFAULT 0)").run();
};

const sanitizeSnapshot = value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = { ui: ["fullRegionNames", "showSinceElection", "changeMode", "sinceElectionMode", "showBrackets", "showLabels", "regionLabelMode", "partyLabelMode", "barColors", "barColorMode", "barStyle", "showPercentValues", "percentLabelMode", "showLut", "showBackground", "export3d", "chartTheme", "uiBrightness", "uiSaturation", "yAxisMode"], output: ["exportFormat", "a4Mode", "a4Orientation", "a4DiagramFormat", "outputBarWidth", "hideEmptyClusters"] };
  return Object.fromEntries(Object.entries(allowed).map(([section, keys]) => [section, Object.fromEntries(keys.filter(key => ["string", "number", "boolean"].includes(typeof value[section]?.[key])).map(key => [key, value[section][key]]))]));
};

const parseSnapshot = value => {
  try { return value ? sanitizeSnapshot(JSON.parse(value)) : null; }
  catch { return null; }
};
const parseStandardSlot = value => {
  try {
    const parsed = JSON.parse(value || "null");
    return parsed && typeof parsed === "object" ? parsed : { userId: "builtin-admin", slot: Number(value || 0) };
  } catch { return { userId: "builtin-admin", slot: Number(value || 0) }; }
};

const ensureSystemMessagesTable = async env => {
  await env.REPORTS.prepare(`CREATE TABLE IF NOT EXISTS system_messages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`).run();
  await env.REPORTS.prepare("CREATE INDEX IF NOT EXISTS system_messages_created_at ON system_messages(created_at DESC)").run();
};

const sanitizePollSelection = value => {
  if (!value || typeof value !== "object") return null;
  const dateLabels = [0, 1, 2].map(index => /^\d{4}-\d{2}-\d{2}$/.test(value.dateLabels?.[index] || "") ? value.dateLabels[index] : null);
  const rankOverrides = [0, 1, 2].map((fallback, index) => {
    const rank = Number(value.rankOverrides?.[index]);
    return Number.isInteger(rank) && rank >= 0 && rank < 10000 ? rank : fallback;
  });
  const mode = ["current", "from", "free"].includes(value.mode) ? value.mode : (value.dateMode ? "free" : "current");
  const sourceMode = value.sourceMode === "client" ? "client" : "institute";
  const sourceValue = typeof value.sourceValue === "string" ? value.sourceValue.trim().slice(0, 120) : "";
  return { mode, dateMode: mode !== "current", dateLabels, rankOverrides, sourceMode, sourceValue };
};

const parsePollSelection = value => {
  try { return value ? sanitizePollSelection(JSON.parse(value)) : null; }
  catch { return null; }
};

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
        "Access-Control-Allow-Headers": "Content-Type, X-Report-Pin, X-Report-Session",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Vary": "Origin"
      } });
    }
    if (requestOrigin && !originAllowed) return json({ error: "Origin nicht erlaubt." }, 403, origin);

    const url = new URL(request.url);
    if (url.pathname === "/settings/slots/public" && request.method === "GET") {
      await ensureSettingsSlotsTable(env);
      const selected = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'standard_settings_slot'").first();
      const selectedSlot = parseStandardSlot(selected?.value);
      const row = selectedSlot.slot ? await env.REPORTS.prepare("SELECT title, settings FROM settings_slots WHERE user_id = ? AND slot = ?").bind(selectedSlot.userId, selectedSlot.slot).first() : null;
      return json({ standard: row ? { title: row.title, settings: parseSnapshot(row.settings) } : null }, 200, origin);
    }
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
    if (url.pathname === "/settings/notification-interval" && request.method === "GET") {
      try {
        await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
        const setting = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'notification_interval_minutes'").first();
        return json({ intervalMinutes: setting?.value === "1" ? 1 : 30 }, 200, origin);
      } catch (error) {
        return json({ intervalMinutes: 30 }, 200, origin);
      }
    }
    if (url.pathname === "/notifications/system" && request.method === "GET") {
      try {
        await ensureSystemMessagesTable(env);
        const result = await env.REPORTS.prepare("SELECT id, title, body, created_at FROM system_messages ORDER BY created_at DESC LIMIT 20").all();
        return json({ messages: result.results || [] }, 200, origin);
      } catch (error) {
        return json({ messages: [] }, 200, origin);
      }
    }

    const suppliedPin = request.headers.get("X-Report-Pin") || "";
    const suppliedHash = suppliedPin ? await hexDigest(suppliedPin) : "";
    const pinReporter = suppliedPin ? await authenticate(env, suppliedHash) : null;
    const passkeyResponse = await handlePasskeyRoute({ request, env, origin, pinReporter, json });
    if (passkeyResponse) return passkeyResponse;
    const sessionToken = request.headers.get("X-Report-Session") || "";
    const reporter = pinReporter || (sessionToken ? await authenticatePasskeySession(env, sessionToken) : null);
    if (!reporter) return json({ error: "PIN nicht gültig." }, 401, origin);

    if (url.pathname === "/settings/slots" && request.method === "GET") {
      await ensureSettingsSlotsTable(env);
      const result = await env.REPORTS.prepare("SELECT slot, title, settings, updated_at FROM settings_slots WHERE user_id = ? ORDER BY slot").bind(reporter.id).all();
      const preferences = await env.REPORTS.prepare("SELECT selected_slot, always_use FROM user_settings_preferences WHERE user_id = ?").bind(reporter.id).first();
      const selected = reporter.role === "Admin" ? await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'standard_settings_slot'").first() : null;
      const selectedSlot = parseStandardSlot(selected?.value);
      return json({ slots: (result.results || []).map(row => ({ ...row, settings: parseSnapshot(row.settings) })), limit: reporter.role === "Admin" ? 10 : 2, standardSlot: selectedSlot.userId === reporter.id ? selectedSlot.slot : 0, personalSlot: preferences?.selected_slot || 0, alwaysUse: preferences?.always_use === 1 }, 200, origin);
    }
    if (url.pathname === "/settings/preferences" && request.method === "PUT") {
      const payload = await request.json().catch(() => ({}));
      const slot = Number(payload.personalSlot);
      if (!Number.isInteger(slot) || slot < 0 || slot > (reporter.role === "Admin" ? 10 : 2) || typeof payload.alwaysUse !== "boolean") return json({ error: "Ungültige Grundeinstellung." }, 400, origin);
      await ensureSettingsSlotsTable(env);
      if (slot) {
        const saved = await env.REPORTS.prepare("SELECT slot FROM settings_slots WHERE user_id = ? AND slot = ?").bind(reporter.id, slot).first();
        if (!saved) return json({ error: "Der gewählte Slot ist leer." }, 400, origin);
      }
      await env.REPORTS.prepare("INSERT INTO user_settings_preferences (user_id, selected_slot, always_use) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET selected_slot = excluded.selected_slot, always_use = excluded.always_use").bind(reporter.id, slot, payload.alwaysUse ? 1 : 0).run();
      return json({ ok: true }, 200, origin);
    }
    const settingsSlotMatch = url.pathname.match(/^\/settings\/slots\/(\d+)$/);
    if (settingsSlotMatch && request.method === "PUT") {
      const slot = Number(settingsSlotMatch[1]);
      if (slot < 1 || slot > (reporter.role === "Admin" ? 10 : 2)) return json({ error: "Ungültiger Slot." }, 400, origin);
      const payload = await request.json().catch(() => ({}));
      const title = String(payload.title || "").trim().slice(0, 100);
      const settings = sanitizeSnapshot(payload.settings);
      if (!title || !settings || !Object.keys(settings.ui).length && !Object.keys(settings.output).length) return json({ error: "Bezeichnung und Einstellungen fehlen." }, 400, origin);
      await ensureSettingsSlotsTable(env);
      await env.REPORTS.prepare("INSERT INTO settings_slots (user_id, slot, title, settings) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET title = excluded.title, settings = excluded.settings, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(reporter.id, slot, title, JSON.stringify(settings)).run();
      return json({ ok: true }, 200, origin);
    }
    if (settingsSlotMatch && request.method === "DELETE") {
      const slot = Number(settingsSlotMatch[1]);
      await ensureSettingsSlotsTable(env);
      await env.REPORTS.prepare("DELETE FROM settings_slots WHERE user_id = ? AND slot = ?").bind(reporter.id, slot).run();
      await env.REPORTS.prepare("UPDATE user_settings_preferences SET selected_slot = 0 WHERE user_id = ? AND selected_slot = ?").bind(reporter.id, slot).run();
      if (reporter.role === "Admin") {
        const selected = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'standard_settings_slot'").first();
        const selectedSlot = parseStandardSlot(selected?.value);
        if (selectedSlot.userId === reporter.id && selectedSlot.slot === slot) await env.REPORTS.prepare("DELETE FROM app_settings WHERE key = 'standard_settings_slot'").run();
      }
      return json({ ok: true }, 200, origin);
    }
    if (url.pathname === "/settings/slots/standard" && request.method === "PUT") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf den Standard festlegen." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const slot = Number(payload.slot);
      await ensureSettingsSlotsTable(env);
      const existing = Number.isInteger(slot) && slot >= 1 && slot <= 10 ? await env.REPORTS.prepare("SELECT slot FROM settings_slots WHERE user_id = ? AND slot = ?").bind(reporter.id, slot).first() : null;
      if (!existing) return json({ error: "Der gewählte Slot ist leer." }, 400, origin);
      await env.REPORTS.prepare("INSERT INTO app_settings (key, value) VALUES ('standard_settings_slot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").bind(JSON.stringify({ userId: reporter.id, slot })).run();
      return json({ ok: true, slot }, 200, origin);
    }

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
    if (url.pathname === "/settings/notification-interval" && request.method === "PATCH") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf das Prüfintervall einstellen." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const intervalMinutes = Number(payload.intervalMinutes) === 1 ? 1 : 30;
      await env.REPORTS.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))").run();
      await env.REPORTS.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('notification_interval_minutes', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(String(intervalMinutes)).run();
      return json({ ok: true, intervalMinutes }, 200, origin);
    }

    if (url.pathname === "/session" && request.method === "POST") return json({ ok: true, reporter: reporter.workName, personName: reporter.personName, workName: reporter.workName, role: reporter.role }, 200, origin);

    if (url.pathname === "/notifications/system" && request.method === "POST") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admins dürfen Systemnachrichten senden." }, 403, origin);
      const payload = await request.json().catch(() => ({}));
      const title = String(payload.title || "").trim().slice(0, 100);
      const body = String(payload.body || "").trim().slice(0, 1200);
      if (!title || !body) return json({ error: "Bitte Titel und Nachricht vollständig ausfüllen." }, 400, origin);
      await ensureSystemMessagesTable(env);
      const id = crypto.randomUUID();
      await env.REPORTS.prepare("INSERT INTO system_messages (id, title, body, created_by) VALUES (?, ?, ?, ?)").bind(id, title, body, reporter.workName).run();
      return json({ ok: true, id }, 201, origin);
    }

    if (url.pathname === "/projects" && request.method === "GET") {
      await ensureProjectsTable(env);
      const result = await env.REPORTS.prepare("SELECT id, slot, configuration, title, detail, poll_selection, settings, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, slot ASC LIMIT 5").bind(reporter.id).all();
      return json({ projects: (result.results || []).map(project => ({ ...project, poll_selection: parsePollSelection(project.poll_selection), settings: parseSnapshot(project.settings) })) }, 200, origin);
    }

    if (url.pathname === "/projects" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const configuration = String(payload.configuration || "").trim();
      const title = String(payload.title || "Sonntagsfragen").trim().slice(0, 100) || "Sonntagsfragen";
      const detail = String(payload.detail || "Aktuelle Konfiguration").trim().slice(0, 240) || "Aktuelle Konfiguration";
      const pollSelection = sanitizePollSelection(payload.pollSelection);
      const settings = sanitizeSnapshot(payload.settings);
      let slot = Number(payload.slot);
      if (!/^[0-9A-Za-z]{13,32}$/.test(configuration)) return json({ error: "Die Konfiguration ist nicht gültig." }, 400, origin);
      await ensureProjectsTable(env);
      if (payload.slot === undefined) {
        const existing = await env.REPORTS.prepare("SELECT id, slot FROM projects WHERE user_id = ? AND configuration = ?").bind(reporter.id, configuration).first();
        if (existing) {
          await env.REPORTS.prepare("UPDATE projects SET title = ?, detail = ?, poll_selection = ?, settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(title, detail, pollSelection ? JSON.stringify(pollSelection) : null, settings ? JSON.stringify(settings) : null, existing.id).run();
          return json({ ok: true, id: existing.id }, 200, origin);
        }
        const occupied = await env.REPORTS.prepare("SELECT slot FROM projects WHERE user_id = ?").bind(reporter.id).all();
        slot = [1, 2, 3, 4, 5].find(number => !(occupied.results || []).some(row => Number(row.slot) === number));
      }
      if (!Number.isInteger(slot) || slot < 1 || slot > 5) return json({ error: "Bitte einen gültigen Projektslot auswählen." }, 400, origin);
      try {
        const id = crypto.randomUUID();
        await env.REPORTS.prepare("INSERT INTO projects (id, user_id, slot, configuration, title, detail, poll_selection, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, reporter.id, slot, configuration, title, detail, pollSelection ? JSON.stringify(pollSelection) : null, settings ? JSON.stringify(settings) : null).run();
        return json({ ok: true, id }, 201, origin);
      } catch (error) { return json({ error: "Dieser Slot oder diese Konfiguration ist bereits belegt." }, 409, origin); }
    }

    const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "PATCH") {
      const payload = await request.json().catch(() => ({}));
      const configuration = String(payload.configuration || "").trim();
      const title = String(payload.title || "Unbenannt").trim().slice(0, 100) || "Unbenannt";
      const detail = String(payload.detail || "Aktuelle Konfiguration").trim().slice(0, 240) || "Aktuelle Konfiguration";
      const pollSelection = sanitizePollSelection(payload.pollSelection);
      const settings = sanitizeSnapshot(payload.settings);
      if (!/^[0-9A-Za-z]{13,32}$/.test(configuration)) return json({ error: "Die Konfiguration ist nicht gültig." }, 400, origin);
      await ensureProjectsTable(env);
      try {
        const result = await env.REPORTS.prepare("UPDATE projects SET configuration = ?, title = ?, detail = ?, poll_selection = ?, settings = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?").bind(configuration, title, detail, pollSelection ? JSON.stringify(pollSelection) : null, settings ? JSON.stringify(settings) : null, decodeURIComponent(projectMatch[1]), reporter.id).run();
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
      await ensureProjectsTable(env);
      const [result, projectResult] = await Promise.all([
        env.REPORTS.prepare("SELECT id, person_name, work_name, role, active, created_at FROM report_users ORDER BY created_at ASC").all(),
        env.REPORTS.prepare("SELECT id, user_id, slot, configuration, title, detail, poll_selection, settings, created_at, updated_at FROM projects ORDER BY updated_at DESC, created_at DESC, slot ASC").all()
      ]);
      const projectsByUser = new Map();
      (projectResult.results || []).forEach(project => {
        const projects = projectsByUser.get(project.user_id) || [];
        if (projects.length < 5) projects.push({ ...project, poll_selection: parsePollSelection(project.poll_selection), settings: parseSnapshot(project.settings) });
        projectsByUser.set(project.user_id, projects);
      });
      const stored = (result.results || []).map(user => ({ id: user.id, personName: user.person_name, workName: user.work_name, role: user.role, active: Boolean(user.active), system: false, projects: projectsByUser.get(user.id) || [] }));
      return json({ accounts: stored }, 200, origin);
    }

    const accountProjectsMatch = url.pathname.match(/^\/accounts\/([^/]+)\/projects$/);
    if (accountProjectsMatch && request.method === "GET") {
      if (reporter.role !== "Admin") return json({ error: "Nur Admin darf Projekte anderer Accounts ansehen." }, 403, origin);
      await ensureProjectsTable(env);
      const accountId = decodeURIComponent(accountProjectsMatch[1]);
      const account = await env.REPORTS.prepare("SELECT id FROM report_users WHERE id = ? LIMIT 1").bind(accountId).first();
      if (!account) return json({ error: "Account nicht gefunden." }, 404, origin);
      const result = await env.REPORTS.prepare("SELECT id, slot, configuration, title, detail, poll_selection, settings, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, slot ASC LIMIT 5").bind(accountId).all();
      return json({ projects: (result.results || []).map(project => ({ ...project, poll_selection: parsePollSelection(project.poll_selection), settings: parseSnapshot(project.settings) })) }, 200, origin);
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
      await ensureSettingsSlotsTable(env);
      await env.REPORTS.prepare("DELETE FROM user_settings_preferences WHERE user_id = ?").bind(accountId).run();
      await env.REPORTS.prepare("DELETE FROM settings_slots WHERE user_id = ?").bind(accountId).run();
      const selected = await env.REPORTS.prepare("SELECT value FROM app_settings WHERE key = 'standard_settings_slot'").first();
      if (parseStandardSlot(selected?.value).userId === accountId) await env.REPORTS.prepare("DELETE FROM app_settings WHERE key = 'standard_settings_slot'").run();
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
