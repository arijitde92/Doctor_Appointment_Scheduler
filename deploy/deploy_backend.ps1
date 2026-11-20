# Build & deploy the PRIVATE backend API service (FastAPI + ADK) to Cloud Run.
# PowerShell version of deploy_backend.sh; both deploy the same service the same way.
# Chat sessions (adk_sessions) and patient accounts / consultation logs /
# appointments (careconnect_app) are stored in Cloud SQL over the unix socket.
# Secrets come from Secret Manager (see setup_gcp.ps1).
#
# Usage (from the repo root):  .\deploy\deploy_backend.ps1   [-DryRun]
param([switch]$DryRun)
. (Join-Path $PSScriptRoot 'common.ps1')

$ToolboxUrl = Get-RequiredSetting 'TOOLBOX_URL' 'Set TOOLBOX_URL in .env to the deployed Toolbox Cloud Run URL'
$DbUser = Get-RequiredSetting 'DB_USER' 'Set DB_USER in .env'
$ComposioUserId = Get-RequiredSetting 'COMPOSIO_USER_ID' 'Set COMPOSIO_USER_ID in .env'
$UseVertex = Get-Setting 'GOOGLE_GENAI_USE_VERTEXAI' 'true'

# Non-secret runtime configuration -> YAML for --env-vars-file
# (Cloud Run expects YAML here, not the KEY=VALUE .env format.)
$envVars = [ordered]@{
  GOOGLE_CLOUD_PROJECT                 = $Project
  GOOGLE_CLOUD_LOCATION                = (Get-Setting 'GOOGLE_CLOUD_LOCATION' $Region)
  GOOGLE_GENAI_USE_VERTEXAI            = $UseVertex
  REGION                               = $Region
  TOOLBOX_URL                          = $ToolboxUrl
  GCS_REVIEWS_BUCKET_URI               = (Get-Setting 'GCS_REVIEWS_BUCKET_URI')
  RAG_CORPUS_DISPLAY_NAME              = (Get-Setting 'RAG_CORPUS_DISPLAY_NAME')
  RAG_CORPUS_RESOURCE_NAME             = (Get-Setting 'RAG_CORPUS_RESOURCE_NAME')
  COMPOSIO_USER_ID                     = $ComposioUserId
  DB_USER                              = $DbUser
  INSTANCE_CONNECTION_NAME             = $InstanceConnectionName
  SESSION_DB_NAME                      = $SessionDbName
  APP_DB_NAME                          = $AppDbName
  # Cloud Trace: on by default for the deployed backend. Message content stays
  # out of spans unless ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=true in .env.
  TRACE_TO_CLOUD                       = (Get-Setting 'TRACE_TO_CLOUD' 'true')
  ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS = (Get-Setting 'ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS' 'false')
  # Cloud Monitoring: ADK token-usage and latency metrics (on by default).
  METRICS_TO_CLOUD                     = (Get-Setting 'METRICS_TO_CLOUD' 'true')
}
$yaml = foreach ($key in $envVars.Keys) {
  $value = [string]$envVars[$key]
  if (-not $value) { continue }  # unset values are left out, as in deploy_backend.sh
  '{0}: "{1}"' -f $key, ($value.Replace('\', '\\').Replace('"', '\"'))
}

$secrets = "DB_PASSWORD=${SecretDbPassword}:latest,COMPOSIO_API_KEY=${SecretComposioApiKey}:latest,MAPS_API_KEY=${SecretMapsApiKey}:latest"
# Agents call Gemini through Google AI Studio unless GOOGLE_GENAI_USE_VERTEXAI
# is true. The RAG review tool always uses Vertex AI RAG Engine (via agent-sa).
if ($UseVertex -cmatch '^([Ff]alse|0)$') {
  $secrets += ",GOOGLE_API_KEY=${SecretGeminiApiKey}:latest"
}

$envFile = [IO.Path]::GetTempFileName()
try {
  Write-Utf8File $envFile (($yaml -join "`n") + "`n")
  if ($DryRun) { Write-Host "Env vars file:`n$($yaml -join "`n")" -ForegroundColor Yellow }

  Write-Step "Deploying $BackendService to $Project/$Region (private; sessions in $InstanceConnectionName/$SessionDbName)"
  Push-Location $RepoRoot
  try {
    Invoke-Gcloud run deploy $BackendService `
      --source . `
      --project $Project `
      --region $Region `
      --service-account $AgentSa `
      --no-allow-unauthenticated `
      --add-cloudsql-instances $InstanceConnectionName `
      --env-vars-file $envFile `
      --set-secrets $secrets `
      --timeout 3600 `
      --memory 1Gi `
      --cpu 1 `
      --cpu-boost `
      --min-instances 0 `
      --max-instances 5
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
}

if ($DryRun) { Write-Step 'Dry run finished; nothing was deployed.'; return }
$url = Get-GcloudOutput run services describe $BackendService --project $Project --region $Region --format 'value(status.url)'
Write-Step "Backend deployed: $url (private; requires an ID token). Next: .\deploy\deploy_frontend.ps1"
