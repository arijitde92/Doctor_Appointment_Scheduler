"""
This script generates synthetic data for a Doctor Appointment Scheduler system.
It creates realistic datasets for clinics, doctors, their professional relationships, 
and their weekly availability slots across different locations.

Expected Outputs:
- insert_clinics.sql: SQL commands to populate the Clinic table.
- insert_doctors.sql: SQL commands to populate the Doctor table.
- insert_doctor_clinic.sql: SQL commands to map doctors to clinics.
- insert_availability.sql: SQL commands to define time slots for doctors at specific clinics.
"""

# -------------------------------
# IMPORTS
# -------------------------------
import os
import random
import uuid

OUTPUT_DIR = "data/seed_sql"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# -------------------------------
# CONFIG
# -------------------------------
NUM_DOCTORS = 90
DOCTORS_PER_CLINIC = 10

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
    "Orthopedic"
]

MALE_NAMES = [
    "Arindam Sen", "Souvik Ghosh", "Anirban Chatterjee",
    "Arijit De", "Debasish Dutta", "Subhajit Roy",
    "Kaushik Pal", "Indranil Saha", "Abhishek Mukherjee"
]

FEMALE_NAMES = [
    "Priyanka Roy", "Debjani Mukherjee", "Ananya Banerjee",
    "Swastika Ghosh", "Riya Sen", "Moumita Das",
    "Sohini Chatterjee", "Ishita Das", "Taniya Dutta"
]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

CLINICS = [
    (1, "Apex Clinic", "1219, Sammilani Park Rd, near Big Bazaar-KOLKATA-HILAND PARK-THE METROPOLIS, Hiland Park, Survey Park, Santoshpur, Kolkata, West Bengal 700099", "700099"),
    (2, "Manipal Clinic", "C.I.T Scheme, Gariahat Rd, Dhakuria, LXXII Block A, P-4 & 5, Kolkata, West Bengal 700029", "700029"),
    (3, "Apollo Clinic", "56, Leela, Jamini Roy Sarani, Dover Terrace, Ballygunge, Kolkata, West Bengal 700019", "700019"),
    (4, "CRMS Clinic", "294, Mahatma Gandhi Rd, Jiban Mohini Ghosh Park, Paschim Putiary, Kolkata, West Bengal 700082", "700082"),
    (5, "Belle Vue Clinic", "9, Formerly, Sir UN Brahmachari Sarani, Kolkata, West Bengal 700017", "700017"),
    (6, "NRS Clinic", "138, Acharya Jagdish Chandra Bose Rd, Sealdah, Raja Bazar, Kolkata, West Bengal 700014", "700014"),
    (7, "ILS Clinic", "DD 6, Salt Lake Bypass, DD Block, Sector 1, Bidhannagar, Kolkata, West Bengal 700064", "700064"),
    (8, "Midland Clinic", "13A, Mohendra Bose Ln, Mahendra Colony, Bidhan Sarani, Baghbazar, Kolkata, West Bengal 700003", "700003"),
    (9, "Ohio Clinic", "Service Road, Plot No. DG-6, Street Number 358, Kolkata, West Bengal 700156", "700156"),
    (10, "Aastha Clinic", "Unit 238, PS Abacus, Action Area II, Newtown, Kolkata, New Town, West Bengal 700161", "700161"),
    (11, "Atreya Clinic", "25(1012), 5 NO.KHALISHAKOTA PALLY, Khalisha Kota, Birati, Kolkata, West Bengal 700051", "700051"),
    (12, "Lifeline Clinic", "237/1, Surya Sen Rd, Satin Sen Nagar, more, New Barrakpur, Kolkata, West Bengal 700131", "700131"),
    (13, "Sagar Clinic", "MRI SERVICE AND EMERGENCY WARD, Graham Rd, Kamarhati, Kolkata, West Bengal 700058", "700058"),
    (14, "INK Clinic", "185, Acharya Jagdish Chandra Bose Rd, Elgin, Kolkata, West Bengal 700017", "700017"),
]

# -------------------------------
# HELPERS
# -------------------------------

def random_gender():
    return random.choice(["Male", "Female"])

def random_name(gender):
    if gender == "Male":
        return random.choice(MALE_NAMES)
    return random.choice(FEMALE_NAMES)

def random_experience():
    bucket = random.choice(["junior", "mid", "senior"])
    if bucket == "junior":
        return random.randint(1, 5)
    elif bucket == "mid":
        return random.randint(6, 15)
    else:
        return random.randint(16, 30)

def random_age(exp):
    return exp + random.randint(24, 35)

def generate_slots(day):
    # weekends less availability
    max_slots = 5 if day in ["Saturday", "Sunday"] else 6

    num_slots = random.randint(2, max_slots)
    slots = [0] * 7
    selected = random.sample(range(7), num_slots)

    for idx in selected:
        slots[idx] = 1

    return slots

# -------------------------------
# GENERATE DOCTORS
# -------------------------------

doctors = []
for i in range(1, NUM_DOCTORS + 1):
    gender = random_gender()
    exp = random_experience()

    doctor = {
        "id": i,
        "name": random_name(gender),
        "gender": gender,
        "age": random_age(exp),
        "experience": exp,
        "specialization": random.choice(SPECIALIZATIONS)
    }
    doctors.append(doctor)

# -------------------------------
# ASSIGN DOCTORS TO CLINICS
# -------------------------------

doctor_clinic_map = []
clinic_doctors = {c[0]: set() for c in CLINICS}

# ensure each clinic gets 10 doctors
all_doctor_ids = [d["id"] for d in doctors]

for clinic_id, _, _, _ in CLINICS:
    assigned = random.sample(all_doctor_ids, DOCTORS_PER_CLINIC)
    for doc_id in assigned:
        clinic_doctors[clinic_id].add(doc_id)

# allow doctors to appear in 1–3 clinics
for doc in doctors:
    extra = random.randint(0, 2)
    extra_clinics = random.sample(CLINICS, extra)

    for c in extra_clinics:
        clinic_doctors[c[0]].add(doc["id"])

# build mapping table
mapping_id = 1
for clinic_id, docs in clinic_doctors.items():
    for doc_id in docs:
        doctor_clinic_map.append((mapping_id, doc_id, clinic_id))
        mapping_id += 1

# -------------------------------
# GENERATE AVAILABILITY
# -------------------------------

availability = []
avail_id = 1

for (_, doc_id, clinic_id) in doctor_clinic_map:
    for day in DAYS:
        slots = generate_slots(day)

        availability.append((
            avail_id,
            doc_id,
            clinic_id,
            day,
            *slots
        ))
        avail_id += 1

# -------------------------------
# WRITE SQL FILES
# -------------------------------

def write_create_tables():
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
    pin_code VARCHAR(10) NOT NULL
);

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
);

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
);

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
);
"""
    with open(os.path.join(OUTPUT_DIR, "create_tables.sql"), "w") as f:
        f.write(CREATE_TABLES_SQL)

def write_create_indices():
    CREATE_INDICES_SQL = """-- Doctor search
CREATE INDEX idx_doctor_specialization ON Doctor(specialization);

-- Clinic filtering
CREATE INDEX idx_clinic_city ON Clinic(city);

-- Mapping joins
CREATE INDEX idx_dc_doctor ON DoctorClinic(doctor_id);
CREATE INDEX idx_dc_clinic ON DoctorClinic(clinic_id);

-- Availability queries
CREATE INDEX idx_av_doc_clinic_day 
ON Availability(doctor_id, clinic_id, day_of_week);
"""
    with open(os.path.join(OUTPUT_DIR, "create_indices.sql"), "w") as f:
        f.write(CREATE_INDICES_SQL)

def write_clinics():
    with open(os.path.join(OUTPUT_DIR, "insert_clinics.sql"), "w") as f:
        f.write("INSERT INTO Clinic (id, name, address, city, pin_code) VALUES\n")
        rows = []
        for c in CLINICS:
            rows.append(f"({c[0]}, '{c[1]}', '{c[2]}', 'Kolkata', '{c[3]}')")
        f.write(",\n".join(rows) + ";\n")

def write_doctors():
    with open(os.path.join(OUTPUT_DIR, "insert_doctors.sql"), "w") as f:
        f.write("INSERT INTO Doctor (id, name, gender, age, years_of_experience, specialization) VALUES\n")
        rows = []
        for d in doctors:
            rows.append(
                f"({d['id']}, '{d['name']}', '{d['gender']}', {d['age']}, {d['experience']}, '{d['specialization']}')"
            )
        f.write(",\n".join(rows) + ";\n")

def write_mapping():
    with open(os.path.join(OUTPUT_DIR, "insert_doctor_clinic.sql"), "w") as f:
        f.write("INSERT INTO DoctorClinic (id, doctor_id, clinic_id) VALUES\n")
        rows = [f"({m[0]}, {m[1]}, {m[2]})" for m in doctor_clinic_map]
        f.write(",\n".join(rows) + ";\n")

def write_availability():
    with open(os.path.join(OUTPUT_DIR, "insert_availability.sql"), "w") as f:
        f.write("""INSERT INTO Availability 
(id, doctor_id, clinic_id, day_of_week,
slot_1, slot_2, slot_3, slot_4, slot_5, slot_6, slot_7)
VALUES\n""")
        rows = []
        for a in availability:
            rows.append(
                f"({a[0]}, {a[1]}, {a[2]}, '{a[3]}', {a[4]}, {a[5]}, {a[6]}, {a[7]}, {a[8]}, {a[9]}, {a[10]})"
            )
        f.write(",\n".join(rows) + ";\n")

# -------------------------------
# RUN
# -------------------------------

if __name__ == "__main__":
    write_create_tables()
    write_clinics()
    write_doctors()
    write_mapping()
    write_availability()
    write_create_indices()
    print(f"✅ SQL files generated successfully in '{OUTPUT_DIR}'.")