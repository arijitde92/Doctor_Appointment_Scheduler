#!/usr/bin/env bash
# One-time (safe to re-run) Google Cloud setup for the two-service deployment:
#   - enables the APIs needed for source deploys
#   - creates the Cloud SQL database that stores ADK chat sessions
#   - stores backend secrets in Secret Manager
#   - creates the frontend service account (web-sa)
#
# Usage (from the repo root):  bash deploy/setup_gcp.sh
source "$(dirname "$0")/common.sh"

log "Enabling APIs in $PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com sqladmin.googleapis.com iam.googleapis.com --project "$PROJECT"

log "Creating Cloud SQL database '$SESSION_DB_NAME' on instance '$DB_INSTANCE' (ADK sessions)"
if gcloud sql databases describe "$SESSION_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT" >/dev/null 2>&1; then
  echo "Database already exists."
else
  gcloud sql databases create "$SESSION_DB_NAME" --instance "$DB_INSTANCE" --project "$PROJECT"
fi
echo "ADK creates its tables on first use. DB_USER (${DB_USER:-?}) needs privileges on '$SESSION_DB_NAME'."

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

log "Setup complete. Next: bash deploy/deploy_backend.sh"
