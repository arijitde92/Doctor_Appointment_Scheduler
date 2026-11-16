# This guide describes how this project is created

## Phase 1 -- GCP Setup

### Create Project

1. Create a GCP Project called "doctor-appointment-scheduler" with project id "doctor-appointment-1234" from <https://console.cloud.google.com>. Add proper billing account.
2. In glcoud CLI, make sure you are authenticated using `gcloud auth login` and set the project using `gcloud config set project doctor-appointment-1234`

### Enable APIs

```bash
gcloud services enable \
aiplatform.googleapis.com \
run.googleapis.com \
sqladmin.googleapis.com \
storage.googleapis.com \
secretmanager.googleapis.com \
iam.googleapis.com \
compute.googleapis.com
```

### Create Service Account

1. `gcloud iam service-accounts create agent-sa`
2. Set roles

`gcloud projects add-iam-policy-binding doctor-appointment-1234 --member="serviceAccount:agent-sa@doctor-appointment-1234.iam.gserviceaccount.com" --role="roles/aiplatform.user"`

`gcloud projects add-iam-policy-binding doctor-appointment-1234 --member="serviceAccount:agent-sa@doctor-appointment-1234.iam.gserviceaccount.com" --role="roles/cloudsql.client"`

`gcloud projects add-iam-policy-binding doctor-appointment-1234 --role="roles/storage.admin" --member="serviceAccount:agent-sa@doctor-appointment-1234.iam.gserviceaccount.com"`

`gcloud projects add-iam-policy-binding doctor-appointment-1234 --role="roles/run.admin" --member="serviceAccount:agent-sa@doctor-appointment-1234.iam.gserviceaccount.com"`

3. Download key

`gcloud iam service-accounts keys create key.json --iam-account=agent-sa@doctor-appointment-1234.iam.gserviceaccount.com`

## Phase 2 -- GitHub + Project Setup

### GitHub repo creation

1. Go to <https://www.github.com> and create a repo called *Doctor_Appointment_Scheduler*
2. Clone the repo locally

### Local Directory structure creation

Create below directory structure

```text
Doctor_Appointment_Scheduler/
├── agents
│   ├── doctor_matcher
│   ├── root_agent
│   └── scheduler
├── api
│   └── main.py
├── configs
├── data
│   ├── reviews
│   └── seed_sql
├── README.md
├── requirements.txt
|── .gitignore.txt
└── tools
    ├── calendar_mcp
    ├── cloudsql_mcp
    ├── maps_mcp
    └── rag_tool
```

### Python Virtual Environment Creation

Create a virtual environment and activate it

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Phase 3 -- Database (Google Cloud SQL)

### Create Cloud SQL Instance

DB Instance Name: *doctor-db*

```bash
gcloud sql instances create doctor-db \
--database-version=MYSQL_8_0 \
--tier=db-f1-micro \
--region=asia-south1
```

### Create Database

Database Name: *doctor_data*
`gcloud sql databases create doctor_data --instance=doctor-db`

### Generate SQL Scripts to create data

`python data_creation_artifacts/generate_data.py`
This creates

1. create_tables.sql
2. insert_clinics.sql
3. insert_doctors.sql
4. insert_doctor_clinic.sql
5. insert_availability.sql
6. create_indexes.sql

inside `data/seed_sql`

### Populate data

1. Create GCS bucket (*gs://doctor-agent-sql-seed*) to first upload the .sql files to that bucket

```bash
gcloud storage buckets create gs://doctor-agent-sql-seed --location=asia-south1
```

2. Give `Storage Object Admin` role to your service account (*agent-sa*) created earlier

gcloud command:

```bash
gcloud storage buckets add-iam-policy-binding gs://doctor-agent-sql-seed \
        --member="serviceAccount:agent-sa@doctor-appointment-1234.iam.gserviceaccount.com" \
        --role="roles/storage.objectAdmin"
```

3. Upload the .sql files into *gs://doctor-agent-sql-seed* bucket

```bash
gcloud storage cp data/seed_sql/create_tables.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_clinics.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_doctors.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_doctor_clinic.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_availability.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/create_indices.sql gs://doctor-agent-sql-seed/
```

4. Import the files into Cloud SQL from the bucket location

Run the below commands to execute the previous sql scripts

```bash
gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/create_tables.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_clinics.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_doctors.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_doctor_clinic.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_availability.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/create_indices.sql --database=doctor_data
```

5. Remove Bucket (OPTIONAL)

```bash
gcloud storage rm -r gs://doctor-agent-sql-seed
```

You can use [populate_data.sh](data/seed_sql/populate_data.sh) script that performs all the above steps.

## Phase 4 -- Setting Up Cloud SQL MCP

### Create .env file

Populate the below values

```text
GOOGLE_CLOUD_PROJECT=<YOUR PROJECT ID>
GOOGLE_CLOUD_LOCATION=<YOUR REGION>
GOOGLE_GENAI_USE_VERTEXAI=true
REGION=<Same as GOOGLE_CLOUD_LOCATION>
DB_USER=<YOUR DB USERNAME>
DB_PASSWORD=<YOUR DB PASSWORD>
TOOLBOX_URL=http://127.0.0.1:5000
MAPS_API_KEY=<YOUR MAPS API KEY>
GEMINI_API_KEY=<YOUR GEMINI API KEY>
GOOGLE_API_KEY=<Same as GEMINI_API_KEY>
COMPOSIO_API_KEY=<YOUR COMPOSIO API KEY>
COMPOSIO_USER_ID=<YOUR COMPOSIO USER ID>
```

### Download MCP Toolbox

```bash
curl -O https://storage.googleapis.com/genai-toolbox/v0.27.0/linux/amd64/toolbox
chmod +x toolbox
```

### Create tools.yaml for MySQL

Create a file named [tools.yaml](tools/cloudsql_mcp/tools.yaml) in the tools/cloudsql_mcp directory.

### Start toolbox locally and verify it

```bash
export GOOGLE_CLOUD_PROJECT=<Your Project ID>
export GOOGLE_CLOUD_LOCATION=global
export GOOGLE_GENAI_USE_VERTEXAI=true
export DB_USER=<your-mysql-user>
export DB_PASSWORD=<your-mysql-password>
export REGION=<your-cloud-sql-and-cloud-run-region>

./toolbox --tools-file tools/cloudsql_mcp/tools.yaml &
```

#### Test a tool

```bash
curl -s -X POST http://localhost:5000/api/tool/find-doctors/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "specialization": "Cardiology",
    "city": "Kolkata"
  }' | python3 -m json.tool
```

References

1. <https://codelabs.developers.google.com/agentic-rag-toolbox-cloudsql#0>
2. <https://codelabs.developers.google.com/travel-agent-mcp-toolbox-adk#0>

## Phase 5 -- Setting Up Agentic RAG

### Create Doctor Reviews

Use [generate_reviews.py](data_creation_artifacts/generate_doctor_reviews.py) to generate doctor reviews.

### Create GCS Bucket and upload Reviews

See [gcs_upload_guide](gcs_upload_guide.md) on how to create GCS bucket and upload the reviews

### Create RAG Tool

See [rag_tool.py](tools/rag_tool/rag_tool.py)

### Create rag agent

See [doctor_rag_agent](agents/doctor_rag_agent)

## Phase 6 -- Setting Up Google Maps MCP

### Enable Maps APIs

Enable the Maps Grounding Lite (MCP) API and the API Keys service:

```bash
gcloud services enable mapstools.googleapis.com
gcloud services enable apikeys.googleapis.com
```

Enable MCP access for the Maps tools service:

```bash
gcloud beta services mcp enable mapstools.googleapis.com --project=$GOOGLE_CLOUD_PROJECT
```

### Create API Key

Create an API key restricted to the Maps Grounding Lite MCP service:

```bash
gcloud alpha services api-keys create \
  --display-name="doctor-maps-key" \
  --api-target=service=mapstools.googleapis.com \
  --format=json
```

Copy the `keyString` value from the output. This is your `MAPS_API_KEY`.

### Update .env file

Add the Maps API key to your `.env` file:

```text
MAPS_API_KEY=<your-maps-api-key>
```

Or export it directly:

```bash
export MAPS_API_KEY=<your-maps-api-key>
```

### Create Maps MCP Tool

See [tools.py](tools/maps_mcp/tools.py) — connects to the Google Maps Grounding Lite MCP endpoint (`https://mapstools.googleapis.com/mcp`) using `MCPToolset` with the `MAPS_API_KEY` for authentication. Provides access to `compute_routes`, `search_places`, and `lookup_weather` tools.

### Add Clinic Location Tool

A new `get-clinic-location` tool was added to [tools.yaml](tools/cloudsql_mcp/tools.yaml) to fetch the full address of a clinic by its ID. This is used as the destination when computing travel routes.

### Update Doctor Matcher Agent

The [doctor_matcher agent](agents/doctor_matcher/agent.py) now integrates both Cloud SQL tools and the Google Maps MCP toolset. When the user's location is provided, it uses `get-clinic-location` to fetch clinic addresses and `compute_routes` to compute distances and travel durations, then sorts results by proximity.

### Update Root Agent

The [root agent](agents/root_agent/agent.py) now asks the user for their current location (optional) before searching for doctors. If shared, the location is passed to `doctor_matcher` for distance computation. If declined, distance features are skipped.

### Verify Maps MCP

You can verify the Maps MCP endpoint is reachable by testing with a simple curl:

```bash
curl -X POST https://mapstools.googleapis.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $MAPS_API_KEY" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "id": 1}'
```

References

1. <https://developers.google.com/maps/ai/grounding-lite>
2. <https://github.com/google/mcp/tree/main/examples/launchmybakery>

## Phase 7 -- Setting Up Google Calendar MCP (Composio)

The Scheduler Agent uses the [Composio](https://composio.dev) MCP Tool Router to create Google Calendar events for doctor appointments.

### External Setup Steps

#### 1. Create a Composio Account

1. Go to <https://platform.composio.dev> and sign up / sign in.
2. Navigate to **Settings → API Keys** and create (or copy) your API key.

#### 2. Connect Google Calendar

1. In the Composio dashboard, go to the **Marketplace** and find **Google Calendar**.
2. Click **Connect** and complete the Google OAuth flow to authorize calendar access.
3. This is a one-time setup — Composio handles token refresh automatically.

#### 3. Update `.env` file

Add the following environment variables to your `.env` file if not already added:

```text
COMPOSIO_API_KEY=<your-composio-api-key>
COMPOSIO_USER_ID=<your-user-id>
```

- `COMPOSIO_API_KEY` — Your API key from the Composio dashboard Settings page.
- `COMPOSIO_USER_ID` — A stable user identifier for the Composio session (e.g., your username or email).

#### 4. Install dependency

```bash
pip install composio composio_google_adk
```

### Project Structure

- **Scheduler Agent**: [agents/scheduler_agent/agent.py](agents/scheduler_agent/agent.py) — The ADK agent that receives appointment details from the root agent and creates Google Calendar events.
- **Calendar MCP Tool**: [tools/calendar_mcp/tools.py](tools/calendar_mcp/tools.py) — Creates a Composio session scoped to the `googlecalendar` toolkit and returns an `McpToolset` that the scheduler agent uses for tool calls.

### How It Works

1. On startup, `tools/calendar_mcp/tools.py` initializes a Composio client, creates a session for the `googlecalendar` toolkit, and obtains an MCP URL.
2. The MCP URL is wrapped in an ADK `McpToolset` with `StreamableHTTPConnectionParams`.
3. The scheduler agent uses this toolset to search for Google Calendar actions and execute them (e.g., create events).
4. The root agent collects all appointment details (doctor name, specialization, clinic name, clinic address, date, time) and delegates to the scheduler agent with a structured message.

### Verify

Run the agent system and test a full booking flow:

```bash
# Run from the project root (not inside agents/)
adk web agents
```

Then walk through: search for doctor → select → check availability → book appointment. A Google Calendar event should be created with the appointment details.

References

1. <https://docs.composio.dev/docs/providers/google-adk>
2. <https://composio.dev/toolkits/googlecalendar/framework/google-adk>
3. <https://docs.composio.dev/toolkits/googlecalendar>

## Phase 8 -- Cloud Run Deployment
### Upload tools.yaml to Secret Manager
```bash
gcloud secrets create tools-yaml --data-file=agents/tools/cloudsql_mcp/tools.yaml
```

### Add Secret Accessor Permission to Service Account
```bash
export PROJECT_ID=$(gcloud config get-value project)

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:agent-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Deploy Toolbox to Cloud Run using official Toolbox Image
```bash
# Load variables again just in case
set -a
source .env
set +a

export IMAGE="us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:latest"

gcloud run deploy toolbox \
  --image $IMAGE \
  --service-account "agent-sa@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --region $REGION \
  --set-secrets "/app/tools.yaml=tools-yaml:latest" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},REGION=${REGION},DB_USER=${DB_USER},DB_PASSWORD=${DB_PASSWORD}" \
  --args="--config=/app/tools.yaml","--address=0.0.0.0","--port=8080" \
  --allow-unauthenticated
```

**Note the Toolbox URL and update the `TOOLBOX_URL` in your `.env` file.**

In my case it is <https://toolbox-173427564927.asia-south1.run.app>

Reference - <https://mcp-toolbox.dev/documentation/deploy-to/cloud-run/>

### Deploy the App to Cloud Run (backend + frontend)

The app runs as **two Cloud Run services**:

| Service | What it runs | Access |
|---|---|---|
| `doctor-appointment-api` | [backend/main.py](backend/main.py): FastAPI + Google ADK API server (no dev UI). Sessions are stored in Cloud SQL. | **Private** (`--no-allow-unauthenticated`) |
| `doctor-appointment-web` | [frontend/](frontend): React UI + a small Express server that serves it and proxies `/api/*` to the backend with a Google ID token. | Public |

```text
Browser ──▶ doctor-appointment-web (public)
              Express BFF: /api/sessions, /api/chat (SSE)  ── ID token (web-sa) ──▶
            doctor-appointment-api (private, agent-sa)
              ADK agents ──▶ Toolbox (Cloud SQL) · Maps MCP · Vertex AI RAG · Composio Calendar
              ADK sessions ──▶ Cloud SQL doctor-db / adk_sessions (unix socket)
```

The browser can only reach three narrow endpoints on the frontend, never the ADK API directly. The backend accepts requests only from the frontend's service account (`roles/run.invoker`).

All deploy scripts read the `.env` file described in Phase 4. Make sure it also contains:

```text
TOOLBOX_URL=<URL of the toolbox Cloud Run service deployed above>
RAG_CORPUS_RESOURCE_NAME=<corpus resource name printed in Phase 5>
GCS_REVIEWS_BUCKET_URI=<gs:// URI of the reviews>
```

The scripts pass `--project` explicitly using `GOOGLE_CLOUD_PROJECT`, so they don't depend on your active `gcloud config` project.

#### 1. One-time setup

```bash
bash deploy/setup_gcp.sh
```

[setup_gcp.sh](deploy/setup_gcp.sh) does the following, and is safe to re-run:

- Enables the Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Cloud SQL Admin APIs.
- Creates the `adk_sessions` database on the `doctor-db` instance. ADK creates its session tables on first use. `DB_USER` must have privileges on this database.
- Stores `DB_PASSWORD`, `COMPOSIO_API_KEY` and `MAPS_API_KEY` in Secret Manager (`db-password`, `composio-api-key`, `maps-api-key`) and grants `agent-sa` access to them.
- Creates the frontend service account `web-sa`, which has no project roles.

#### 2. Deploy the backend (private)

```bash
bash deploy/deploy_backend.sh
```

[deploy_backend.sh](deploy/deploy_backend.sh) builds the root [Dockerfile](Dockerfile) with Cloud Build (`gcloud run deploy --source .`) and deploys it with these settings:

- `--service-account agent-sa@...` (Vertex AI, Cloud SQL client and Secret Manager access)
- `--no-allow-unauthenticated`
- `--add-cloudsql-instances PROJECT:REGION:doctor-db`. `backend/main.py` connects to `adk_sessions` through `/cloudsql/...` with `mysql+aiomysql`.
- Non-secret configuration through `--env-vars-file`, a YAML file generated from `.env`. Secrets come from `--set-secrets`.
- `--timeout 3600`, so long agent runs can stream over SSE.

#### 3. Deploy the frontend (public)

```bash
bash deploy/deploy_frontend.sh
```

[deploy_frontend.sh](deploy/deploy_frontend.sh) works in three steps:

1. It looks up the backend URL.
2. It grants `web-sa` the `roles/run.invoker` role on the backend.
3. It deploys [frontend/Dockerfile](frontend/Dockerfile) with `BACKEND_URL` and `ADK_APP_NAME=agents`.

The Express server mints and refreshes the ID token automatically with `google-auth-library`.

#### 4. Verify

```bash
# The backend must reject unauthenticated calls (expect 403)
curl -s -o /dev/null -w "%{http_code}
" "$(gcloud run services describe doctor-appointment-api --region $REGION --format 'value(status.url)')/list-apps"

# The frontend is public
gcloud run services describe doctor-appointment-web --region $REGION --format 'value(status.url)'
```

Open the frontend URL and go through the full flow: search, reviews, open slots and booking. Reload the page mid-conversation. The chat is restored from Cloud SQL.

#### 5. Retire the old ADK dev-UI service (optional)

The earlier `adk deploy cloud_run --with_ui` service is no longer needed once the new services are verified:

```bash
gcloud run services delete doctor-appointment-app --region $REGION
```

Reference - <https://adk.dev/deploy/cloud-run/> · <https://cloud.google.com/run/docs/authenticating/service-to-service>

## Phase 9 -- Local Development

1. **Toolbox**: either run `./toolbox --tools-file agents/tools/cloudsql_mcp/tools.yaml` locally (`TOOLBOX_URL=http://127.0.0.1:5000`) or point `TOOLBOX_URL` at the deployed toolbox.
2. **Backend** (from the repo root, with the venv active and `gcloud auth application-default login` done):

   ```bash
   pip install -r requirements.txt
   uvicorn backend.main:app --port 8000
   ```

   Without `INSTANCE_CONNECTION_NAME` or `SESSION_SERVICE_URI`, sessions are stored in a local SQLite file (`.adk_sessions.db`).
3. **Frontend** (Node 22+):

   ```bash
   cd frontend
   npm install
   npm run dev          # Vite on http://localhost:5173 + Express BFF on :8080 -> backend :8000
   ```

   Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start` (production build on :8080).

The ADK developer UI is still available locally for debugging: `adk web .` from the repo root, then pick the `agents` app.
