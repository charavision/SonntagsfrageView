# Geschütztes Meldungsbuch

Der Worker prüft die PIN außerhalb des öffentlichen Webseiten-Codes und speichert Einträge in Cloudflare D1.

## Einrichtung

1. Bei Cloudflare einen kostenlosen Account anlegen und Wrangler installieren.
2. `wrangler d1 create sonntagsfragen-reports` ausführen.
3. `wrangler.toml.example` als `wrangler.toml` kopieren und die ausgegebene Datenbank-ID eintragen.
4. `wrangler d1 execute sonntagsfragen-reports --remote --file=schema.sql` ausführen.
5. Die vorgesehenen Zugänge mit Anzeigename und SHA-256-Prüfwert in `reportUsers` eintragen.
6. Mit `wrangler deploy` veröffentlichen.
7. Die ausgegebene Worker-Adresse in `../report-config.js` als `window.REPORT_API_URL` eintragen.

Die PINs selbst dürfen weder in `report-config.js` noch in eine andere veröffentlichte Datei geschrieben werden.
