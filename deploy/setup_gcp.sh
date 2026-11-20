#!/usr/bin/env bash
# One-time (safe to re-run) Google Cloud setup for the two-service deployment:
#   - enables the APIs needed for source deploys
#   - creates the Cloud SQL databases for ADK chat sessions and for the app
#     (patient accounts, login sessions, consultation logs, appointments)
#   - stores backend secrets in Secret Manager
#   - creates the frontend service account (web-sa)
#   - lets the backend (agent-sa) write traces to Cloud Trace and metrics to
#     Cloud Monitoring (dashboard: bash deploy/setup_monitoring.sh)
#
# Usage (from the repo root):  bash deploy/setup_gcp.sh
source "$(dirname "$0")/common.sh"

log "Enabling APIs in $PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com sqladmin.googleapis.com iam.googleapis.com cloudtrace.googleapis.com \
  monitoring.googleapis.com telemetry.googleapis.com logging.googleapis.com \
  cloudresourcemanager.googleapis.com --project "$PROJECT"
# cloudresourcemanager: ADK's telemetry looks up the project number at startup
# (otherwise it logs a "Failed to look up the project's other identifier" warning).

log "Creating Cloud SQL database '$SESSION_DB_NAME' on instance '$DB_INSTANCE' (ADK sessions)"
if gcloud sql databases describe "$SESSION_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Database already exists."
else
  gcloud sql databases create "$SESSION_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT"
fi
echo "ADK creates its tables on first use. DB_USER (${DB_USER:-?}) needs privileges on '$SESSION_DB_NAME'."

log "Creating Cloud SQL database '$APP_DB_NAME' on instance '$DB_INSTANCE' (accounts, consultation logs, appointments)"
if gcloud sql databases describe "$APP_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Database already exists."
else
  gcloud sql databases create "$APP_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT" --charset utf8mb4
fi
echo "The backend creates its tables at startup. DB_USER (${DB_USER:-?}) needs privileges on '$APP_DB_NAME'."

upsert_secret() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "Skipping secret $name (value not set in .env)"
    return
  fi
  if gcloud secrets describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT" >/dev/null
    echo "Added a new version to secret $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project "$PROJECT" >/dev/null
    echo "Created secret $name"
  fi
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:$AGENT_SA" \
    --role roles/secretmanager.secretAccessor --project "$PROJECT" >/dev/null
}

log "Storing backend secrets in Secret Manager"
upsert_secret "$SECRET_DB_PASSWORD" "${DB_PASSWORD:-}"
upsert_secret "$SECRET_COMPOSIO_API_KEY" "${COMPOSIO_API_KEY:-}"
upsert_secret "$SECRET_MAPS_API_KEY" "${MAPS_API_KEY:-}"
upsert_secret "$SECRET_GEMINI_API_KEY" "${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}"

log "Creating frontend service account $WEB_SA"
if gcloud iam service-accounts describe "$WEB_SA" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Service account already exists."
else
  gcloud iam service-accounts create "$WEB_SA_NAME" --display-name "Doctor Appointment web frontend" --project "$PROJECT"
fi

log "Granting $AGENT_SA permission to write Cloud Trace spans and Cloud Monitoring metrics"
for role in roles/cloudtrace.agent roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$AGENT_SA" \
    --role "$role" --condition=None >/dev/null
done

log "Setup complete. Next: bash deploy/deploy_backend.sh"
