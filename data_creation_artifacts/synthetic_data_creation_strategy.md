# Synthetic Doctor Generation Strategy

We will generate synthetic data based on the following strategy:

## 🎯 Target
- **Clinics**: the 14 original Kolkata clinics plus **5 clinics in each of 4 cities/towns** for
  each of 43 countries (172 cities, 860 new clinics)
- **10 doctors** per (new) clinic, with some doctors shared across clinics in the same city
  - So each city of 5 clinics has ≈ **35–45 unique doctors**
- Clinic names are **fictitious**; clinic addresses are **real street addresses** that can be
  searched in Google Maps

### Countries and cities
| Region | Countries (4 cities/towns each) |
|--------|---------------------------------|
| Americas | USA, Canada, Mexico, Brazil, Argentina, Peru |
| Western Europe | UK, Ireland, France, Spain, Italy, Netherlands, Belgium, Luxembourg |
| Central & Northern Europe | Germany, Switzerland, Austria, Poland, Finland, Norway, Sweden, Denmark |
| Eastern Europe & East Asia | Ukraine, Russia, China, Japan, South Korea, Taiwan |
| South-East Asia & Oceania | Singapore, Malaysia, Philippines, Vietnam, Indonesia, Thailand, Australia, New Zealand |
| South Asia, Middle East & Africa | Bangladesh, Sri Lanka, Pakistan, South Africa, Egypt, UAE, Qatar |
| India (original) | Kolkata (14 clinics, kept as-is) |

- City values use English, unaccented spellings (`Zurich`, `Krakow`, `Sao Paulo`); the
  database collation (`utf8mb4_0900_ai_ci`) also matches the accented forms.
- Singapore is a city-state: its 20 clinics use city `Singapore`, spread across the towns
  Tampines, Jurong East, Woodlands and Ang Mo Kio (stored in `state_region`).

## ✅ Specializations (normalized)
Use exactly:
- General
- Psychology
- Pediatrics
- Gastroenterology
- Obstetrics and Gynecology (OB/GYN)
- Psychiatry
- Pulmonology
- Radiology
- Cardiology
- Pathology
- Neurology
- Orthopedic

## ✅ Gender Distribution
Balanced per city:
- 50% Male
- 50% Female

## ✅ Experience Distribution
Use realistic buckets:

| Level | Years |
|-------|-------|
| Junior| 1–5   |
| Mid   | 6–15  |
| Senior| 16–30 |

## ✅ Age Constraint
`age >= years_of_experience + 24` (age = experience + 24–35)

## ✅ Naming Strategy
Use names that are **common in the country of the doctor's clinic** (a doctor practises in a
single city, so in a single country).

- Name pools live in `name_pools.json`: per country, at least 30 common male given names,
  30 female given names and 30 family names, reflecting the country's main communities
  (e.g. Canada: English and French; Malaysia: Malay, Chinese and Indian; South Africa: Zulu,
  Xhosa, Afrikaans and English; Singapore: Chinese, Malay and Indian).
- In multi-ethnic countries (Malaysia, Singapore, South Africa, Sri Lanka, UAE, Qatar) the
  pool is split into weighted `communities`, and a doctor's given and family names always come
  from the same community, with that community's name order (`Tan Wei Ming`,
  `Ahmad bin Ismail`, `Thulani Dlamini`), never mixes like `Vignesh Lim`.
- Family names have a male and a female form where the language inflects them
  (Polish Kowalski / Kowalska, Russian Ivanov / Ivanova).
- Name order follows English usage in that country: family name first for China, Taiwan,
  Japan, South Korea and Vietnam (`Wang Wei`, `Kim Min-jun`), given name first elsewhere.
- Latin script only: native diacritics are kept for Latin-script languages (`José`, `Müller`,
  `Łukasz`); other scripts use the common English-press romanisation (`Dmitry`, `Oleksandr`,
  `Sato Haruto`).
- A full name is never repeated within a city.

**Examples:**

| Country | Male | Female |
|---------|------|--------|
| India (Kolkata) | Arindam Sen, Souvik Ghosh | Priyanka Roy, Ananya Banerjee |
| France | Thomas Martin | Camille Dubois |
| Poland | Piotr Kowalski | Anna Kowalska |
| Japan | Sato Haruto | Suzuki Yui |
| Egypt | Ahmed Hassan | Fatma Ibrahim |

## 🔷 Doctor–Clinic Assignment Logic

### 🎯 Requirement:
- 10 doctors per clinic
- Some doctors shared across clinics

### ✅ Strategy
For each city, clinic by clinic:
- **Pick** 10 different specializations for the clinic (specialization diversity: no
  specialization appears twice in one clinic).
- **Fill** each specialization slot with a new doctor, or (30% of the time) with a doctor of
  that specialization who already works at another clinic in the same city.
- **Ensure:** each clinic has exactly 10 doctors and each doctor works at 1–3 clinics, all in
  one city.

### ✅ Constraint Handling
While assigning:
- **Avoid:** same doctor duplicated in the same clinic
- **Avoid:** doctors commuting between cities
- **Ensure:** specialization diversity per clinic

### ✅ Original Kolkata data
The 14 Kolkata clinics, their 90 doctors, 209 mappings and 1,463 availability rows predate this
strategy (15 doctors per clinic; 7 doctors have no clinic) and are **frozen**: the generator
copies them unchanged so live IDs and their review files stay valid. New IDs continue after
them. `generate_data.py --regenerate-all` rebuilds Kolkata with these rules too.

## 🔷 Availability Generation

### ✅ Days
Monday → Sunday

### ✅ Slots
| Slot | Time |
|------|------|
| slot_1 | 10–11 |
| slot_2 | 11–12 |
| slot_3 | 12–1  |
| slot_4 | 1–2   |
| slot_5 | 2–3   |
| slot_6 | 3–4   |
| slot_7 | 4–5   |

Times are local to the clinic.

### ✅ Generation Logic
For each `(doctor_id, clinic_id, day)`, generate random availability.

**Example:**
*Dr X @ Apollo Clinic - Monday:*
- `slot_1 = TRUE`
- `slot_2 = FALSE`
- ...

### ✅ Constraints
- At least 2 slots per day
- Not all 7 slots
- Weekends: Slightly reduced availability (at most 5 slots instead of 6)
- A doctor who works at several clinics is never in two clinics in the same slot

## 🔷 Reviews Generation
- One file per doctor in `data/reviews/doctor_<id>_<Name>_reviews.txt`, uploaded to the GCS
  reviews bucket and imported into the Vertex AI RAG corpus.
- Sentences come from `review_bank.json`, a phrase bank written by a Claude Sonnet sub-agent
  (per-specialization and generic sentences in positive / mixed / negative tone).
- Each doctor has a hidden quality score; 8–12 reviews are rated around it, and each
  review's tone follows its rating.
- Each file starts with a header (doctor, ID, specialization, city, clinics) and every review
  heading repeats the doctor, specialization and city, so each RAG chunk names its doctor.

## 🔷 Data Volume Summary

| Table | Rows |
|-------|------|
| Clinic | 874 |
| Doctor | ~6,000–7,000 |
| DoctorClinic | ~8,800 |
| Availability | ~62,000 |
| Review files | one per doctor with a clinic |

## 🔷 Schema notes
`Clinic` has `state_region` and `country` columns; `pin_code` is `VARCHAR(20)` and is empty
for countries without postal codes (UAE, Qatar). All tables use `utf8mb4`.

## 🔷 Pipeline
1. `clinics_list.csv`: all clinics (`clinic_id, clinic_name, address, city, state_region,
   country, postal_code`); the address is one quoted CSV cell.
2. `validate_clinic_addresses.py clinics_list.csv`: every address must resolve to a specific
   place on Google Maps (Maps Grounding Lite `search_places`) within 60 km of its city.
3. `generate_data.py`: writes `data/seed_sql/*.sql` (seeded, reproducible).
4. `generate_doctor_reviews.py`: writes `data/reviews/*.txt`.
5. `data/seed_sql/populate_data.sh --reset`: reloads Cloud SQL; then upload reviews to GCS and
   import them into the RAG corpus.

## 🔷 MCP Query Design (VERY IMPORTANT)
Design queries aligned with agent usage.

### ✅ Query 1: Find Doctors by Specialization + City
```sql
SELECT d.*, c.*, dc.clinic_id
FROM Doctor d
JOIN DoctorClinic dc ON d.id = dc.doctor_id
JOIN Clinic c ON c.id = dc.clinic_id
WHERE d.specialization = ?
AND c.city = ?;
```

### ✅ Query 2: Get Availability
```sql
SELECT *
FROM Availability
WHERE doctor_id = ?
AND clinic_id = ?
AND day_of_week = ?;
```

### ✅ Query 3: Get Clinics of Doctor
```sql
SELECT c.*
FROM Clinic c
JOIN DoctorClinic dc ON c.id = dc.clinic_id
WHERE dc.doctor_id = ?;
```

## 🔷 Data Validation Checklist
Before moving to Phase 4:

- [ ] **Clinics**: 874 inserted; ≥ 5 per city; every new address resolves on Google Maps
- [ ] **Doctors**: specialization valid, gender balanced, experience realistic, names match the country
- [ ] **Mapping**: each new clinic has exactly 10 doctors with 10 different specializations
- [ ] **Availability**: no empty schedules, no double-booked doctors, realistic distribution
- [ ] **Reviews**: one file per doctor in GCS and in the RAG corpus
