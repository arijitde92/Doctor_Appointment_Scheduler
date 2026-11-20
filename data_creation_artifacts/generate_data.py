"""
Generate synthetic seed data for the Doctor Appointment Scheduler.

Inputs (next to this script):
- clinics_list.csv   clinic_id, clinic_name, address, city, state_region, country,
                     postal_code, time_zone (IANA name, e.g. Europe/Paris)
- name_pools.json    common given/family names per country (see synthetic_data_creation_strategy.md)

Outputs:
- data/seed_sql/: drop_tables.sql, create_tables.sql, create_indices.sql,
  insert_clinics.sql, insert_doctors.sql, insert_doctor_clinic.sql, insert_availability.sql
- frontend/src/config/cities.ts: the city picker's list (city, country, time zone)

Rules (from synthetic_data_creation_strategy.md):
- every clinic gets exactly DOCTORS_PER_CLINIC doctors, all with different specializations
- a doctor works at 1-3 clinics, always within one city
- gender is balanced per city; age >= years_of_experience + 24
- 2-6 one-hour slots per weekday (2-5 at weekends), never all 7, and a doctor's
  slots never overlap across clinics on the same day

Frozen cities (default: Kolkata) keep the rows that are already in data/seed_sql
unchanged, so live IDs and their review files stay valid. Every other city is
generated from a per-city seed, so re-running the script reproduces the same data.
Pass --regenerate-all to rebuild frozen cities too.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
from collections import defaultdict
from pathlib import Path

# -------------------------------
# PATHS & CONFIG
# -------------------------------
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
CLINICS_CSV = HERE / "clinics_list.csv"
NAME_POOLS_JSON = HERE / "name_pools.json"
OUTPUT_DIR = REPO_ROOT / "data" / "seed_sql"
FRONTEND_CITIES_TS = REPO_ROOT / "frontend" / "src" / "config" / "cities.ts"

SEED = 20261116
DEFAULT_FROZEN_CITIES = ["Kolkata"]
DOCTORS_PER_CLINIC = 10
MAX_CLINICS_PER_DOCTOR = 3
SHARE_PROBABILITY = 0.3          # chance a slot is filled by a doctor already in the city
ROWS_PER_INSERT = 1000           # rows per INSERT statement

SPECIALIZATIONS = [
    "General",
    "Psychology",
    "Pediatrics",
    "Gastroenterology",
    "Obstetrics and Gynecology (OB/GYN)",
    "Psychiatry",
    "Pulmonology",
    "Radiology",
    "Cardiology",
    "Pathology",
    "Neurology",
    "Orthopedic",
]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NUM_SLOTS = 7                    # slot_1 = 10-11 ... slot_7 = 16-17


# -------------------------------
# SQL HELPERS
# -------------------------------
def sql_str(value: str) -> str:
    """Quote a string literal for MySQL."""
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def parse_sql_tuples(path: Path) -> list[list]:
    """Parse the value tuples of INSERT statements written by this script.

    Handles quoted strings ('' and backslash escapes, parentheses inside
    strings) and bare numbers. Returns [] if the file does not exist.
    """
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    rows: list[list] = []
    i, n = 0, len(text)
    in_values = False
    while i < n:
        if not in_values:
            m = re.compile(r"VALUES", re.I).search(text, i)
            if not m:
                break
            i, in_values = m.end(), True
            continue
        ch = text[i]
        if ch == "(":
            row, i = [], i + 1
            while True:
                while text[i] in " \n\r\t,":
                    i += 1
                if text[i] == ")":
                    i += 1
                    break
                if text[i] == "'":
                    buf, i = [], i + 1
                    while True:
                        c = text[i]
                        if c == "\\":
                            buf.append(text[i + 1]); i += 2
                        elif c == "'" and text[i + 1:i + 2] == "'":
                            buf.append("'"); i += 2
                        elif c == "'":
                            i += 1; break
                        else:
                            buf.append(c); i += 1
                    row.append("".join(buf))
                else:
                    m = re.compile(r"[^,)\s]+").match(text, i)
                    tok = m.group(0)
                    row.append(int(tok) if re.fullmatch(r"-?\d+", tok) else tok)
                    i = m.end()
            rows.append(row)
        elif ch == ";":
            in_values, i = False, i + 1
        else:
            i += 1
    return rows


def write_inserts(path: Path, table: str, columns: list[str], rows: list[str]) -> None:
    """Write rows as batched INSERT statements."""
    header = f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n"
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("SET NAMES utf8mb4;\n")
        for start in range(0, len(rows), ROWS_PER_INSERT):
            f.write(header + ",\n".join(rows[start:start + ROWS_PER_INSERT]) + ";\n")


# -------------------------------
# INPUTS
# -------------------------------
def load_clinics() -> list[dict]:
    with CLINICS_CSV.open(encoding="utf-8", newline="") as f:
        clinics = [
            {
                "id": int(r["clinic_id"]),
                "name": r["clinic_name"].strip(),
                "address": r["address"].strip(),
                "city": r["city"].strip(),
                "state_region": r["state_region"].strip(),
                "country": r["country"].strip(),
                "postal_code": r["postal_code"].strip(),
                "time_zone": r["time_zone"].strip(),
            }
            for r in csv.DictReader(f)
        ]
    ids = [c["id"] for c in clinics]
    assert len(ids) == len(set(ids)), "duplicate clinic_id in clinics_list.csv"
    check_time_zones(clinics)
    return clinics


def check_time_zones(clinics: list[dict]) -> None:
    """Every clinic needs an IANA zone, and a city has a single zone."""
    by_city: dict[tuple[str, str], set[str]] = defaultdict(set)
    for c in clinics:
        assert c["time_zone"], f"clinic {c['id']} has no time_zone"
        by_city[(c["country"], c["city"])].add(c["time_zone"])
    split = {k: v for k, v in by_city.items() if len(v) > 1}
    assert not split, f"cities with more than one time zone: {split}"
    try:
        import zoneinfo
        zones = {z for v in by_city.values() for z in v}
        bad = sorted(z for z in zones if not _zone_exists(zoneinfo, z))
        assert not bad, f"unknown IANA time zones: {bad}"
    except ImportError:
        pass


def _zone_exists(zoneinfo, name: str) -> bool:
    try:
        zoneinfo.ZoneInfo(name)
        return True
    except zoneinfo.ZoneInfoNotFoundError:
        # No tz database here (Windows without the tzdata package): don't block.
        return not zoneinfo.available_timezones()


def load_name_pools() -> dict:
    pools = json.loads(NAME_POOLS_JSON.read_text(encoding="utf-8"))
    for country, p in pools.items():
        for sub in p.get("communities", [p]):
            assert len(sub["family_male"]) == len(sub["family_female"]), \
                f"{country}: family lists differ in length"
    return pools


# -------------------------------
# GENERATION
# -------------------------------
def random_experience(rng: random.Random) -> int:
    bucket = rng.choice(["junior", "mid", "senior"])
    if bucket == "junior":
        return rng.randint(1, 5)
    if bucket == "mid":
        return rng.randint(6, 15)
    return rng.randint(16, 30)


def make_name(rng: random.Random, pool: dict, gender: str, taken: set[str]) -> str:
    """Build a name unique within the city.

    A pool is either flat (given/family lists + name_order) or, for
    multi-ethnic countries, {"communities": [{"weight": w, <flat pool>}, ...]}
    so given and family names always come from the same community.
    """
    given_key = "male_given" if gender == "Male" else "female_given"
    family_key = "family_male" if gender == "Male" else "family_female"
    communities = pool.get("communities")
    for _ in range(200):
        if communities:
            pool = rng.choices(communities, weights=[c["weight"] for c in communities])[0]
        given = rng.choice(pool[given_key])
        family = pool[family_key][rng.randrange(len(pool[family_key]))]
        name = f"{family} {given}" if pool.get("name_order") == "family_first" else f"{given} {family}"
        if name not in taken:
            taken.add(name)
            return name
    raise RuntimeError("name pool too small for this city")


def staff_city(city_clinics: list[dict], rng: random.Random) -> tuple[list[dict], list[tuple[int, int]]]:
    """Return (doctors, [(doctor_key, clinic_id)]) for one city.

    Each clinic gets DOCTORS_PER_CLINIC distinct specializations; each slot is
    either a new doctor or (sometimes) a same-specialization doctor already
    working elsewhere in the city.
    """
    doctors: list[dict] = []               # {"key", "specialization", "clinics": [...]}
    by_spec: dict[str, list[dict]] = defaultdict(list)
    for clinic in city_clinics:
        for spec in rng.sample(SPECIALIZATIONS, DOCTORS_PER_CLINIC):
            candidates = [d for d in by_spec[spec]
                          if len(d["clinics"]) < MAX_CLINICS_PER_DOCTOR]
            if candidates and rng.random() < SHARE_PROBABILITY:
                doc = rng.choice(candidates)
            else:
                doc = {"key": len(doctors), "specialization": spec, "clinics": []}
                doctors.append(doc)
                by_spec[spec].append(doc)
            doc["clinics"].append(clinic["id"])
    return doctors, [(d["key"], cid) for d in doctors for cid in d["clinics"]]


def day_slots(rng: random.Random, day: str, n_clinics: int) -> list[list[int]]:
    """Disjoint slot vectors (one per clinic) for one doctor on one day."""
    max_slots = 5 if day in ("Saturday", "Sunday") else 6
    free = list(range(NUM_SLOTS))
    rng.shuffle(free)
    vectors = []
    for i in range(n_clinics):
        reserve = 2 * (n_clinics - i - 1)             # keep 2 slots for each remaining clinic
        upper = min(max_slots, len(free) - reserve, NUM_SLOTS - 1)
        k = rng.randint(2, upper)
        take, free = free[:k], free[k:]
        vec = [0] * NUM_SLOTS
        for idx in take:
            vec[idx] = 1
        vectors.append(vec)
    return vectors


def load_frozen(frozen_clinic_ids: set[int]) -> tuple[list, list, list]:
    """Existing doctor / mapping / availability rows of frozen clinics.

    Existing doctors without any clinic mapping (the original Kolkata generator
    left a few unassigned) are kept too, so the frozen rows stay identical.
    """
    all_mappings = parse_sql_tuples(OUTPUT_DIR / "insert_doctor_clinic.sql")
    mappings = [r for r in all_mappings if r[2] in frozen_clinic_ids]
    all_doctors = parse_sql_tuples(OUTPUT_DIR / "insert_doctors.sql")
    orphan_ids = {r[0] for r in all_doctors} - {r[1] for r in all_mappings}
    doctor_ids = {r[1] for r in mappings} | orphan_ids
    doctors = [r for r in all_doctors if r[0] in doctor_ids]
    avail = [r for r in parse_sql_tuples(OUTPUT_DIR / "insert_availability.sql")
             if r[2] in frozen_clinic_ids]
    return doctors, mappings, avail


def generate(frozen_cities: list[str]) -> dict:
    clinics = load_clinics()
    pools = load_name_pools()

    frozen_ids = {c["id"] for c in clinics if c["city"] in frozen_cities}
    f_doctors, f_mappings, f_avail = load_frozen(frozen_ids)
    if frozen_ids and not f_mappings:
        print(f"No existing rows for frozen cities {frozen_cities}; generating them.")
        frozen_ids = set()

    doctors = [dict(zip(["id", "name", "gender", "age", "experience", "specialization"], r))
               for r in f_doctors]
    mappings = [tuple(r) for r in f_mappings]
    availability = [tuple(r) for r in f_avail]
    next_doc = max((d["id"] for d in doctors), default=0) + 1
    next_map = max((m[0] for m in mappings), default=0) + 1
    next_av = max((a[0] for a in availability), default=0) + 1

    # group the remaining clinics by city, in CSV order
    cities: dict[tuple[str, str], list[dict]] = {}
    for c in clinics:
        if c["id"] not in frozen_ids:
            cities.setdefault((c["country"], c["city"]), []).append(c)

    for (country, city), city_clinics in cities.items():
        if country not in pools:
            raise SystemExit(f"name_pools.json has no entry for {country}")
        rng = random.Random(f"{SEED}:{country}:{city}")
        staff, pairs = staff_city(city_clinics, rng)

        genders = ["Male", "Female"] * (len(staff) // 2 + 1)
        genders = genders[:len(staff)]
        rng.shuffle(genders)
        taken: set[str] = set()
        key_to_id = {}
        for doc, gender in zip(staff, genders):
            exp = random_experience(rng)
            doctors.append({
                "id": next_doc,
                "name": make_name(rng, pools[country], gender, taken),
                "gender": gender,
                "age": exp + rng.randint(24, 35),
                "experience": exp,
                "specialization": doc["specialization"],
            })
            key_to_id[doc["key"]] = next_doc
            next_doc += 1

        for key, cid in pairs:
            mappings.append((next_map, key_to_id[key], cid))
            next_map += 1

        for doc in staff:
            for day in DAYS:
                for cid, vec in zip(doc["clinics"], day_slots(rng, day, len(doc["clinics"]))):
                    availability.append((next_av, key_to_id[doc["key"]], cid, day, *vec))
                    next_av += 1

    return {"clinics": clinics, "doctors": doctors, "mappings": mappings,
            "availability": availability, "frozen_doctor_ids": {r[0] for r in f_doctors}}


# -------------------------------
# SCHEMA
# -------------------------------
DROP_TABLES_SQL = """-- Drops the doctor_data tables (children first) so a full reload starts clean.
DROP TABLE IF EXISTS Availability;
DROP TABLE IF EXISTS DoctorClinic;
DROP TABLE IF EXISTS Doctor;
DROP TABLE IF EXISTS Clinic;
"""

CREATE_TABLES_SQL = """-- =====================================
-- DATABASE: doctor_data
-- =====================================

-- -----------------------------
-- TABLE: Clinic
-- -----------------------------
CREATE TABLE IF NOT EXISTS Clinic (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state_region VARCHAR(100) NOT NULL DEFAULT '',
    country VARCHAR(100) NOT NULL,
    pin_code VARCHAR(20) NOT NULL DEFAULT '',
    time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC'   -- IANA name; slot times are clinic-local
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------
-- TABLE: Doctor
-- -----------------------------
CREATE TABLE IF NOT EXISTS Doctor (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    gender ENUM('Male', 'Female') NOT NULL,
    age INT NOT NULL,
    years_of_experience INT NOT NULL,
    specialization VARCHAR(100) NOT NULL,

    CONSTRAINT chk_age_experience
        CHECK (age >= years_of_experience + 24)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------
-- TABLE: DoctorClinic (Mapping)
-- -----------------------------
CREATE TABLE IF NOT EXISTS DoctorClinic (
    id INT PRIMARY KEY,
    doctor_id INT NOT NULL,
    clinic_id INT NOT NULL,

    CONSTRAINT fk_dc_doctor
        FOREIGN KEY (doctor_id) REFERENCES Doctor(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dc_clinic
        FOREIGN KEY (clinic_id) REFERENCES Clinic(id)
        ON DELETE CASCADE,

    CONSTRAINT unique_doctor_clinic UNIQUE (doctor_id, clinic_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------
-- TABLE: Availability
-- -----------------------------
CREATE TABLE IF NOT EXISTS Availability (
    id INT PRIMARY KEY,
    doctor_id INT NOT NULL,
    clinic_id INT NOT NULL,
    day_of_week ENUM(
        'Monday','Tuesday','Wednesday',
        'Thursday','Friday','Saturday','Sunday'
    ) NOT NULL,

    slot_1 BOOLEAN DEFAULT FALSE,
    slot_2 BOOLEAN DEFAULT FALSE,
    slot_3 BOOLEAN DEFAULT FALSE,
    slot_4 BOOLEAN DEFAULT FALSE,
    slot_5 BOOLEAN DEFAULT FALSE,
    slot_6 BOOLEAN DEFAULT FALSE,
    slot_7 BOOLEAN DEFAULT FALSE,

    CONSTRAINT fk_av_doctor
        FOREIGN KEY (doctor_id) REFERENCES Doctor(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_av_clinic
        FOREIGN KEY (clinic_id) REFERENCES Clinic(id)
        ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
"""

CREATE_INDICES_SQL = """-- Doctor search
CREATE INDEX idx_doctor_specialization ON Doctor(specialization);

-- Clinic filtering
CREATE INDEX idx_clinic_city ON Clinic(city);
CREATE INDEX idx_clinic_country ON Clinic(country);

-- Mapping joins
CREATE INDEX idx_dc_doctor ON DoctorClinic(doctor_id);
CREATE INDEX idx_dc_clinic ON DoctorClinic(clinic_id);

-- Availability queries
CREATE INDEX idx_av_doc_clinic_day
ON Availability(doctor_id, clinic_id, day_of_week);
"""


# -------------------------------
# WRITE SQL FILES
# -------------------------------
def write_all(data: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "drop_tables.sql").write_text(DROP_TABLES_SQL, encoding="utf-8", newline="\n")
    (OUTPUT_DIR / "create_tables.sql").write_text(CREATE_TABLES_SQL, encoding="utf-8", newline="\n")
    (OUTPUT_DIR / "create_indices.sql").write_text(CREATE_INDICES_SQL, encoding="utf-8", newline="\n")

    write_inserts(
        OUTPUT_DIR / "insert_clinics.sql", "Clinic",
        ["id", "name", "address", "city", "state_region", "country", "pin_code", "time_zone"],
        [f"({c['id']}, {sql_str(c['name'])}, {sql_str(c['address'])}, {sql_str(c['city'])}, "
         f"{sql_str(c['state_region'])}, {sql_str(c['country'])}, {sql_str(c['postal_code'])}, "
         f"{sql_str(c['time_zone'])})"
         for c in data["clinics"]],
    )
    write_inserts(
        OUTPUT_DIR / "insert_doctors.sql", "Doctor",
        ["id", "name", "gender", "age", "years_of_experience", "specialization"],
        [f"({d['id']}, {sql_str(d['name'])}, {sql_str(d['gender'])}, {d['age']}, "
         f"{d['experience']}, {sql_str(d['specialization'])})"
         for d in data["doctors"]],
    )
    write_inserts(
        OUTPUT_DIR / "insert_doctor_clinic.sql", "DoctorClinic",
        ["id", "doctor_id", "clinic_id"],
        [f"({m[0]}, {m[1]}, {m[2]})" for m in data["mappings"]],
    )
    write_inserts(
        OUTPUT_DIR / "insert_availability.sql", "Availability",
        ["id", "doctor_id", "clinic_id", "day_of_week",
         "slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6", "slot_7"],
        [f"({a[0]}, {a[1]}, {a[2]}, {sql_str(a[3])}, " + ", ".join(str(int(v)) for v in a[4:]) + ")"
         for a in data["availability"]],
    )


def write_city_catalog(clinics: list[dict]) -> None:
    """frontend/src/config/cities.ts: one entry per city, grouped by country."""
    cities: dict[tuple[str, str], dict] = {}
    for c in clinics:
        entry = cities.setdefault((c["country"], c["city"]),
                                  {"city": c["city"], "country": c["country"],
                                   "timeZone": c["time_zone"], "clinics": 0})
        entry["clinics"] += 1
    rows = sorted(cities.values(), key=lambda e: (e["country"].lower(), e["city"].lower()))
    lines = [
        "// GENERATED by data_creation_artifacts/generate_data.py from clinics_list.csv.",
        "// Do not edit by hand: change the CSV and re-run the generator.",
        "",
        "export interface CityInfo {",
        "  /** Exactly as stored in Clinic.city (the find-doctors query matches it). */",
        "  city: string;",
        "  country: string;",
        "  /** IANA time zone; slot times are local to the clinic. */",
        "  timeZone: string;",
        "  clinics: number;",
        "}",
        "",
        "export const CITY_CATALOG: readonly CityInfo[] = [",
        *[f"  {json.dumps(r, ensure_ascii=False)}," for r in rows],
        "];",
        "",
    ]
    FRONTEND_CITIES_TS.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_CITIES_TS.write_text("\n".join(lines), encoding="utf-8", newline="\n")


# -------------------------------
# VALIDATION
# -------------------------------
def validate(data: dict, frozen_cities: list[str]) -> None:
    clinic_by_id = {c["id"]: c for c in data["clinics"]}
    doc_by_id = {d["id"]: d for d in data["doctors"]}
    per_clinic: dict[int, list[int]] = defaultdict(list)
    per_doctor: dict[int, list[int]] = defaultdict(list)
    for _, did, cid in data["mappings"]:
        assert did in doc_by_id and cid in clinic_by_id, "mapping references a missing row"
        per_clinic[cid].append(did)
        per_doctor[did].append(cid)

    for cid, c in clinic_by_id.items():
        docs = per_clinic[cid]
        assert len(docs) == len(set(docs)), f"clinic {cid} lists a doctor twice"
        if c["city"] in frozen_cities:
            continue
        assert len(docs) == DOCTORS_PER_CLINIC, f"clinic {cid} has {len(docs)} doctors"
        specs = [doc_by_id[d]["specialization"] for d in docs]
        assert len(set(specs)) == DOCTORS_PER_CLINIC, f"clinic {cid} repeats a specialization"

    for did, d in doc_by_id.items():
        assert d["specialization"] in SPECIALIZATIONS, f"doctor {did}: bad specialization"
        assert d["age"] >= d["experience"] + 24, f"doctor {did}: age/experience"
        if did in data["frozen_doctor_ids"]:
            continue
        assert per_doctor[did], f"doctor {did} has no clinic"
        cities = {(clinic_by_id[c]["country"], clinic_by_id[c]["city"]) for c in per_doctor[did]}
        if not any(city in frozen_cities for _, city in cities):
            assert len(cities) == 1, f"doctor {did} spans cities"
            assert len(per_doctor[did]) <= MAX_CLINICS_PER_DOCTOR

    busy: dict[tuple[int, str], list[int]] = defaultdict(lambda: [0] * NUM_SLOTS)
    for a in data["availability"]:
        slots = [int(v) for v in a[4:]]
        assert 2 <= sum(slots) < NUM_SLOTS, f"availability {a[0]} has {sum(slots)} slots"
        if clinic_by_id[a[2]]["city"] in frozen_cities:
            continue
        b = busy[(a[1], a[3])]
        for i, v in enumerate(slots):
            b[i] += v
            assert b[i] <= 1, f"doctor {a[1]} double-booked on {a[3]}"
    expected_av = sum(len(DAYS) for _ in data["mappings"])
    assert len(data["availability"]) == expected_av, "availability rows != mappings x 7"


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate seed SQL for the doctor_data database.")
    ap.add_argument("--freeze-city", action="append", dest="frozen",
                    help=f"keep existing rows for this city (default: {DEFAULT_FROZEN_CITIES})")
    ap.add_argument("--regenerate-all", action="store_true",
                    help="ignore existing rows and generate every city")
    args = ap.parse_args()
    frozen = [] if args.regenerate_all else (args.frozen or DEFAULT_FROZEN_CITIES)

    data = generate(frozen)
    validate(data, frozen)
    write_all(data)
    write_city_catalog(data["clinics"])

    males = sum(d["gender"] == "Male" for d in data["doctors"])
    print(f"Clinics: {len(data['clinics'])} in {len({(c['country'], c['city']) for c in data['clinics']})} cities, "
          f"{len({c['country'] for c in data['clinics']})} countries")
    print(f"Doctors: {len(data['doctors'])} ({males} male / {len(data['doctors']) - males} female)")
    print(f"DoctorClinic: {len(data['mappings'])}  Availability: {len(data['availability'])}")
    print(f"Frozen cities: {frozen or 'none'}")
    print(f"SQL files written to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
