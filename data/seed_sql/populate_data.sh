#!/bin/bash

# Ensure the script works regardless of where it is executed from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DB_INSTANCE="doctor-db"
DATABASE_NAME="doctor_data"

# 1. Setup a temporary GCS bucket
PROJECT_ID=$(gcloud config get-value project)
BUCKET_NAME="gs://doctor-agent-sql-seed-${PROJECT_ID}"

echo "Creating GCS bucket: ${BUCKET_NAME}..."
gcloud storage buckets create ${BUCKET_NAME} --location=asia-south1

# Cloud SQL needs explicit permission to read from your GCS bucket
SQL_SA=$(gcloud sql instances describe $DB_INSTANCE --format="value(serviceAccountEmailAddress)")
if [ -n "$SQL_SA" ]; then
    echo "Granting Cloud SQL service account ($SQL_SA) access to the bucket..."
    gcloud storage buckets add-iam-policy-binding $BUCKET_NAME \
        --member="serviceAccount:${SQL_SA}" \
        --role="roles/storage.objectAdmin"
fi

# 2. Upload the local SQL files to the bucket
echo "Uploading SQL files to ${BUCKET_NAME}..."
gcloud storage cp "${SCRIPT_DIR}/create_tables.sql" ${BUCKET_NAME}/
gcloud storage cp "${SCRIPT_DIR}/insert_clinics.sql" ${BUCKET_NAME}/
gcloud storage cp "${SCRIPT_DIR}/insert_doctors.sql" ${BUCKET_NAME}/
gcloud storage cp "${SCRIPT_DIR}/insert_doctor_clinic.sql" ${BUCKET_NAME}/
gcloud storage cp "${SCRIPT_DIR}/insert_availability.sql" ${BUCKET_NAME}/
gcloud storage cp "${SCRIPT_DIR}/create_indices.sql" ${BUCKET_NAME}/

# 3. Import the files into Cloud SQL from the bucket location
echo "Importing create_tables.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/create_tables.sql --database=$DATABASE_NAME --quiet

echo "Importing insert_clinics.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/insert_clinics.sql --database=$DATABASE_NAME --quiet

echo "Importing insert_doctors.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/insert_doctors.sql --database=$DATABASE_NAME --quiet

echo "Importing insert_doctor_clinic.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/insert_doctor_clinic.sql --database=$DATABASE_NAME --quiet

echo "Importing insert_availability.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/insert_availability.sql --database=$DATABASE_NAME --quiet

echo "Importing create_indices.sql..."
gcloud sql import sql $DB_INSTANCE ${BUCKET_NAME}/create_indices.sql --database=$DATABASE_NAME --quiet

echo "All SQL imports completed!"

# (Optional) Clean up temporary bucket
echo "Cleaning up temporary bucket ${BUCKET_NAME}..."
gcloud storage rm -r ${BUCKET_NAME}
