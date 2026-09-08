#!/usr/bin/env python3
"""Collect polling rows from Wahlrecht.de and write a normalized JSON dataset."""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "polls.json"
BASE = "https://www.wahlrecht.de/umfragen/"
LAND_INDEX = urljoin(BASE, "landtage/")
PARTIES = ["CDU/CSU", "SPD", "GRÜNE", "FDP", "LINKE", "AfD", "BSW", "FW", "Sonstige"]
ALIASES = {
    "CDU": "CDU/CSU", "CSU": "CDU/CSU", "CDU/CSU": "CDU/CSU", "SPD": "SPD",
    "GRÜNE": "GRÜNE", "GRUENE": "GRÜNE", "FDP": "FDP", "LINKE": "LINKE",
    "DIE LINKE": "LINKE", "AFD": "AfD", "BSW": "BSW", "FW": "FW",
    "FREIE WÄHLER": "FW", "SONSTIGE": "Sonstige"
}
HEADERS = {"User-Agent": "SonntagsfragenDashboard/1.0 (+GitHub Pages; data source attribution included)"}
STATE_NAMES = {
    "baden-wuerttemberg": "Baden-Württemberg", "bayern": "Bayern", "berlin": "Berlin",
    "brandenburg": "Brandenburg", "bremen": "Bremen", "hamburg": "Hamburg", "hessen": "Hessen",
    "mecklenburg-vorpommern": "Mecklenburg-Vorpommern", "niedersachsen": "Niedersachsen",
    "nordrhein-westfalen": "Nordrhein-Westfalen", "rheinland-pfalz": "Rheinland-Pfalz",
    "saarland": "Saarland", "sachsen": "Sachsen", "sachsen-anhalt": "Sachsen-Anhalt",
    "schleswig-holstein": "Schleswig-Holstein", "thueringen": "Thüringen"
}
REPRESENTED_EXCEPTIONS = {"Sachsen": {"LINKE"}}

def fetch(url: str) -> BeautifulSoup:
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    response.encoding = response.apparent_encoding
    time.sleep(0.15)
    return BeautifulSoup(response.text, "html.parser")

def clean(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())

def number(text: str) -> float:
    match = re.search(r"\d+(?:[,.]\d+)?", clean(text))
    return float(match.group(0).replace(",", ".")) if match else 0.0

def iso_date(text: str) -> str | None:
    match = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", clean(text))
    if not match:
        return None
    day, month, year = map(int, match.groups())
    if year < 100:
        year += 2000
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None

def election_label_date(text: str) -> str | None:
    numeric = iso_date(text)
    if numeric:
        return numeric
    months = {"januar": 1, "februar": 2, "märz": 3, "april": 4, "mai": 5, "juni": 6,
              "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12}
    match = re.search(r"(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})", clean(text))
    if not match or match.group(2).lower() not in months:
        return None
    return date(int(match.group(3)), months[match.group(2).lower()], int(match.group(1))).isoformat()

def normalize_party(text: str) -> str | None:
    key = re.sub(r"\s*/\s*", "/", clean(text)).upper().replace("Ü", "UE")
    for candidate, normalized in ALIASES.items():
        if key == candidate.upper().replace("Ü", "UE"):
            return normalized
    return None

def party_headers(table) -> list[str | None]:
    for row in table.select("thead tr"):
        cells = row.find_all(["th", "td"])
        mapped = [normalize_party(c.get_text(" ", strip=True)) for c in cells]
        if sum(x is not None for x in mapped) >= 5:
            return mapped
    return []

def extract_row_table(url: str) -> list[dict]:
    soup = fetch(url)
    table = soup.select_one("table.wilko")
    if not table:
        return []
    headers = party_headers(table)
    results = []
    for row in table.select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if not cells or len(cells) != len(headers):
            continue
        texts = [clean(c.get_text(" ", strip=True)) for c in cells]
        poll_date = next((iso_date(t) for t in texts[:5] if iso_date(t)), None)
        if not poll_date or not any(normalize_party(c.get_text(" ", strip=True)) for c in table.select("thead th")):
            continue
        first_cell_is_date = iso_date(texts[0]) is not None
        page_title = clean(soup.select_one("h1").get_text(" ", strip=True)) if soup.select_one("h1") else ""
        institute = re.sub(r"^Umfragen\s+", "", page_title) if first_cell_is_date else texts[0]
        if not institute or "wahl" in institute.lower() or institute.lower() in {"institut", "veröffentl."}:
            continue
        values = {party: 0.0 for party in PARTIES}
        for idx, party in enumerate(headers):
            if party and idx < len(texts):
                values[party] = number(texts[idx])
        other_index = next((i for i, p in enumerate(headers) if p == "Sonstige"), None)
        if other_index is not None:
            other_text = texts[other_index]
            fw = re.search(r"(?:FW|Freie Wähler)\s*(\d+(?:[,.]\d+)?)", other_text, re.I)
            bsw = re.search(r"BSW\s*(\d+(?:[,.]\d+)?)", other_text, re.I)
            embedded_fw = 0.0
            embedded_bsw = 0.0
            if fw:
                embedded_fw = float(fw.group(1).replace(",", "."))
                values["FW"] = embedded_fw
            if bsw:
                embedded_bsw = float(bsw.group(1).replace(",", "."))
                values["BSW"] = embedded_bsw
            nums = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[,.]\d+)?", other_text)]
            values["Sonstige"] = max(0.0, sum(nums) - embedded_fw - embedded_bsw)
        client = "" if first_cell_is_date else (texts[1] if len(texts) > 1 else "")
        results.append({"date": poll_date, "institute": institute, "client": client, "values": values, "source": url})
    return results

def extract_election_result(url: str) -> dict:
    """Read the latest election-result row embedded in a Wahlrecht polling table."""
    soup = fetch(url)
    table = soup.select_one("table.wilko")
    if not table:
        return {"date": None, "values": {party: 0.0 for party in PARTIES}}
    headers = []
    for header_row in table.select("thead tr"):
        candidate = []
        recognized = 0
        for cell in header_row.find_all(["th", "td"], recursive=False):
            party = normalize_party(cell.get_text(" ", strip=True))
            recognized += party is not None
            candidate.extend([party] * int(cell.get("colspan", 1)))
        if recognized >= 5:
            headers = candidate
            break
    for row in table.select("tr"):
        text = clean(row.get_text(" ", strip=True))
        if not re.search(r"(?:Bundestags|Landtags|Abgeordnetenhaus|Bürgerschafts)wahl", text, re.I):
            continue
        texts = []
        for cell in row.find_all(["th", "td"], recursive=False):
            value_text = clean(cell.get_text(" ", strip=True))
            texts.extend([value_text] * int(cell.get("colspan", 1)))
        values = {party: 0.0 for party in PARTIES}
        for index, party in enumerate(headers):
            if party and index < len(texts):
                values[party] = number(texts[index])
        return {"date": next((iso_date(t) for t in texts if iso_date(t)), None), "values": values}
    return {"date": None, "values": {party: 0.0 for party in PARTIES}}

def discover_state_urls() -> dict[str, str]:
    soup = fetch(LAND_INDEX)
    found = {}
    for link in soup.select("table.wilko a[href]"):
        href = link.get("href", "")
        slug = Path(href).stem
        if slug in STATE_NAMES:
            found[STATE_NAMES[slug]] = urljoin(LAND_INDEX, href)
    for slug, name in STATE_NAMES.items():
        found.setdefault(name, urljoin(LAND_INDEX, f"{slug}.htm"))
    return found

def extract_next_elections() -> dict[str, str]:
    soup = fetch(LAND_INDEX)
    elections = {"Bundestag": "Termin noch offen (voraussichtlich 2029)"}
    table = soup.select_one("table.wilko")
    if not table:
        return elections
    for row in table.select("tbody tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) < 2:
            continue
        link = cells[0].select_one("a[href]")
        slug = Path(link.get("href", "")).stem if link else ""
        region = STATE_NAMES.get(slug, clean(cells[0].get_text(" ", strip=True)))
        if region not in STATE_NAMES.values():
            continue
        label = clean(cells[1].get_text(" ", strip=True))
        election_date = election_label_date(label)
        if election_date and election_date <= date.today().isoformat():
            label = f"voraussichtlich {int(election_date[:4]) + 5}"
        elections[region] = label
    return elections

def extract_bundestag() -> list[dict]:
    soup = fetch(BASE)
    links = []
    for link in soup.select("table.wilko thead a[href]"):
        href = link.get("href", "")
        if href.endswith(".htm") and href not in links:
            links.append(href)
    rows = []
    for href in links:
        try:
            rows.extend(extract_row_table(urljoin(BASE, href)))
        except Exception as exc:
            print(f"Warnung: {href}: {exc}", file=sys.stderr)
    unique = {}
    for row in rows:
        key = (row["date"], row["institute"], tuple(row["values"].values()))
        unique[key] = row
    return sorted(unique.values(), key=lambda r: r["date"], reverse=True)[:500]

def main() -> None:
    polls = {"Bundestag": extract_bundestag()}
    state_urls = discover_state_urls()
    elections = {}
    # Every Bundestag institute page contains the same latest federal election row.
    elections["Bundestag"] = extract_election_result(urljoin(BASE, "forsa.htm"))
    for state_name, url in state_urls.items():
        try:
            polls[state_name] = extract_row_table(url)[:500]
            elections[state_name] = extract_election_result(url)
        except Exception as exc:
            print(f"Warnung: {state_name}: {exc}", file=sys.stderr)
            polls[state_name] = []
            elections[state_name] = {"date": None, "values": {party: 0.0 for party in PARTIES}}
    regions = ["Bundestag", *STATE_NAMES.values()]
    compact_polls = {
        region: [
            [row["date"], row["institute"], row["client"], [row["values"][party] for party in PARTIES]]
            for row in rows
        ]
        for region, rows in polls.items()
    }
    compact_elections = {
        region: [
            elections[region]["date"],
            [elections[region]["values"][party] for party in PARTIES],
            [party for party in PARTIES if elections[region]["values"][party] >= 5 or party in REPRESENTED_EXCEPTIONS.get(region, set())]
        ]
        for region in regions
    }
    payload = {"updated": date.today().isoformat(), "regions": regions, "parties": PARTIES, "polls": compact_polls, "elections": compact_elections, "nextElections": extract_next_elections()}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    total = sum(len(v) for v in polls.values())
    if total < 17:
        raise RuntimeError(f"Zu wenige Datensätze erkannt: {total}")
    print(f"{total} Umfragen in {len(polls)} Gebieten gespeichert.")

if __name__ == "__main__":
    main()
