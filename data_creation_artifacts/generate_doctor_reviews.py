#!/usr/bin/env python3
"""
Generate fictitious patient-review .txt files, one per doctor, from the seed SQL.

Sentences come from review_bank.json (written by a Claude Sonnet sub-agent:
per-specialization and generic patient-voice sentences in positive / mixed /
negative tone, with {doctor} {S} {s} {o} {P} {p} {clinic} {city} placeholders).

Each doctor gets a hidden "quality" score; review ratings scatter around it and
the tone of each sentence follows its rating, so doctors differ in a way the
RAG agent can pick up. Every review heading repeats the doctor's name,
specialization and city so that each retrieved chunk is self-describing.

Doctors in frozen cities (default: Kolkata, see generate_data.py) keep their
existing review files untouched. Files for doctors that no longer exist are
removed. Output is deterministic for a given seed SQL.

Usage:
    python generate_doctor_reviews.py                # write data/reviews/
    python generate_doctor_reviews.py --regenerate-all
"""
from __future__ import annotations

import argparse
import json
import random
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from generate_data import DEFAULT_FROZEN_CITIES, OUTPUT_DIR as SQL_DIR, parse_sql_tuples

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BANK_PATH = HERE / "review_bank.json"
OUT_DIR = ROOT / "data" / "reviews"
SEED = 20261116

PRONOUNS = {
    "Male": {"S": "He", "s": "he", "o": "him", "P": "His", "p": "his"},
    "Female": {"S": "She", "s": "she", "o": "her", "P": "Her", "p": "her"},
}


def slug_name(name: str) -> str:
    """ASCII file-name slug: 'José Müller' -> 'Jose_Muller'."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", ascii_name).strip("_") or "doctor"


def review_filename(doc_id: int, name: str) -> str:
    return f"doctor_{doc_id}_{slug_name(name)}_reviews.txt"


def load_catalog() -> tuple[list[dict], dict[int, list[dict]]]:
    clinics = {r[0]: {"id": r[0], "name": r[1], "city": r[3], "country": r[5]}
               for r in parse_sql_tuples(SQL_DIR / "insert_clinics.sql")}
    by_doctor: dict[int, list[dict]] = defaultdict(list)
    for _, doc_id, clinic_id in parse_sql_tuples(SQL_DIR / "insert_doctor_clinic.sql"):
        by_doctor[doc_id].append(clinics[clinic_id])
    doctors = [dict(zip(["id", "name", "gender", "age", "experience", "specialization"], r))
               for r in parse_sql_tuples(SQL_DIR / "insert_doctors.sql")]
    return doctors, by_doctor


def tone_for(rating: int) -> str:
    if rating >= 8:
        return "positive"
    if rating >= 5:
        return "mixed"
    return "negative"


def build_reviews(doc: dict, clinics: list[dict], bank: dict) -> list[tuple[int, str, str]]:
    """Return [(rating, clinic_name, text)] for one doctor."""
    rng = random.Random(f"{SEED}:{doc['id']}:{doc['name']}")
    spec_bank = bank["specializations"][doc["specialization"]]
    quality = min(9.6, max(4.0, rng.gauss(7.6, 1.1)))
    used: set[str] = set()

    def pick(pool: list[str]) -> str | None:
        options = [s for s in pool if s not in used]
        if not options:
            return None
        choice = rng.choice(options)
        used.add(choice)
        return choice

    reviews = []
    for _ in range(rng.randint(8, 12)):
        rating = int(round(min(10, max(1, rng.gauss(quality, 1.3)))))
        tone = tone_for(rating)
        clinic = rng.choice(clinics)
        first_pool = spec_bank[tone] if rng.random() < 0.6 else bank["generic"][tone]
        parts = [pick(first_pool) or pick(bank["generic"][tone]) or pick(spec_bank[tone])]
        if rng.random() < 0.55:
            parts.append(pick(bank["generic"][tone] if parts[0] in spec_bank[tone] else spec_bank[tone]))
        if rng.random() < 0.3:
            parts.append(pick(bank["closers"][tone]))
        values = {"doctor": f"Dr. {doc['name']}", "clinic": clinic["name"], "city": clinic["city"],
                  **PRONOUNS[doc["gender"]]}
        text = " ".join(p.format(**values) for p in parts if p)
        reviews.append((rating, clinic["name"], text))
    return reviews


def render(doc: dict, clinics: list[dict], reviews: list[tuple[int, str, str]]) -> str:
    city = clinics[0]["city"]
    country = clinics[0]["country"]
    label = f"Dr. {doc['name']}, {doc['specialization']}, {city}"
    lines = [
        f"Doctor: Dr. {doc['name']}",
        f"Doctor ID: {doc['id']}",
        f"Specialization: {doc['specialization']}",
        f"Gender: {doc['gender']}",
        f"Years of experience: {doc['experience']}",
        f"City: {city}, {country}",
        "Clinics: " + "; ".join(f"{c['name']} (clinic ID {c['id']})" for c in clinics),
        "",
    ]
    for i, (rating, clinic_name, text) in enumerate(reviews, start=1):
        lines += [f"Review {i} for {label}", f"Rating: {rating}/10",
                  f"Clinic visited: {clinic_name}", f"Description: {text}", ""]
    avg = sum(r for r, _, _ in reviews) / len(reviews)
    lines.append(f"Overall rating for {label}: {avg:.2f}/10 from {len(reviews)} reviews")
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--regenerate-all", action="store_true",
                    help="also rewrite review files of doctors in frozen cities")
    args = ap.parse_args()
    frozen_cities = [] if args.regenerate_all else DEFAULT_FROZEN_CITIES

    bank = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    doctors, by_doctor = load_catalog()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = {p.name for p in OUT_DIR.glob("doctor_*_reviews.txt")}

    expected, written, kept, skipped = set(), 0, 0, []
    for doc in doctors:
        clinics = by_doctor.get(doc["id"], [])
        fname = review_filename(doc["id"], doc["name"])
        frozen = not clinics or any(c["city"] in frozen_cities for c in clinics)
        if frozen and fname in existing:
            expected.add(fname)
            kept += 1
            continue
        if not clinics:
            skipped.append(doc["id"])       # no clinic -> no city to write about
            continue
        reviews = build_reviews(doc, clinics, bank)
        (OUT_DIR / fname).write_text(render(doc, clinics, reviews), encoding="utf-8", newline="\n")
        expected.add(fname)
        written += 1

    stale = sorted(existing - expected)
    for name in stale:
        (OUT_DIR / name).unlink()

    print(f"Wrote {written} review files, kept {kept} frozen files, removed {len(stale)} stale files "
          f"in {OUT_DIR}")
    if skipped:
        print(f"Skipped doctors without a clinic and without an existing file: {skipped}")


if __name__ == "__main__":
    main()
