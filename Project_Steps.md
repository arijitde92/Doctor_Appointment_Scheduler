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

- Enables the Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud SQL Admin, Cloud Trace, Cloud Monitoring, Telemetry, Cloud Logging and Cloud Resource Manager APIs.
- Creates the `adk_sessions` database on the `doctor-db` instance. ADK creates its session tables on first use. `DB_USER` must have privileges on this database.
- Stores `DB_PASSWORD`, `COMPOSIO_API_KEY`, `MAPS_API_KEY` and the Google AI Studio key (`GOOGLE_API_KEY`, or `GEMINI_API_KEY` if that is unset) in Secret Manager (`db-password`, `composio-api-key`, `maps-api-key`, `gemini-api-key`) and grants `agent-sa` access to them.
- Creates the frontend service account `web-sa`, which has no project roles.
- Grants `agent-sa` the `roles/cloudtrace.agent` and `roles/monitoring.metricWriter` roles so the backend can write traces and metrics (see [Phase 10](#phase-10----observability-cloud-trace-cloud-monitoring-and-logs)).

#### 2. Deploy the backend (private)

```bash
bash deploy/deploy_backend.sh
```

[deploy_backend.sh](deploy/deploy_backend.sh) builds the root [Dockerfile](Dockerfile) with Cloud Build (`gcloud run deploy --source .`) and deploys it with these settings:

- `--service-account agent-sa@...` (Vertex AI, Cloud SQL client and Secret Manager access)
- `--no-allow-unauthenticated`
- `--add-cloudsql-instances PROJECT:REGION:doctor-db`. `backend/main.py` connects to `adk_sessions` through `/cloudsql/...` with `mysql+aiomysql`.
- Non-secret configuration through `--env-vars-file`, a YAML file generated from `.env`. Secrets come from `--set-secrets`.
- When `GOOGLE_GENAI_USE_VERTEXAI=false`, the agents call Gemini through Google AI Studio, and the `gemini-api-key` secret is passed as `GOOGLE_API_KEY`. The review tool always uses Vertex AI RAG Engine through `agent-sa`.
- `TRACE_TO_CLOUD=true` (default) exports agent traces to Cloud Trace, and `ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=false` (default) keeps conversation text out of them. `METRICS_TO_CLOUD=true` (default) exports token-usage and latency metrics to Cloud Monitoring. Override any of them in `.env`.
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
   Patient accounts, consultation logs and appointments go to `.careconnect_app.db` (SQLite) unless `INSTANCE_CONNECTION_NAME` or `APP_DB_URI` is set. Backend tests: `pip install -r backend/requirements-dev.txt` then `pytest backend`.
3. **Frontend** (Node 22+):

   ```bash
   cd frontend
   npm install
   npm run dev          # Vite on http://localhost:5173 + Express BFF on :8080 -> backend :8000
   ```

   Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start` (production build on :8080).

The ADK developer UI is still available locally for debugging: `adk web .` from the repo root, then pick the `agents` app.

Tracing and metrics are off locally by default. To send local runs to Cloud Trace or Cloud Monitoring, run `gcloud auth application-default login` first, then start the backend with `TRACE_TO_CLOUD=true` and/or `METRICS_TO_CLOUD=true`. Without Application Default Credentials the backend fails at startup when either is on. Local metrics take their region from `REGION` and report as `job="doctor-appointment-api-local"`, so they stay out of the dashboard.

## Phase 10 -- Observability (Cloud Trace, Cloud Monitoring and logs)

The deployed backend sends three kinds of telemetry:

- **Traces** ([Cloud Trace](https://cloud.google.com/trace/docs)): one trace per chat message, showing each agent step, LLM call and tool call with timings and token counts. Use these to look at one conversation.
- **Metrics** ([Cloud Monitoring](https://cloud.google.com/monitoring/docs)): ADK's GenAI metrics, aggregated into totals, averages and percentiles: token usage, LLM latency per response, agent, tool and turn latency. A dashboard shows them (see [Metrics and dashboard](#metrics-and-dashboard)).
- **Logs** (Cloud Logging): all three Cloud Run services send their logs automatically.

### How it is wired

- [backend/main.py](backend/main.py) passes `trace_to_cloud=TRACE_TO_CLOUD` to ADK's `get_fast_api_app`. ADK then adds a Cloud Trace exporter (`opentelemetry-exporter-gcp-trace`, listed in [backend/requirements.txt](backend/requirements.txt)) for project `GOOGLE_CLOUD_PROJECT`.
- With `METRICS_TO_CLOUD=true`, the same file installs an OpenTelemetry meter provider before the app is built. It uses the OTLP/HTTP exporter (`opentelemetry-exporter-otlp-proto-http`) to send ADK's metrics to the Telemetry API (`telemetry.googleapis.com`), which stores them in Cloud Monitoring. `opentelemetry-resourcedetector-gcp` labels the metrics with the Cloud Run service, region and instance.
- `FlushTelemetryMiddleware` in the same file exports telemetry before each response's last chunk. Cloud Run throttles CPU as soon as a response ends, so without this the exporters' background threads never run and nothing arrives. Spans are flushed on every response. Metrics are flushed at most every `METRICS_FLUSH_INTERVAL_S` seconds (default 10), because Cloud Monitoring rejects points for the same series written less than 5 s apart. The metric reader's own background export is turned off for the same reason. Metric values are cumulative, so a skipped flush loses nothing; the next one carries the totals. Both are flushed again when Cloud Run shuts the instance down. This keeps request-based billing; the alternative would be `--no-cpu-throttling`, which bills idle instance time.
- With tracing on, the backend defaults `OTEL_TRACES_SAMPLER` to `always_on`. Cloud Run adds a `traceparent` header to every request, usually marked "not sampled". OpenTelemetry's default sampler follows that parent, which would drop every agent span. Because the agent spans continue Cloud Run's trace ID, they appear in the same trace as Cloud Run's own request span.
- [deploy/setup_gcp.sh](deploy/setup_gcp.sh) enables the Cloud Trace, Cloud Monitoring, Telemetry, Logging and Resource Manager APIs, and grants `agent-sa` the `roles/cloudtrace.agent` and `roles/monitoring.metricWriter` roles. ADK looks the project up through the Resource Manager API at startup; without it, ADK logs a "Failed to look up the project's other identifier" warning.
- [deploy/deploy_backend.sh](deploy/deploy_backend.sh) sets `TRACE_TO_CLOUD=true`, `METRICS_TO_CLOUD=true` and `ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=false` on the service.
- [deploy/setup_monitoring.sh](deploy/setup_monitoring.sh) creates the `consultations_started` log-based metric and the dashboard.

| Setting | Default on Cloud Run | Effect |
|---|---|---|
| `TRACE_TO_CLOUD` | `true` | Export agent spans to Cloud Trace |
| `METRICS_TO_CLOUD` | `true` | Export ADK metrics to Cloud Monitoring |
| `METRICS_FLUSH_INTERVAL_S` | `10` | Minimum seconds between metric exports (never below 5.5) |
| `ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS` | `false` | Add prompts and model responses to spans. Off by default because conversations contain health needs and locations; anyone with Cloud Trace access could read them. |
| `OTEL_TRACES_SAMPLER` | `always_on` (set by `backend/main.py`) | Which messages are traced. With heavy traffic, set e.g. `OTEL_TRACES_SAMPLER=traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1` to keep 10%. Cloud Trace bills by spans ingested; a chat message produces roughly 10–30 spans. |

To change any of these, add it to `.env` and run `bash deploy/deploy_backend.sh` again.

### Metrics and dashboard

Create (or update) the dashboard once the backend is deployed:

```bash
bash deploy/setup_monitoring.sh
```

It prints the dashboard URL. You can also find it under Monitoring → Dashboards → **Doctor Appointment Scheduler - Agents and LLM**. The definition is [deploy/monitoring/dashboard.json](deploy/monitoring/dashboard.json); edit it and re-run the script to change the dashboard.

| Tile | What it shows |
|---|---|
| Consultations (24h) | New consultations: one per ADK session, i.e. each **New consultation** in the UI once its first message is sent |
| Total tokens (24h), Tokens by type, Tokens by agent | Input and output tokens across all Gemini calls, and which agent used them |
| Avg tokens per consultation (24h) | Total tokens ÷ consultations |
| LLM calls (24h) | Number of Gemini calls |
| Avg / p95 LLM latency, Avg LLM latency per response by agent, LLM latency percentiles | Latency of each Gemini response (`generate_content` call) |
| Chat message (turn) latency | Time from a user message to the final reply (average and p95) |
| Avg tool latency by tool | `find-doctors`, `compute_routes`, `query_doctor_reviews`, calendar tools, … |
| Input tokens served from cache (%) | Share of input tokens Gemini served from its implicit cache (billed at a lower rate) |
| Avg LLM calls per agent turn | How many Gemini calls each agent makes per turn |

Scorecards cover the last 24 hours. Charts follow the dashboard's time range.

**Sources:**

- **ADK metrics** (in Cloud Monitoring as `prometheus.googleapis.com/gen_ai.*`):

  | Metric | Measures | Split by |
  |---|---|---|
  | `gen_ai.client.token.usage` | Tokens per Gemini call (histogram) | `gen_ai.agent.name`, `gen_ai.token.type` (input / output), model |
  | `gen_ai.client.operation.duration` | Seconds per Gemini call (histogram) | agent, model |
  | `gen_ai.invoke_workflow.duration` | Seconds per chat message (histogram) | |
  | `gen_ai.invoke_agent.duration` | Seconds per agent turn (histogram) | agent |
  | `gen_ai.execute_tool.duration` | Seconds per tool call (histogram) | agent, `gen_ai.tool.name` |
  | `gen_ai.invoke_agent.inference_calls`, `gen_ai.invoke_agent.tool_calls` | Model and tool calls per agent turn (histogram) | agent |
  | `gen_ai.client.inference.usage.input_tokens`, `.output_tokens`, `.reasoning.output_tokens`, `.cache_read.input_tokens` | Token counters | model |

- **`consultations_started`:** a log-based counter matching ADK's `New session created` log line in `doctor-appointment-api`. It only counts from when it was created; there is no backfill.

The dashboard queries use PromQL. Metric names contain dots, so they are quoted, and the `job` label is the Cloud Run service name. Histograms expose `_sum`, `_count` and `_bucket` series:

```promql
# Total tokens in the last 24 h
sum(increase({"gen_ai.client.token.usage_sum", job="doctor-appointment-api"}[1d]))

# Average LLM latency per response, by agent
sum by ("gen_ai.agent.name") (increase({"gen_ai.client.operation.duration_sum", job="doctor-appointment-api"}[1h]))
  / sum by ("gen_ai.agent.name") (increase({"gen_ai.client.operation.duration_count", job="doctor-appointment-api"}[1h]))
```

Run your own queries in Monitoring → Metrics Explorer → PromQL, or use these for alerting policies, e.g. p95 LLM latency above 10 s, or daily tokens over a budget.

**Limits:**

- Metrics aren't split by session ID, since a series per conversation would be expensive. For one conversation's tokens and latency, use its trace (below).
- The review tool's own Gemini call (inside `query_doctor_reviews`) runs through the Vertex AI SDK, not ADK. Its tokens aren't counted; its time is in the tool's latency.
- Percentiles are estimated from histogram buckets, so p95 is approximate.

### What a trace contains

One trace per chat message (one ADK invocation):

| Span | What it shows | Useful attributes |
|---|---|---|
| `invoke_workflow root_agent` | The whole turn | `gen_ai.conversation.id` (the ADK session ID) |
| `invoke_agent <agent>` | Time spent in each agent (`root_agent`, `doctor_matcher`, `doctor_rag_agent`, `scheduler_agent`) | `gen_ai.agent.name`, `gen_ai.conversation.id` |
| `generate_content <model>` | One Gemini call | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.reasoning.output_tokens`, `gen_ai.usage.cache_read.input_tokens` (input tokens served from Gemini's implicit cache, billed at a lower rate), `gen_ai.request.model`, `gen_ai.agent.name`, `gen_ai.conversation.id` |
| `execute_tool <tool>` | One tool call, such as `find-doctors`, `compute_routes`, `query_doctor_reviews` or `transfer_to_agent` | `gen_ai.tool.name` |
| `MCP ...` | Calls to the MCP servers (Toolbox, Maps, Composio) | |

The review tool's own Gemini call (in [rag_tool.py](agents/tools/rag_tool/rag_tool.py), made through the Vertex AI SDK) is not a `generate_content` span. Its time is in the `execute_tool query_doctor_reviews` span, but its tokens are not counted.

### View traces

1. Open [Trace Explorer](https://console.cloud.google.com/traces/explorer) in project `doctor-appointment-1234`.
2. Filter by span name, e.g. `generate_content`, or by attribute, e.g. `gen_ai.conversation.id` = a session ID, to see one conversation's calls.
3. Open a trace for the waterfall view of the turn.

To find a conversation's session ID, open the app in the browser and check DevTools → Application → Local Storage → `careconnect.sessionId` (`careconnect.userId` holds the user ID).

You can also start from a log entry. Each Cloud Run request log entry has a `trace` field, and Logs Explorer links it to the trace. Traces can take a minute or two to appear in Trace Explorer searches; opening a trace by its ID works sooner.

The backend logs `First trace flush: ok=True in …` once after each deploy. That line confirms the export works. A `Trace flush did not finish within 10s` warning means spans may be delayed or lost.

### Token usage per conversation without Cloud Trace

Every model reply stored in the session (Cloud SQL `adk_sessions`) has a `usageMetadata` field (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`) and a `modelVersion`. Fetch the session from the private backend:

```bash
U=$(gcloud run services describe doctor-appointment-api --region $REGION --project $GOOGLE_CLOUD_PROJECT --format 'value(status.url)')
T=$(gcloud auth print-identity-token)
curl -s -H "Authorization: Bearer $T" "$U/apps/agents/users/<userId>/sessions/<sessionId>"
```

`GET $U/apps/agents/users/<userId>/sessions` lists a user's sessions.

### Logs

Cloud Run sends each service's stdout/stderr and an HTTP request log to Cloud Logging. Open a service in the Cloud Run console and use the **Logs** tab, or query them:

```bash
# Backend errors from the last day
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=doctor-appointment-api AND severity>=ERROR' \
  --project $GOOGLE_CLOUD_PROJECT --freshness=1d

# Request log: method, URL, status and latency
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=doctor-appointment-api AND log_id("run.googleapis.com/requests")' \
  --project $GOOGLE_CLOUD_PROJECT --limit=20 \
  --format='table(timestamp,httpRequest.requestMethod,httpRequest.requestUrl,httpRequest.status,httpRequest.latency)'
```

Change `service_name` to `doctor-appointment-web` or `toolbox` for the other services. The backend logs at `LOG_LEVEL` (default `INFO`). Python tracebacks are plain text, so each traceback line is a separate log entry.

References - <https://adk.dev/integrations/cloud-trace/> · <https://cloud.google.com/trace/docs/trace-explorer>

## Phase 11 -- Patient Accounts, Dashboard and Calendar Booking

Every consultation now belongs to a signed-in patient. The browser never sends a user id: the BFF resolves an HttpOnly session cookie to a user and uses that user's id for every backend and ADK call.

### Data model (Cloud SQL database `careconnect_app`)

Created by `deploy/setup_gcp.sh`; the backend creates the tables at startup ([backend/app_api/models.py](backend/app_api/models.py)).

| Table | Purpose |
|---|---|
| `users` | First/last name, phone, email (unique), current address, date of birth, Argon2 password hash |
| `auth_sessions` | One row per login: SHA-256 of the session token, expiry (12 h absolute, 2 h idle), revoked time, IP, user agent |
| `consultations` | One row per consultation (= ADK session id), linked to the user and the login session |
| `consultation_messages` | Full conversation log: patient messages, agent replies, tool calls and tool results |
| `appointments` | Appointments booked in the app: doctor, clinic, date, slot, status (`pending` / `confirmed` / `failed` / `cancelled`), Google Calendar link. A unique `slot_lock` prevents double-booking; unconfirmed holds expire after 30 minutes |

Conversation logging is an ADK plugin ([backend/app_api/log_plugin.py](backend/app_api/log_plugin.py)) loaded with `get_fast_api_app(extra_plugins=[...])`, so the agents are unchanged.

### API

The backend routes live under `/app-api` ([backend/app_api/routes.py](backend/app_api/routes.py)) and are only reachable through the BFF (the backend is private on Cloud Run). The BFF ([frontend/server/index.mjs](frontend/server/index.mjs)) exposes:

| Route | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | Create an account / sign in; sets the `cc_session` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS) |
| `POST /api/auth/logout`, `GET /api/auth/me` | Revoke the session and clear the cookie / current user |
| `POST /api/sessions`, `GET /api/sessions/:id`, `POST /api/chat` | Consultations, scoped to the signed-in user |
| `GET /api/consultations`, `GET /api/consultations/:id/messages` | Consultation history and transcripts |
| `GET/POST /api/appointments`, `PATCH /api/appointments/:id`, `GET /api/appointments/booked-slots` | Appointments and per-date slot occupancy |

State-changing requests from another origin are rejected, login is rate limited, and all `/api` responses and the SPA shell are sent with `Cache-Control: no-store`.

### Frontend

- Routes (React Router): `/` home, `/login`, `/register`, `/about`, `/contact`, and the signed-in `/dashboard` and `/consult`.
- Logging out revokes the session on the server, clears local data, signs out other tabs and replaces the history entry. Signed-in pages re-check the session on load, on back/forward-cache restores and when the tab becomes visible, so Back after logout lands on the login page.
- Booking: **Book at this clinic** → month calendar → time-slot pop-up → the slot is reserved (`pending`) → the scheduler agent creates the Google Calendar event → the appointment becomes `confirmed` (or `failed`, which frees the slot).
- Dashboard: appointment calendar with doctor names, details, consultation transcripts, and **Book again**, which starts a new consultation with that doctor pre-selected; the agent lists the doctor's clinics and the normal clinic → date → time flow follows.
- The contact address shown in the footer and on the Contact page is `CONTACT_EMAIL` in [frontend/src/config/catalog.ts](frontend/src/config/catalog.ts).

### Deploy

```bash
bash deploy/setup_gcp.sh        # creates the careconnect_app database (safe to re-run)
bash deploy/deploy_backend.sh   # passes APP_DB_NAME to the backend
bash deploy/deploy_frontend.sh
```
