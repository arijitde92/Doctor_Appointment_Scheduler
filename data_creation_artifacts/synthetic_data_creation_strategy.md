# Synthetic Doctor Generation Strategy

We will generate synthetic data based on the following strategy:

## 🎯 Target
- **10 doctors** per clinic
- **Total logical assignments** = 140
  - *Note:* Some doctors appear in multiple clinics
  - So actual doctor count ≈ **80–100 unique doctors**

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
Balanced:
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
`age >= years_of_experience + 24`

## ✅ Naming Strategy
Use realistic Indian names.

**Male Examples:**
- Arindam Sen
- Souvik Ghosh
- Anirban Chatterjee

**Female Examples:**
- Priyanka Roy
- Debjani Mukherjee
- Ananya Banerjee

## 🔷 Doctor–Clinic Assignment Logic

### 🎯 Requirement:
- 10 doctors per clinic
- Some doctors shared across clinics

### ✅ Strategy
- **Create:** 80 unique doctors
- **Assign:** Each doctor → 1–3 clinics
- **Ensure:** Each clinic has exactly 10 doctors

### ✅ Constraint Handling
While assigning:
- **Avoid:** same doctor duplicated in the same clinic
- **Ensure:** specialization diversity per clinic

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
- Weekends: Slightly reduced availability

## 🔷 Data Volume Summary

| Table | Rows |
|-------|------|
| Doctor| ~80–100 |
| Clinic| 14 |
| DoctorClinic | ~140 |
| Availability | ~1000–2000 |

## 🔷 MCP Query Design (VERY IMPORTANT)
Design queries aligned with agent usage.

### ✅ Query 1: Find Doctors by Specialization + City
```sql
SELECT d.*, c.*, dc.clinic_id
FROM Doctor d
JOIN DoctorClinic dc ON d.id = dc.doctor_id
JOIN Clinic c ON c.id = dc.clinic_id
WHERE d.specialization = ?
AND c.city = 'Kolkata';
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

- [ ] **Clinics**: 14 inserted correctly
- [ ] **Doctors**: specialization valid, gender balanced, experience realistic
- [ ] **Mapping**: each clinic has exactly 10 doctors
- [ ] **Availability**: no empty schedules, realistic distribution