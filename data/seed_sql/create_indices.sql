-- Doctor search
CREATE INDEX idx_doctor_specialization ON Doctor(specialization);

-- Clinic filtering
CREATE INDEX idx_clinic_city ON Clinic(city);

-- Mapping joins
CREATE INDEX idx_dc_doctor ON DoctorClinic(doctor_id);
CREATE INDEX idx_dc_clinic ON DoctorClinic(clinic_id);

-- Availability queries
CREATE INDEX idx_av_doc_clinic_day 
ON Availability(doctor_id, clinic_id, day_of_week);