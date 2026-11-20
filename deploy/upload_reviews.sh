#!/usr/bin/env bash
# Upload data/reviews/*.txt to the reviews bucket and import them into the
# Vertex AI RAG corpus used by the doctor_rag_agent.
#
# - GCS: `gcloud storage rsync` copies new/changed files; --delete also removes
#   bucket files that no longer exist locally.
# - RAG: ImportRagFiles on the bucket folder. Files already imported and
#   unchanged (same chunking) are skipped, so only new/changed reviews are
#   embedded. Chunking must match rag_tool.py (512 tokens, 100 overlap).
#
# Needs in .env: GCS_REVIEWS_BUCKET_URI, RAG_CORPUS_RESOURCE_NAME, GOOGLE_CLOUD_LOCATION.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

: "${GCS_REVIEWS_BUCKET_URI:?Set GCS_REVIEWS_BUCKET_URI in .env}"
: "${RAG_CORPUS_RESOURCE_NAME:?Set RAG_CORPUS_RESOURCE_NAME in .env}"
: "${GOOGLE_CLOUD_LOCATION:?Set GOOGLE_CLOUD_LOCATION in .env (RAG Engine region)}"
PY="$(command -v python3 || command -v python)"
API="https://${GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com/v1beta1"
DELETE_FLAG=()
[[ "${1:-}" == "--delete" ]] && DELETE_FLAG=(--delete-unmatched-destination-objects)

log "Syncing data/reviews to ${GCS_REVIEWS_BUCKET_URI}"
# --checksums-only: a fresh git checkout changes mtimes; comparing hashes avoids
# re-uploading identical files (which would also make RAG re-embed them).
gcloud storage rsync "$REPO_ROOT/data/reviews" "${GCS_REVIEWS_BUCKET_URI%/}" \
  --project "$PROJECT" --checksums-only "${DELETE_FLAG[@]}"

log "Importing ${GCS_REVIEWS_BUCKET_URI} into ${RAG_CORPUS_RESOURCE_NAME}"
TOKEN="$(gcloud auth print-access-token)"
BODY=$(cat <<EOF
{"import_rag_files_config": {
  "gcs_source": {"uris": ["${GCS_REVIEWS_BUCKET_URI}"]},
  "rag_file_transformation_config": {"rag_file_chunking_config": {"fixed_length_chunking": {"chunk_size": 512, "chunk_overlap": 100}}},
  "max_embedding_requests_per_min": 900}}
EOF
)
OP=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$BODY" "$API/${RAG_CORPUS_RESOURCE_NAME}/ragFiles:import" \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin); print(d.get('name') or sys.exit(json.dumps(d)))")
echo "Operation: $OP"

while true; do
  sleep 30
  TOKEN="$(gcloud auth print-access-token)"
  STATE=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/$OP")
  if echo "$STATE" | "$PY" -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('done') else 1)"; then
    echo "$STATE" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('error') or d.get('response'), indent=2))"
    break
  fi
  echo "  ...still importing ($(date +%H:%M:%S))"
done
log "Review upload and RAG import finished"
