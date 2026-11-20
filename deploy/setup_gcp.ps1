# One-time (safe to re-run) Google Cloud setup for the two-service deployment.
# PowerShell version of setup_gcp.sh:
#   - enables the APIs needed for source deploys
#   - creates the Cloud SQL databases for ADK chat sessions and for the app
#     (patient accounts, login sessions, consultation logs, appointments)
#   - stores backend secrets in Secret Manager
#   - creates the frontend service account (web-sa)
#   - lets the backend (agent-sa) write traces to Cloud Trace and metrics to
#     Cloud Monitoring (dashboard: .\deploy\setup_monitoring.ps1)
#
# Usage (from the repo root):  .\deploy\setup_gcp.ps1   [-DryRun]
param([switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

$DbUser = Get-Setting 'DB_USER' '?'

Write-Step "Enabling APIs in $Project"
Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  secretmanager.googleapis.com sqladmin.googleapis.com iam.googleapis.com cloudtrace.googleapis.com `
  monitoring.googleapis.com telemetry.googleapis.com logging.googleapis.com `
  cloudresourcemanager.googleapis.com --project $Project
# cloudresourcemanager: ADK's telemetry looks up the project number at startup
# (otherwise it logs a "Failed to look up the project's other identifier" warning).

Write-Step "Creating Cloud SQL database '$SessionDbName' on instance '$DbInstance' (ADK sessions)"
if (Test-Gcloud sql databases describe $SessionDbName --instance $DbInstance --project $Project) {
  Write-Host 'Database already exists.'
} else {
  Invoke-Gcloud sql databases create $SessionDbName --instance $DbInstance --project $Project
}
Write-Host "ADK creates its tables on first use. DB_USER ($DbUser) needs privileges on '$SessionDbName'."

Write-Step "Creating Cloud SQL database '$AppDbName' on instance '$DbInstance' (accounts, consultation logs, appointments)"
if (Test-Gcloud sql databases describe $AppDbName --instance $DbInstance --project $Project) {
  Write-Host 'Database already exists.'
} else {
  Invoke-Gcloud sql databases create $AppDbName --instance $DbInstance --project $Project --charset utf8mb4
}
Write-Host "The backend creates its tables at startup. DB_USER ($DbUser) needs privileges on '$AppDbName'."

# The value goes through a temporary file: piping a string to a native command
# in PowerShell 5.1 appends a newline, which would end up inside the secret.
function Set-Secret([string]$Name, [string]$Value) {
  if (-not $Value) {
    Write-Host "Skipping secret $Name (value not set in .env)"
    return
  }
  $exists = Test-Gcloud secrets describe $Name --project $Project
  $tmp = [IO.Path]::GetTempFileName()
  try {
    if (-not $DryRun) { Write-Utf8File $tmp $Value }
    if ($exists) {
      Invoke-Gcloud secrets versions add $Name "--data-file=$tmp" --project $Project | Out-Null
      Write-Host "Added a new version to secret $Name"
    } else {
      Invoke-Gcloud secrets create $Name "--data-file=$tmp" --replication-policy=automatic --project $Project | Out-Null
      Write-Host "Created secret $Name"
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
  Invoke-Gcloud secrets add-iam-policy-binding $Name --member "serviceAccount:$AgentSa" `
    --role roles/secretmanager.secretAccessor --project $Project | Out-Null
}

Write-Step 'Storing backend secrets in Secret Manager'
Set-Secret $SecretDbPassword (Get-Setting 'DB_PASSWORD')
Set-Secret $SecretComposioApiKey (Get-Setting 'COMPOSIO_API_KEY')
Set-Secret $SecretMapsApiKey (Get-Setting 'MAPS_API_KEY')
Set-Secret $SecretGeminiApiKey (Get-Setting 'GOOGLE_API_KEY' (Get-Setting 'GEMINI_API_KEY'))

Write-Step "Creating frontend service account $WebSa"
if (Test-Gcloud iam service-accounts describe $WebSa --project $Project) {
  Write-Host 'Service account already exists.'
} else {
  Invoke-Gcloud iam service-accounts create $WebSaName --display-name 'Doctor Appointment web frontend' --project $Project
}

Write-Step "Granting $AgentSa permission to write Cloud Trace spans and Cloud Monitoring metrics"
foreach ($role in 'roles/cloudtrace.agent', 'roles/monitoring.metricWriter') {
  Invoke-Gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$AgentSa" `
    --role $role --condition=None | Out-Null
}

Write-Step 'Setup complete. Next: .\deploy\deploy_backend.ps1'
