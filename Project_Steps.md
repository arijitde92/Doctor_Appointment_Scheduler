# This guide describes how this project is created
## Phase 1 -- GCP Setup
### Create Project
1. Create a GCP Project called "abcd-project" with project id "abcd-project-1234" from https://console.cloud.google.com. Add proper billing account.
2. In glcoud CLI, make sure you are authenticated using `gcloud auth login` and set the project using `gcloud config set project abcd-project-1234`

### Enable APIs
```
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

2. Download key

`gcloud iam service-accounts keys create key.json --iam-account=agent-sa@abcd-project-1234.iam.gserviceaccount.com`

## Phase 2 -- GitHub + Project Setup
### GitHub repo creation
1. Go to https://www.github.com and create a repo called *Doctor_Appointment_Scheduler*
2. Clone the repo locally

### Local Directory structure creation
Create below directory structure
```
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
```
python -m venv venv
source venv/bin/activate
pip install google-adk google-cloud-aiplatform fastapi uvicorn
```

## Phase 3 -- Database (Google Cloud SQL)
### Create Cloud SQL Instance

DB Instance Name: _doctor-db_
```
gcloud sql instances create doctor-db \
--database-version=MYSQL_8_0 \
--tier=db-f1-micro \
--region=asia-south1
```
### Create Database

Database Name: _doctor_data_
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
1. Create GCS bucket (_gs://doctor-agent-sql-seed_) to first upload the .sql files to that bucket
```
gcloud storage buckets create gs://doctor-agent-sql-seed --location=asia-south1
```
2. Give `Storage Object Admin` role to your service account (_agent-sa_) created earlier

gcloud command:
```
gcloud storage buckets add-iam-policy-binding gs://doctor-agent-sql-seed \
        --member="serviceAccount:agent-sa@abcd-project-1234.iam.gserviceaccount.com" \
        --role="roles/storage.objectAdmin"
```
3. Upload the .sql files into _gs://doctor-agent-sql-seed_ bucket
```
gcloud storage cp data/seed_sql/create_tables.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_clinics.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_doctors.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_doctor_clinic.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/insert_availability.sql gs://doctor-agent-sql-seed/
gcloud storage cp data/seed_sql/create_indices.sql gs://doctor-agent-sql-seed/
```

4. Import the files into Cloud SQL from the bucket location

Run the below commands to execute the previous sql scripts
```
gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/create_tables.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_clinics.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_doctors.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_doctor_clinic.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/insert_availability.sql --database=doctor_data

gcloud sql import sql doctor-db gs://doctor-agent-sql-seed/create_indices.sql --database=doctor_data
```

5. Remove Bucket (OPTIONAL)

```
gcloud storage rm -r gs://doctor-agent-sql-seed
```

You can use [populate_data.sh](data/seed_sql/populate_data.sh) script that performs all the above steps.