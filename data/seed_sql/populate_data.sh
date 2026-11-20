#!/bin/bash
# Load the seed SQL in this folder into the Cloud SQL database `doctor_data`.
#
#   ./populate_data.sh           first load into an empty database
#   ./populate_data.sh --reset   export a backup, drop the four tables, reload everything
#
# Project, region and instance come from the repo's .env (via deploy/common.sh).
# The SQL files are staged in gs://doctor-agent-sql-seed-<project>, which is kept
# afterwards because it also holds the backups.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../deploy/common.sh
source "${SCRIPT_DIR}/../../deploy/common.sh"

DATABASE_NAME="doctor_data"
BUCKET_NAME="gs://doctor-agent-sql-seed-${PROJECT}"
RESET=false
[[ "${1:-}" == "--reset" ]] && RESET=true

FILES=(create_tables.sql insert_clinics.sql insert_doctors.sql
       insert_doctor_clinic.sql insert_availability.sql create_indices.sql)
$RESET && FILES=(drop_tables.sql "${FILES[@]}")

# 1. Staging bucket that the Cloud SQL service account can read and write
if ! gcloud storage buckets describe "$BUCKET_NAME" --project "$PROJECT" >/dev/null 2>&1; then
  log "Creating GCS bucket ${BUCKET_NAME}"
  gcloud storage buckets create "$BUCKET_NAME" --project "$PROJECT" --location "$REGION" \
    --uniform-bucket-level-access
fi
SQL_SA=$(gcloud sql instances describe "$DB_INSTANCE" --project "$PROJECT" \
  --format="value(serviceAccountEmailAddress)")
log "Granting ${SQL_SA} access to ${BUCKET_NAME}"
gcloud storage buckets add-iam-policy-binding "$BUCKET_NAME" --project "$PROJECT" \
  --member="serviceAccount:${SQL_SA}" --role="roles/storage.objectAdmin" >/dev/null

# 2. Backup before a reset (automated backups are off on this instance)
if $RESET; then
  BACKUP="${BUCKET_NAME}/backups/${DATABASE_NAME}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  log "Exporting current ${DATABASE_NAME} to ${BACKUP}"
  gcloud sql export sql "$DB_INSTANCE" "$BACKUP" --database="$DATABASE_NAME" \
    --project "$PROJECT" --quiet
fi

# 3. Upload, then import in dependency order
log "Uploading SQL files"
for f in "${FILES[@]}"; do
  gcloud storage cp "${SCRIPT_DIR}/${f}" "${BUCKET_NAME}/seed/${f}" --project "$PROJECT" --quiet
done

for f in "${FILES[@]}"; do
  log "Importing ${f}"
  gcloud sql import sql "$DB_INSTANCE" "${BUCKET_NAME}/seed/${f}" \
    --database="$DATABASE_NAME" --project "$PROJECT" --quiet
done

log "All SQL imports completed"
