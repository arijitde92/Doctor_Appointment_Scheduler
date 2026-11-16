#!/usr/bin/env bash
# Cloud Monitoring for the agents (safe to re-run):
#   - log-based metric `consultations_started`: one per new ADK session, i.e.
#     each "New consultation" in the UI once its first message is sent
#     (counts from the moment the metric is created; no backfill)
#   - dashboard "Doctor Appointment Scheduler - Agents and LLM" from
#     deploy/monitoring/dashboard.json (token usage, LLM / agent / tool latency)
#
# The ADK metrics themselves come from the backend (METRICS_TO_CLOUD=true, set
# by deploy_backend.sh; agent-sa needs roles/monitoring.metricWriter, granted by
# setup_gcp.sh).
#
# Usage (from the repo root):  bash deploy/setup_monitoring.sh
source "$(dirname "$0")/common.sh"

PY="$(command -v python3 || command -v python || true)"
[[ -n "$PY" ]] || { echo "python3 is required to render the dashboard JSON" >&2; exit 1; }

LOG_METRIC="consultations_started"
LOG_FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$BACKEND_SERVICE\" AND textPayload:\"New session created\""
DASHBOARD_SRC="$REPO_ROOT/deploy/monitoring/dashboard.json"

log "Log-based metric $LOG_METRIC"
if gcloud logging metrics describe "$LOG_METRIC" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud logging metrics update "$LOG_METRIC" --project "$PROJECT" --log-filter "$LOG_FILTER" \
    --description "New consultations (ADK sessions created) in $BACKEND_SERVICE" >/dev/null
  echo "Updated."
else
  gcloud logging metrics create "$LOG_METRIC" --project "$PROJECT" --log-filter "$LOG_FILTER" \
    --description "New consultations (ADK sessions created) in $BACKEND_SERVICE" >/dev/null
  echo "Created."
fi

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT
sed "s/__SERVICE__/$BACKEND_SERVICE/g" "$DASHBOARD_SRC" > "$RENDERED"
DISPLAY_NAME="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["displayName"])' "$RENDERED")"

log "Dashboard \"$DISPLAY_NAME\""
EXISTING="$(gcloud monitoring dashboards list --project "$PROJECT" \
  --filter "displayName=\"$DISPLAY_NAME\"" --format 'value(name)' | head -n1)"
if [[ -n "$EXISTING" ]]; then
  # Updates need the current etag in the config.
  ETAG="$(gcloud monitoring dashboards describe "$EXISTING" --project "$PROJECT" --format 'value(etag)')"
  "$PY" - "$RENDERED" "$ETAG" <<'EOF'
import json, sys
path, etag = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    cfg = json.load(f)
cfg["etag"] = etag
with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f)
EOF
  gcloud monitoring dashboards update "$EXISTING" --project "$PROJECT" --config-from-file "$RENDERED" >/dev/null
  DASHBOARD="$EXISTING"
  echo "Updated."
else
  DASHBOARD="$(gcloud monitoring dashboards create --project "$PROJECT" --config-from-file "$RENDERED" --format 'value(name)')"
  echo "Created."
fi

log "Done: https://console.cloud.google.com/monitoring/dashboards/builder/${DASHBOARD##*/}?project=$PROJECT"
