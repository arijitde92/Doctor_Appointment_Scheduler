#!/usr/bin/env bash
# Build & deploy the PUBLIC frontend service (React build + Express BFF) and
# allow its service account to call the private backend (roles/run.invoker).
#
# Usage (from the repo root):  bash deploy/deploy_frontend.sh
source "$(dirname "$0")/common.sh"

BACKEND_URL="$(gcloud run services describe "$BACKEND_SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
if [[ -z "$BACKEND_URL" ]]; then
  echo "Backend service $BACKEND_SERVICE not found. Run deploy/deploy_backend.sh first." >&2
  exit 1
fi

log "Granting $WEB_SA permission to invoke $BACKEND_SERVICE"
gcloud run services add-iam-policy-binding "$BACKEND_SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --member "serviceAccount:$WEB_SA" --role roles/run.invoker >/dev/null

log "Deploying $FRONTEND_SERVICE (public) -> $BACKEND_URL"
cd "$REPO_ROOT/frontend"
gcloud run deploy "$FRONTEND_SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$WEB_SA" \
  --allow-unauthenticated \
  --set-env-vars "BACKEND_URL=$BACKEND_URL,ADK_APP_NAME=$ADK_APP_NAME" \
  --timeout 3600 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5

URL="$(gcloud run services describe "$FRONTEND_SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
log "Frontend deployed: $URL"
