# Sonntagsfragen – Bund & Länder

Interaktive GitHub-Pages-Seite für aktuelle Bundestags- und Landtagsumfragen. Die Daten stammen von [Wahlrecht.de](https://www.wahlrecht.de/umfragen/) und werden täglich durch eine GitHub Action aktualisiert.

## Funktionen

- Bundestag und alle 16 Landesparlamente
- neun auswählbare Kategorien: CDU/CSU, SPD, GRÜNE, FDP, LINKE, AfD, BSW, FW und Sonstige
- 1 bis 160 Umfragen im gruppierten Balkendiagramm
- horizontal wachsende Darstellung für lange Zeitreihen
- responsive Bedienung und Detailwerte per Maus oder Touch

## Veröffentlichung

Im GitHub-Repository unter **Settings → Pages → Source** einmalig **GitHub Actions** auswählen. Danach aktualisiert und veröffentlicht der Workflow die Seite täglich automatisch. Ein manueller Lauf ist unter **Actions → Daten aktualisieren und Pages veröffentlichen → Run workflow** möglich.

## Lokal ansehen

```bash
python -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Für eine lokale Datenaktualisierung zuerst `pip install -r requirements.txt` und danach `python scripts/update_data.py` ausführen.

## Datenhinweis

Die Seite übernimmt veröffentlichte Umfragewerte automatisiert. Maßgeblich bleiben die Originaltabellen auf Wahlrecht.de. Bei Änderungen an deren HTML-Struktur kann eine Anpassung des Imports nötig werden.
