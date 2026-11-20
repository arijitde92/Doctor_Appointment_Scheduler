#!/usr/bin/env python3
"""
Check that clinic addresses resolve to a real, specific place on Google Maps.

Each address is sent to the Google Maps Grounding Lite MCP `search_places`
tool (the same endpoint the agents use, so it only needs MAPS_API_KEY).
An address passes when Maps returns a place that is
  * more specific than a city / postal code / administrative area, and
  * within --max-km of the clinic's city centre.
Street-level matches ("route") are reported as WARN: the street exists but
Maps could not pin the house number.

Input: a .csv (clinics_list.csv layout) or a .json list of objects with the
keys address, city, country (other keys are carried through to the report).

Usage:
    python validate_clinic_addresses.py clinics_list.csv
    python validate_clinic_addresses.py fragment.json --report report.json
    python validate_clinic_addresses.py clinics_list.csv --skip-country India

Exit code is 1 when any address FAILs.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

MCP_URL = "https://mapstools.googleapis.com/mcp"
REPO_ROOT = Path(__file__).resolve().parents[1]

# Wording Grounding Lite uses in its summary for matches that are too coarse.
COARSE_MARKERS = (
    "is a locality", "is a country", "administrative area", "is a postal code",
    "is a political", "is a city", "is a town", "is a neighborhood",
    "is a sublocality", "is a colloquial area", "is a region", "is a province",
    "is a state",
)
STREET_MARKERS = ("is a route", "is a street", "is a road")


def load_api_key() -> str:
    key = os.environ.get("MAPS_API_KEY")
    if not key:
        env = REPO_ROOT / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                if line.startswith("MAPS_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("MAPS_API_KEY is not set (env or repo .env)")
    return key


def search_place(query: str, key: str, retries: int = 5) -> dict:
    """Return {'places': [...], 'summary': str} for a text query."""
    body = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "search_places",
                   "arguments": {"text_query": query, "page_size": 1}},
    }).encode("utf-8")
    req = urllib.request.Request(MCP_URL, data=body, method="POST", headers={
        "X-Goog-Api-Key": key,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    })
    delay = 2.0
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if "result" in payload:
                sc = payload["result"].get("structuredContent") or {}
                return {"places": sc.get("places", []),
                        "summary": sc.get("summary") or ""}
            err = payload.get("error", {})
            if attempt == retries - 1:
                return {"places": [], "summary": "", "error": str(err)}
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == retries - 1:
                return {"places": [], "summary": "", "error": str(exc)}
        time.sleep(delay)
        delay *= 2
    return {"places": [], "summary": "", "error": "unreachable"}


def lookup(query: str, key: str, attempts: int = 4) -> dict:
    """search_place, retried when Maps returns nothing.

    Grounding Lite is not deterministic: a real address sometimes comes back
    empty, so an address only counts as unmatched after several empty answers.
    """
    result: dict = {"places": [], "summary": ""}
    for i in range(attempts):
        result = search_place(query, key)
        if result["places"]:
            return result
        time.sleep(1.5 * (i + 1))
    return result


def haversine_km(a: dict, b: dict) -> float:
    lat1, lon1 = math.radians(a["latitude"]), math.radians(a["longitude"])
    lat2, lon2 = math.radians(b["latitude"]), math.radians(b["longitude"])
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def load_rows(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def classify(row: dict, result: dict, centre: dict | None, max_km: float) -> dict:
    out = {k: row.get(k) for k in ("clinic_id", "clinic_name", "address", "city", "country")}
    if result.get("error"):
        return {**out, "status": "FAIL", "reason": f"search error: {result['error']}"}
    if not result["places"]:
        return {**out, "status": "FAIL", "reason": "no Google Maps match"}
    place = result["places"][0]
    summary = result["summary"]
    low = summary.lower()
    out["maps_title"] = place.get("attribution", {}).get("title", "").removesuffix(" - Google Maps")
    out["maps_summary"] = summary
    loc = place.get("location")
    if centre and loc:
        dist = haversine_km(centre, loc)
        out["km_from_city_centre"] = round(dist, 1)
        if dist > max_km:
            return {**out, "status": "FAIL",
                    "reason": f"match is {dist:.0f} km from {row['city']} centre"}
    if any(m in low for m in COARSE_MARKERS):
        return {**out, "status": "FAIL", "reason": "only matched an area, not an address"}
    if any(m in low for m in STREET_MARKERS):
        return {**out, "status": "WARN", "reason": "street found, house number not pinned"}
    return {**out, "status": "PASS", "reason": ""}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("input", type=Path)
    ap.add_argument("--report", type=Path, help="write the full JSON report here")
    ap.add_argument("--max-km", type=float, default=60.0)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--skip-country", action="append", default=[],
                    help="country to leave out (repeatable)")
    args = ap.parse_args()

    key = load_api_key()
    rows = [r for r in load_rows(args.input) if r.get("country") not in args.skip_country]

    cities = sorted({(r["city"], r["country"]) for r in rows})
    with ThreadPoolExecutor(args.workers) as pool:
        centres_raw = list(pool.map(lambda c: lookup(f"{c[0]}, {c[1]}", key), cities))
        centres = {c: (res["places"][0].get("location") if res["places"] else None)
                   for c, res in zip(cities, centres_raw)}
        results = list(pool.map(lambda r: lookup(r["address"], key), rows))

    report = [classify(r, res, centres.get((r["city"], r["country"])), args.max_km)
              for r, res in zip(rows, results)]

    counts = {s: sum(1 for x in report if x["status"] == s) for s in ("PASS", "WARN", "FAIL")}
    for x in report:
        if x["status"] != "PASS":
            print(f"{x['status']}: [{x['country']} / {x['city']}] {x['clinic_name']} :: "
                  f"{x['address']} -> {x['reason']}"
                  + (f" (maps: {x.get('maps_title')})" if x.get("maps_title") else ""))
    print(f"\nChecked {len(report)} addresses: {counts}")
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Report written to {args.report}")
    return 1 if counts["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
