# GCS Upload Guide — Doctor Review Files

This guide walks you through uploading every `.txt` review file from `data/reviews/` into a Google Cloud Storage bucket, and then wiring it up to the `doctor_rag_agent`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| `gcloud` CLI installed | [Install guide](https://cloud.google.com/sdk/docs/install) |
| Authenticated session | `gcloud auth login` |
| Project set | `gcloud config set project arijit-de-1992` |
| Billing enabled on the project | Required for GCS + Vertex AI |

---

## Step 1 — Authenticate and configure the project

```bash
gcloud auth login
gcloud config set project arijit-de-1992
gcloud config set compute/region asia-south1
```

> [!NOTE]
> Your project is `arijit-de-1992` and preferred region is `asia-south1` (from your `.env`). You can use any region that supports Vertex AI RAG Engine (e.g. `us-central1`, `us-east4`). **The RAG corpus region must match** `GOOGLE_CLOUD_LOCATION` in your `.env`.

---

## Step 2 — Create the GCS bucket

Pick a globally unique bucket name (bucket names are global across all GCP projects).

```bash
# Set variables — adjust as needed
export PROJECT_ID="arijit-de-1992"
export REGION="asia-south1"           # Must match GOOGLE_CLOUD_LOCATION
export BUCKET_NAME="doctor-reviews-${PROJECT_ID}"   # e.g. doctor-reviews-arijit-de-1992

# Create the bucket
gcloud storage buckets create gs://${BUCKET_NAME} \
    --project=${PROJECT_ID} \
    --location=${REGION} \
    --uniform-bucket-level-access
```

> [!TIP]
> Using `--uniform-bucket-level-access` is the recommended security posture for Vertex AI integration — it simplifies IAM without per-object ACLs.

---

## Step 3 — Enable required Google Cloud APIs

```bash
gcloud services enable \
    storage.googleapis.com \
    aiplatform.googleapis.com \
    --project=${PROJECT_ID}
```

---

## Step 4 — Upload all review files

Your review files live in `data/reviews/` and follow the naming pattern:
`doctor_<id>_<name>_reviews.txt`

### Option A — Upload entire directory at once (recommended)

```bash
# From the project root (Doctor_Appointment_Scheduler/)
gcloud storage cp data/reviews/*.txt gs://${BUCKET_NAME}/doctor-reviews/
```

### Option B — Upload files one by one (for verification)

```bash
# Example for doctor ID 1
gcloud storage cp data/reviews/doctor_1_Arijit_De_reviews.txt \
    gs://${BUCKET_NAME}/doctor-reviews/

# Repeat for each of the 90 doctors, or use a loop:
for f in data/reviews/doctor_*.txt; do
    gcloud storage cp "$f" gs://${BUCKET_NAME}/doctor-reviews/
    echo "Uploaded: $f"
done
```

---

## Step 5 — Verify the upload

```bash
# List all uploaded files
gcloud storage ls gs://${BUCKET_NAME}/doctor-reviews/

# Count files (should be 90)
gcloud storage ls gs://${BUCKET_NAME}/doctor-reviews/ | wc -l
```

---

## Step 6 — Grant Vertex AI access to the bucket

The Vertex AI service account needs read access to import files into a RAG corpus.

```bash
export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")

# Grant the Vertex AI RAG service account read access
gcloud storage buckets add-iam-policy-binding gs://${BUCKET_NAME} \
    --member="serviceAccount:<YOUR SERVICE ACCOUNT EMAIL ID>" \
    --role="roles/storage.objectViewer"
```

> [!IMPORTANT]
> Without this step, the RAG corpus import step in `agent.py` will fail with a permissions error.

---

## Step 7 — Update your `.env` file

Add the following variables to your `.env` (or `export_env_vars.sh`):

```bash
# In .env
GCS_REVIEWS_BUCKET_URI=gs://doctor-reviews-arijit-de-1992/doctor-reviews/
RAG_CORPUS_DISPLAY_NAME=doctor_reviews_corpus
GOOGLE_CLOUD_LOCATION=us-central1    # Must match the bucket region if using a single-region bucket
```

> [!WARNING]
> `GOOGLE_CLOUD_LOCATION` in your current `.env` is set to `global`. Vertex AI RAG Engine requires a **specific region** (e.g. `us-central1`, `us-east4`, `asia-southeast1`). Update it before running the agent. If you created the bucket in `asia-south1`, use that for `GOOGLE_CLOUD_LOCATION` as well — provided Vertex AI RAG Engine is available there. Check the [supported regions](https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview#supported-regions).

---

## Step 8 — (Optional) Save the corpus resource name after first run

The first time the `doctor_rag_agent` starts, it will:
1. Create a RAG corpus in Vertex AI.
2. Import all 90 `.txt` files from GCS (this can take a few minutes).
3. Print the corpus resource name to stdout.

Copy the printed resource name and add it to `.env` so future restarts skip the expensive creation step:

```bash
# Example value printed by the agent:
RAG_CORPUS_RESOURCE_NAME=projects/arijit-de-1992/locations/us-central1/ragCorpora/1234567890
```

---

## Quick Reference — All commands in order

```bash
export PROJECT_ID="arijit-de-1992"
export REGION="us-central1"
export BUCKET_NAME="doctor-reviews-${PROJECT_ID}"

# 1. Auth + project setup
gcloud auth login
gcloud config set project ${PROJECT_ID}

# 2. Enable APIs
gcloud services enable storage.googleapis.com aiplatform.googleapis.com \
    --project=${PROJECT_ID}

# 3. Create bucket
gcloud storage buckets create gs://${BUCKET_NAME} \
    --project=${PROJECT_ID} --location=${REGION} \
    --uniform-bucket-level-access

# 4. Upload review files (from project root)
gcloud storage cp data/reviews/*.txt gs://${BUCKET_NAME}/doctor-reviews/

# 5. Verify
gcloud storage ls gs://${BUCKET_NAME}/doctor-reviews/ | wc -l

# 6. Grant Vertex AI access
export PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
gcloud storage buckets add-iam-policy-binding gs://${BUCKET_NAME} \
    --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-aiplatform-cc.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

# 7. Update .env then run the agent
adk run agents/doctor_rag_agent
```

---

## Troubleshooting

| Error | Likely cause | Fix |
|---|---|---|
| `403 Forbidden` on bucket creation | Missing `storage.buckets.create` IAM role | Run as owner or add `roles/storage.admin` to your account |
| `PERMISSION_DENIED` on RAG import | Vertex AI SA missing bucket access | Re-run Step 6 |
| `InvalidArgument: location` | Wrong/unsupported region for RAG Engine | Use `us-central1` or `us-east4` |
| Corpus already exists error | Re-running without `RAG_CORPUS_RESOURCE_NAME` | Set the env var from the printed corpus name |
