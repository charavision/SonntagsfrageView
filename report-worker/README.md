# Geschütztes Meldungsbuch

Der Worker prüft die PIN außerhalb des öffentlichen Webseiten-Codes und speichert Einträge in Cloudflare D1.

## Einrichtung

1. Bei Cloudflare einen kostenlosen Account anlegen und Wrangler installieren.
2. `wrangler d1 create sonntagsfragen-reports` ausführen.
3. `wrangler.toml.example` als `wrangler.toml` kopieren und die ausgegebene Datenbank-ID eintragen.
4. `wrangler d1 execute sonntagsfragen-reports --remote --file=schema.sql` ausführen.
5. Die vorgesehenen Zugänge mit Anzeigename und SHA-256-Prüfwert in `reportUsers` eintragen.
6. Im Verzeichnis `report-worker` die Abhängigkeiten mit `pnpm install --frozen-lockfile` installieren und mit `wrangler deploy` veröffentlichen.
7. Die ausgegebene Worker-Adresse in `../report-config.js` als `window.REPORT_API_URL` eintragen.

Die PINs selbst dürfen weder in `report-config.js` noch in eine andere veröffentlichte Datei geschrieben werden.

## Passkey für Sebastian

Nach der Veröffentlichung von Webseite und Worker auf `https://charavision.github.io/SonntagsfrageView/` zunächst mit Sebastians Admin-PIN anmelden. Unter „Accounts“ beim Account „Sebastian“ „Reset PIN“ öffnen und den Schlüssel-Button neben dem Eingabefeld anklicken. Dafür muss keine neue PIN eingegeben oder gespeichert werden. Der Passkey wird erst nach der Bestätigung auf dem eigenen Gerät gespeichert. Anschließend steht am Login „Mit Passkey anmelden“ zur Verfügung; die PIN bleibt als Rückweg erhalten. Auf der lokalen `file://`-Vorschau erklärt der Schlüssel-Button, dass Passkeys nur auf der veröffentlichten HTTPS-Seite eingerichtet werden können. Passkey-Tabellen werden vom Worker bei der ersten Anfrage angelegt; für neue Datenbanken sind sie zusätzlich in `schema.sql` enthalten.
