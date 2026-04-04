-- =====================================
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