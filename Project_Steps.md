# This guide describes how this project is created

## Phase 1 -- GCP Setup

### Create Project

1. Create a GCP Project called "abcd-project" with project id "abcd-project-1234" from <https://console.cloud.google.com>. Add proper billing account.
2. In glcoud CLI, make sure you are authenticated using `gcloud auth login` and set the project using `gcloud config set project abcd-project-1234`

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

`gcloud projects add-iam-policy-binding abcd-project-1234 --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com" --role="roles/aiplatform.user"`

`gcloud projects add-iam-policy-binding abcd-project-1234 --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com" --role="roles/cloudsql.client"`

`gcloud projects add-iam-policy-binding abcd-project-1234 --role="roles/storage.admin" --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com"`

`gcloud projects add-iam-policy-binding abcd-project-1234 --role="roles/run.admin" --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com"`

3. Download key

`gcloud iam service-accounts keys create key.json --iam-account=agent-sa@abcd-project-1234.iam.gserviceaccount.com`

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
pip install google-adk google-cloud-aiplatform fastapi uvicorn
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
        --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com" \
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
GOOGLE_CLOUD_PROJECT=<Your Project ID>
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
REGION=<Your Region>
DB_USER=<Non root user name>
DB_PASSWORD=<Password for non root user>
TOOLBOX_URL=http://127.0.0.1:5000
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
