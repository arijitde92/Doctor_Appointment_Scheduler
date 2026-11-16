#!/usr/bin/env bash
# Build & deploy the PRIVATE backend API service (FastAPI + ADK) to Cloud Run.
# Chat sessions are stored in Cloud SQL over the Cloud SQL unix socket.
# Secrets come from Secret Manager (see setup_gcp.sh).
#
# Usage (from the repo root):  bash deploy/deploy_backend.sh
source "$(dirname "$0")/common.sh"

: "${TOOLBOX_URL:?Set TOOLBOX_URL in .env to the deployed Toolbox Cloud Run URL}"
: "${DB_USER:?Set DB_USER in .env}"
: "${COMPOSIO_USER_ID:?Set COMPOSIO_USER_ID in .env}"

# Non-secret runtime configuration -> YAML for --env-vars-file
# (Cloud Run expects YAML here, not the KEY=VALUE .env format.)
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT

yaml_kv() {
  local key="$1" value="${2:-}"
  [[ -z "$value" ]] && return 0
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s: "%s"\n' "$key" "$value" >> "$ENV_FILE"
}

yaml_kv GOOGLE_CLOUD_PROJECT "$PROJECT"
yaml_kv GOOGLE_CLOUD_LOCATION "${GOOGLE_CLOUD_LOCATION:-$REGION}"
yaml_kv GOOGLE_GENAI_USE_VERTEXAI "${GOOGLE_GENAI_USE_VERTEXAI:-true}"
yaml_kv REGION "$REGION"
yaml_kv TOOLBOX_URL "$TOOLBOX_URL"
yaml_kv GCS_REVIEWS_BUCKET_URI "${GCS_REVIEWS_BUCKET_URI:-}"
yaml_kv RAG_CORPUS_DISPLAY_NAME "${RAG_CORPUS_DISPLAY_NAME:-}"
yaml_kv RAG_CORPUS_RESOURCE_NAME "${RAG_CORPUS_RESOURCE_NAME:-}"
yaml_kv COMPOSIO_USER_ID "$COMPOSIO_USER_ID"
yaml_kv DB_USER "$DB_USER"
yaml_kv INSTANCE_CONNECTION_NAME "$INSTANCE_CONNECTION_NAME"
yaml_kv SESSION_DB_NAME "$SESSION_DB_NAME"
# Cloud Trace: on by default for the deployed backend. Message content stays
# out of spans unless ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=true in .env.
yaml_kv TRACE_TO_CLOUD "${TRACE_TO_CLOUD:-true}"
yaml_kv ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS "${ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS:-false}"
# Cloud Monitoring: ADK token-usage and latency metrics (on by default).
yaml_kv METRICS_TO_CLOUD "${METRICS_TO_CLOUD:-true}"

SECRETS="DB_PASSWORD=$SECRET_DB_PASSWORD:latest,COMPOSIO_API_KEY=$SECRET_COMPOSIO_API_KEY:latest,MAPS_API_KEY=$SECRET_MAPS_API_KEY:latest"
# Agents call Gemini through Google AI Studio unless GOOGLE_GENAI_USE_VERTEXAI
# is true. The RAG review tool always uses Vertex AI RAG Engine (via agent-sa).
if [[ "${GOOGLE_GENAI_USE_VERTEXAI:-true}" =~ ^([Ff]alse|0)$ ]]; then
  SECRETS="$SECRETS,GOOGLE_API_KEY=$SECRET_GEMINI_API_KEY:latest"
fi

log "Deploying $BACKEND_SERVICE to $PROJECT/$REGION (private; sessions in $INSTANCE_CONNECTION_NAME/$SESSION_DB_NAME)"
cd "$REPO_ROOT"
gcloud run deploy "$BACKEND_SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$AGENT_SA" \
  --no-allow-unauthenticated \
  --add-cloudsql-instances "$INSTANCE_CONNECTION_NAME" \
  --env-vars-file "$ENV_FILE" \
  --set-secrets "$SECRETS" \
  --timeout 3600 \
  --memory 1Gi \
  --cpu 1 \
  --cpu-boost \
  --min-instances 0 \
  --max-instances 5

URL="$(gcloud run services describe "$BACKEND_SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
log "Backend deployed: $URL (private; requires an ID token). Next: bash deploy/deploy_frontend.sh"
