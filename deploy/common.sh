#!/usr/bin/env bash
# Shared configuration for the deploy scripts. Values come from the repo's .env
# (see Project_Steps.md) and can be overridden by exporting them first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT in .env}"
: "${REGION:?Set REGION in .env (Cloud Run + Cloud SQL region, e.g. asia-south1)}"

PROJECT="$GOOGLE_CLOUD_PROJECT"
BACKEND_SERVICE="${BACKEND_SERVICE:-doctor-appointment-api}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-doctor-appointment-web}"
DB_INSTANCE="${DB_INSTANCE:-doctor-db}"
SESSION_DB_NAME="${SESSION_DB_NAME:-adk_sessions}"
ADK_APP_NAME="${ADK_APP_NAME:-agents}"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-$PROJECT:$REGION:$DB_INSTANCE}"
AGENT_SA="${AGENT_SA:-agent-sa@$PROJECT.iam.gserviceaccount.com}"
WEB_SA_NAME="${WEB_SA_NAME:-web-sa}"
WEB_SA="$WEB_SA_NAME@$PROJECT.iam.gserviceaccount.com"

# Secret Manager secret names
SECRET_DB_PASSWORD="${SECRET_DB_PASSWORD:-db-password}"
SECRET_COMPOSIO_API_KEY="${SECRET_COMPOSIO_API_KEY:-composio-api-key}"
SECRET_MAPS_API_KEY="${SECRET_MAPS_API_KEY:-maps-api-key}"
# Google AI Studio (Gemini API) key, used when GOOGLE_GENAI_USE_VERTEXAI=false
SECRET_GEMINI_API_KEY="${SECRET_GEMINI_API_KEY:-gemini-api-key}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
